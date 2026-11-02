import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { DEFAULT_RELAY } from "@kiteline/api/tunnel/relay-protocol";

/**
 * Kiteline's settings, from environment variables (the `kiteline` command sets them from its flags).
 * Each has a default. Only a `.env` beside the server's own files is read, as in a clone of the repo:
 * never one from the folder you happen to start Kiteline in, which belongs to some other project.
 */
export type Settings = {
	port: number;
	host: string;
	publicUrl: string | undefined;
	token: string | undefined;
	home: string | undefined;
	claudePath: string | undefined;
	codexPath: string | undefined;
	allowBypass: boolean;
	maxSessions: number;
	idleMinutes: number;
	/** The relay phones reach this computer through from anywhere, or null to keep to local networks. */
	relay: string | null;
};

export class SettingsError extends Error {}

/** `apps/server/.env` when running from a clone; a published package has none. */
export function loadOwnEnvFile() {
	const file = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
	if (!existsSync(file)) return;
	for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
		// What's set in the environment wins over the file, as with any .env.
		if (process.env[key] === undefined) process.env[key] = value;
	}
}

function text(name: string) {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

function whole(name: string, what: string, fallback: number, min: number, max: number) {
	const raw = text(name);
	if (raw === undefined) return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new SettingsError(
			`${what} (${name}) should be a whole number from ${min} to ${max}, not "${raw}".`,
		);
	}
	return value;
}

function yesNo(name: string, what: string, fallback: boolean) {
	const raw = text(name)?.toLowerCase();
	if (raw === undefined) return fallback;
	if (["true", "1", "yes", "on"].includes(raw)) return true;
	if (["false", "0", "no", "off"].includes(raw)) return false;
	throw new SettingsError(`${what} (${name}) should be true or false, not "${raw}".`);
}

function address(name: string, what: string) {
	const raw = text(name);
	if (raw === undefined) return undefined;
	try {
		const url = new URL(raw);
		if (url.protocol === "http:" || url.protocol === "https:") return raw.replace(/\/+$/, "");
	} catch {}
	throw new SettingsError(
		`${what} (${name}) should be a web address such as https://my-computer.my-tailnet.ts.net, not "${raw}".`,
	);
}

/** on and off, or a relay of your own: KITELINE_RELAY=https://relay.example.com */
function relay() {
	const raw = text("KITELINE_RELAY");
	if (raw === undefined || ["off", "false", "0", "no"].includes(raw.toLowerCase())) return null;
	if (["on", "true", "1", "yes"].includes(raw.toLowerCase())) return DEFAULT_RELAY;
	return address("KITELINE_RELAY", "The relay");
}

export function readSettings(): Settings {
	loadOwnEnvFile();
	return {
		port: whole("PORT", "The port", 4545, 1, 65_535),
		host: text("HOST") ?? "0.0.0.0",
		publicUrl: address("KITELINE_PUBLIC_URL", "The public address"),
		token: text("KITELINE_TOKEN"),
		home: text("KITELINE_HOME"),
		claudePath: text("CLAUDE_PATH"),
		codexPath: text("CODEX_PATH"),
		allowBypass: yesNo("KITELINE_ALLOW_BYPASS", "Allowing Bypass mode", true),
		maxSessions: whole("KITELINE_MAX_SESSIONS", "The session limit", 6, 1, 100),
		idleMinutes: whole("KITELINE_IDLE_MINUTES", "The idle time", 20, 1, 7 * 24 * 60),
		relay: relay() ?? null,
	};
}

/** How the person started Kiteline, so the hints it prints name a command they can run. */
let viaCli = false;
export function startedFromCli() {
	viaCli = true;
}
export function command(name: "start" | "pair") {
	if (viaCli) return name === "start" ? "kiteline" : "kiteline pair";
	return `pnpm ${name}`;
}
/** How to pick another port, in the same terms. */
export function otherPortHint() {
	return viaCli ? "use another with kiteline --port 4546" : "set PORT to use a different one";
}
