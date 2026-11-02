import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir, userInfo } from "node:os";
import { delimiter, dirname, join } from "node:path";

import { kitelineHome, localAddress } from "./auth";
import { accent, bold, dim } from "./banner";
import { readSettings, SettingsError } from "./config";

/**
 * `kiteline service`: Kiteline as a systemd user service, written for this computer, so it starts with
 * it, restarts if it stops, and keeps going after you log out. What the docs once listed as steps.
 */

// Another name lets a second Kiteline run beside the first, on its own port.
const NAME = process.env.KITELINE_SERVICE_NAME?.trim() || "kiteline";
const MARK = "# Written by `kiteline service install`. Run it again to change these settings.";
/** The settings worth keeping in the service, when they're set now. Never a key. */
const KEPT = [
	"PORT",
	"HOST",
	"KITELINE_PUBLIC_URL",
	"KITELINE_RELAY",
	"KITELINE_HOME",
	"CLAUDE_PATH",
	"KITELINE_ALLOW_BYPASS",
	"KITELINE_MAX_SESSIONS",
	"KITELINE_IDLE_MINUTES",
] as const;

/** A label and a command, lined up with the others. */
const row = (label: string, value: string) => `${dim(label.padEnd(22))}${value}`;

function say(...lines: string[]) {
	console.log(["", ...lines.map((line) => (line ? `  ${line}` : "")), ""].join("\n"));
}

function fail(...lines: string[]): never {
	console.error(
		["", ...lines.map((line, i) => (i === 0 ? `  ${accent("◆")}  ${line}` : `     ${line}`)), ""].join("\n"),
	);
	process.exit(1);
}

function systemctl(...args: string[]) {
	return spawnSync("systemctl", ["--user", ...args], { encoding: "utf8" });
}

function unitFile() {
	const config = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(config, "systemd", "user", `${NAME}.service`);
}

function requireSystemd() {
	if (process.platform !== "linux") {
		fail(
			"Setting Kiteline up to run in the background works on Linux so far.",
			`Here, keep ${bold("kiteline")} running in a terminal window.`,
		);
	}
	if (systemctl("show-environment").status !== 0) {
		fail(
			"This computer doesn't run systemd's user services, which the background service needs.",
			`Keep ${bold("kiteline")} running in a terminal window instead.`,
		);
	}
}

/** systemd reads % and, in commands, $ as its own; a quoted value keeps spaces. */
function quote(value: string, { command = false } = {}) {
	let out = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%");
	if (command) out = out.replaceAll("$", () => "$$");
	return `"${out}"`;
}

/** The folders Claude Code's Bash tool should find tools in: the ones this terminal has, less throwaways. */
function shellPath() {
	const folders = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
	const kept = folders.filter((folder) => !/[\\/]_npx[\\/]|node_modules[\\/]\.bin/.test(folder));
	return [...new Set(kept)].join(delimiter) || "/usr/local/bin:/usr/bin:/bin";
}

export function unitText(node: string, script: string) {
	const settings = KEPT.flatMap((key) => {
		const value = process.env[key]?.trim();
		return value ? [`Environment=${quote(`${key}=${value}`)}`] : [];
	});
	return `${MARK}
[Unit]
Description=Kiteline: drive Claude Code from your phone
Documentation=https://kiteline.seefun.dev/docs/#always-on
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${quote(node, { command: true })} ${quote(script, { command: true })}
${settings.length ? `${settings.join("\n")}\n` : ""}# Claude Code's Bash tool runs with this shell and finds tools in these folders, as in your terminal.
Environment=${quote(`SHELL=${process.env.SHELL || "/bin/sh"}`)}
Environment=${quote(`PATH=${shellPath()}`)}
Restart=always
RestartSec=3
TimeoutStopSec=15

[Install]
WantedBy=default.target
`;
}

