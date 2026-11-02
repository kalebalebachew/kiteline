import { createInterface } from "node:readline/promises";

import type { DeviceInfo } from "@kiteline/api/devices";

import { accent, bold, dim, spaced } from "./banner";
import { command } from "./config";
import { connectToKiteline, Unreachable } from "./control";

const say = (...lines: string[]) =>
	console.log(["", ...lines.map((line) => (line ? `  ${line}` : ""))].join("\n"));

function ago(iso: string | number) {
	const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.round(hours / 24);
	return days < 30 ? `${days} day${days === 1 ? "" : "s"} ago` : new Date(iso).toLocaleDateString();
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Enough of the id to pick a device by, like a short git hash. */
const shortId = (id: string) => id.slice(0, 6);

function seen(device: DeviceInfo) {
	if (device.active) return "active now";
	return device.lastSeen ? `seen ${ago(device.lastSeen)}` : "never connected";
}

/** A device by its id, the start of its id, or its name. */
function find(devices: DeviceInfo[], target: string) {
	const wanted = target.trim().toLowerCase();
	const byId = devices.filter(
		(d) => d.id === target || (wanted.length >= 4 && d.id.toLowerCase().startsWith(wanted)),
	);
	if (byId.length) return byId;
	const byName = devices.filter((d) => d.name.toLowerCase() === wanted);
	return byName.length ? byName : devices.filter((d) => d.name.toLowerCase().includes(wanted));
}

function fail(message: string): never {
	throw new Unreachable(message);
}

/** `kiteline devices`: what's paired with this computer, and taking one away. */
export async function devicesCommand(action: string | undefined, target: string, options: { all: boolean }) {
	const { client } = await connectToKiteline();
	const { devices, requests } = await client.devices.list();

	if (action === undefined || action === "list") {
		if (!devices.length) {
			say(
				`${accent("◆")}  No devices are paired with this computer.`,
				"",
				`Pair one with ${bold(command("pair"))}.`,
				"",
			);
			return;
		}
		const nameWidth = Math.max(...devices.map((d) => d.name.length));
		const seenWidth = Math.max(...devices.map((d) => seen(d).length));
		say(
			`${accent("◆")}  ${devices.length === 1 ? "One device is" : `${devices.length} devices are`} paired with this computer`,
			"",
			...devices.map(
				(d) =>
					`   ${d.name.padEnd(nameWidth)}   ${dim(seen(d).padEnd(seenWidth))}   ${dim(
						`${d.via === "relay" ? "relay " : "direct"}   paired ${day(d.pairedAt)}`,
					)}   ${dim(shortId(d.id))}`,
			),
			...(requests.length
				? [
						"",
						"Waiting to pair:",
						...requests.map(
							(r) =>
								`   ${r.name}   ${dim(`its screen shows ${spaced(r.match)}, asked ${ago(r.requestedAt)}`)}`,
						),
					]
				: []),
			"",
			dim(`Remove one with ${command("devices")} remove <name or id>; ${command("pair")} adds one.`),
			"",
		);
		return;
	}

	if (action !== "remove" && action !== "rm") {
		fail(
			`"${command("devices")} ${action}" isn't a thing. Try ${command("devices")}, or ${command("devices")} remove <name or id>.`,
		);
	}

	if (options.all) {
		if (!devices.length) return say("No devices are paired, so there's nothing to remove.", "");
		if (process.stdin.isTTY && process.stdout.isTTY) {
			const rl = createInterface({ input: process.stdin, output: process.stdout });
			const answer = await rl
				.question(
					`\n  Remove all ${devices.length} devices? Each would have to pair again. ${dim("y or n")} `,
				)
				.finally(() => rl.close());
			if (!answer.trim().toLowerCase().startsWith("y")) return say("Nothing was removed.", "");
		}
		for (const device of devices) await client.devices.remove({ id: device.id });
		return say(`${accent("◆")}  Removed every device. Pair one again with ${bold(command("pair"))}.`, "");
	}

	if (!target) fail(`Say which device: ${command("devices")} remove <name or id>, or --all for every one.`);
	const matches = find(devices, target);
	if (!matches.length) fail(`No paired device matches "${target}". See them with ${command("devices")}.`);
	if (matches.length > 1) {
		fail(
			`More than one device matches "${target}": ${matches.map((d) => `${d.name} (${shortId(d.id)})`).join(", ")}. Use its id.`,
		);
	}
	const [device] = matches;
	if (!device) return;
	await client.devices.remove({ id: device.id });
	say(
		`${accent("◆")}  Removed ${bold(device.name)}. It can't reach this computer any more.`,
		dim(`To use it again, pair it again with ${command("pair")}.`),
		"",
	);
}
