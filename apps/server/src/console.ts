import { createInterface } from "node:readline";

import type { Devices, PairRequestInfo } from "@kiteline/api/devices";

import { accent, bold, dim, printPairingCode, spaced } from "./banner";

type Options = {
	devices: Devices;
	pairingLink: (code: string) => { url: string; svg: string };
};

const say = (...lines: string[]) => console.log(lines.map((line) => (line ? `  ${line}` : "")).join("\n"));

/**
 * Kiteline in a terminal, like pairing Bluetooth: it shows a pairing code while nothing is paired,
 * makes a fresh one whenever you press Enter, and asks about each device that wants to pair, with
 * the digits its screen shows so you know it's yours.
 */
export function startConsole({ devices, pairingLink }: Options) {
	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
	// The terminal's in raw mode now, so Ctrl C arrives as a key: pass it on as the signal it means.
	rl.on("SIGINT", () => process.kill(process.pid, "SIGINT"));

	const waiting: PairRequestInfo[] = [];
	let asking: PairRequestInfo | null = null;

	const showCode = async () => {
		const code = await devices.createCode();
		printPairingCode(
			{ url: pairingLink(code.code).url, expiresAt: code.expiresAt },
			{ more: "Press Enter for a new code." },
		);
	};

	const ask = () => {
		if (asking) return;
		const next = waiting.shift();
		if (!next) return;
		asking = next;
		say(
			"",
			`${accent("◆")}  ${bold(next.name)} wants to pair${next.via === "relay" ? ", through the relay" : ""}.`,
			`   Allow it only if it's yours and its screen shows ${bold(spaced(next.match))}.`,
		);
		rl.setPrompt(`     Allow it? ${dim("y or n")} `);
		rl.prompt();
	};

	devices.on("request", (request) => {
		waiting.push(request);
		ask();
	});

	devices.on("settled", (request) => {
		const at = waiting.findIndex((r) => r.id === request.id);
		if (at !== -1) waiting.splice(at, 1);
		if (asking?.id === request.id) {
			// Answered on a phone, or out of time, while the question was up.
			asking = null;
			console.log();
			if (request.state === "approved")
				say(
					`${request.name} was allowed${request.by?.kind === "device" ? ` on ${request.by.name}` : ""}.`,
					"",
				);
			else if (request.state === "denied")
				say(
					`${request.name} was declined${request.by?.kind === "device" ? ` on ${request.by.name}` : ""}.`,
					"",
				);
			else if (request.state === "expired") say(`${request.name} waited too long; ask it to try again.`, "");
			else say(`${request.name} stopped asking.`, "");
			ask();
			return;
		}
		if (request.state === "approved" && request.by?.kind === "device")
			say(`${accent("◆")}  Paired ${bold(request.name)}, allowed on ${request.by.name}.`, "");
	});

	devices.on("removed", (device, by) => {
		const how =
			by.kind === "terminal" ? "" : by.id === device.id ? ", at its own request" : `, on ${by.name}`;
		say(`Removed ${device.name}${how}.`, "");
	});

	rl.on("line", (line) => {
		const answer = line.trim().toLowerCase();
		const request = asking;
		if (request) {
			if (!["y", "yes", "n", "no"].includes(answer)) {
				rl.prompt();
				return;
			}
			const allow = answer.startsWith("y");
			asking = null;
			const result = devices.decide(request.id, allow, { kind: "terminal" });
			if (!result.ok)
				say(`Too late: that request was ${result.state === "gone" ? "already answered" : result.state}.`, "");
			else if (allow) say(`${accent("◆")}  Paired ${bold(request.name)}.`, "");
			else say(`Declined ${request.name}.`, "");
			ask();
			return;
		}
		if (!answer) void showCode();
	});

	if (devices.count === 0) void showCode();
	else {
		const names = devices.names();
		say(
			`${dim("Paired")}   ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`,
			"",
			dim("Press Enter to pair another device."),
			"",
		);
	}
}