async function answers(url: string) {
	return fetch(`${url}/auth/status`, { signal: AbortSignal.timeout(1500) })
		.then((r) => r.ok)
		.catch(() => false);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function install({ force }: { force: boolean }) {
	requireSystemd();

	// npx and friends run a copy they may clear out later; a service needs one that stays.
	const script = realpathSync(process.argv[1] ?? "");
	if (/[\\/]_npx[\\/]|[\\/]dlx[\\/]|[\\/]bunx-/.test(script)) {
		fail(
			"This copy of Kiteline came from npx, which may clear it out later, and a service needs one that stays.",
			"Install it, then set up the service with that copy:",
			"",
			`  ${accent("npm install -g kiteline")}`,
			`  ${accent("kiteline service install")}`,
		);
	}

	let settings: ReturnType<typeof readSettings>;
	try {
		settings = readSettings();
	} catch (error) {
		if (!(error instanceof SettingsError)) throw error;
		fail(error.message);
	}

	const file = unitFile();
	const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
	if (existing !== null && !existing.includes(MARK) && !force) {
		fail(
			`There's already a ${NAME} service, set up by hand:`,
			dim(file),
			`Run ${bold("kiteline service install --force")} to replace it; the old file is kept beside it as .bak.`,
		);
	}

	const url = localAddress(settings.port, settings.host);
	const runningHere = systemctl("is-active", NAME).stdout.trim() === "active";
	if (!runningHere && (await answers(url))) {
		fail(
			`Something already answers on port ${settings.port}, perhaps Kiteline in another terminal.`,
			`Stop it first (Ctrl C in its window), then run ${bold("kiteline service install")} again.`,
		);
	}

	mkdirSync(dirname(file), { recursive: true });
	if (existing !== null && !existing.includes(MARK)) copyFileSync(file, `${file}.bak`);
	writeFileSync(file, unitText(process.execPath, script));

	// The service says where it answers when it starts; a fresh note means this start's is up.
	const serverFile = join(kitelineHome(settings.home), "server.json");
	const before = existsSync(serverFile) ? statSync(serverFile).mtimeMs : 0;
	for (const step of [["daemon-reload"], ["enable", NAME], ["restart", NAME]]) {
		const result = systemctl(...step);
		if (result.status !== 0) fail(`systemctl --user ${step.join(" ")} failed:`, result.stderr.trim());
	}

	// Without lingering, user services stop at logout and wait for a login after a reboot.
	const user = userInfo().username;
	const linger = spawnSync("loginctl", ["show-user", user, "--property=Linger", "--value"], {
		encoding: "utf8",
	});
	let lingerNote = "";
	if (linger.stdout.trim() !== "yes") {
		const enabled = spawnSync("loginctl", ["enable-linger", user], { stdio: ["inherit", "ignore", "pipe"] });
		if (enabled.status !== 0)
			lingerNote = `To start it at boot, before anyone logs in, run once: ${accent(`sudo loginctl enable-linger ${user}`)}`;
	}

	let up = false;
	for (let i = 0; i < 40 && !up; i++) {
		await sleep(250);
		const fresh = existsSync(serverFile) && statSync(serverFile).mtimeMs > before;
		up = fresh && (await answers(url));
	}
	if (!up) {
		fail(
			"The service is set up, but Kiteline didn't come up. See what it said with:",
			"",
			`  ${accent(`journalctl --user -u ${NAME} -n 40`)}`,
		);
	}

	say(
		`${bold("Kiteline runs in the background now.")} It starts with your computer and restarts if it stops.`,
		"",
		row("See what it's doing", `journalctl --user -u ${NAME} -f`),
		row("Pair a phone", "kiteline pair"),
		row("See paired devices", "kiteline devices"),
		row("Change its settings", "kiteline service install, with the new options"),
		row("Stop running it", "kiteline service uninstall"),
		...(lingerNote ? ["", lingerNote] : []),
	);

	// Nothing paired yet and someone at the keyboard: pair the first phone now.
	const { connectToKiteline } = await import("./control");
	const { client } = await connectToKiteline();
	const { devices } = await client.devices.list();
	if (!devices.length && process.stdin.isTTY && process.stdout.isTTY) {
		const { pairCommand } = await import("./pair-command");
		await pairCommand();
	}
}

function uninstall({ force }: { force: boolean }) {
	requireSystemd();
	const file = unitFile();
	if (!existsSync(file)) {
		say(`Kiteline isn't set up to run in the background, so there's nothing to take away.`);
		return;
	}
	if (!readFileSync(file, "utf8").includes(MARK) && !force) {
		fail(
			`The ${NAME} service was set up by hand:`,
			dim(file),
			`Run ${bold("kiteline service uninstall --force")} to remove it anyway.`,
		);
	}
	systemctl("disable", "--now", NAME);
	rmSync(file);
	systemctl("daemon-reload");
	say(
		`${bold("Kiteline no longer runs in the background.")} Paired phones stay paired.`,
		`Start it in a terminal with ${accent("kiteline")} whenever you like.`,
	);
}

function status() {
	requireSystemd();
	const file = unitFile();
	if (!existsSync(file)) {
		say(
			"Kiteline isn't set up to run in the background.",
			`Set it up with ${accent("kiteline service install")}: it starts with your computer and keeps going.`,
		);
		return;
	}
	const state = systemctl("is-active", NAME).stdout.trim();
	say(
		state === "active"
			? `${bold("Kiteline is running in the background.")}`
			: `${bold(`The ${NAME} service is set up, but it's ${state || "not running"}.`)}`,
		dim(file),
		"",
		row("See what it's doing", `journalctl --user -u ${NAME} -f`),
		row("Pair a phone", "kiteline pair"),
		row("See paired devices", "kiteline devices"),
		row("Stop running it", "kiteline service uninstall"),
	);
}

export async function service(action: string | undefined, options: { force: boolean }) {
	switch (action) {
		case "install":
			return install(options);
		case "uninstall":
		case "remove":
			return uninstall(options);
		case undefined:
		case "status":
			return status();
		default:
			fail(`"kiteline service ${action}" isn't a thing. Try install, uninstall or status.`);
	}
}
