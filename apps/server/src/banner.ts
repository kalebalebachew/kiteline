import { mkdirSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import type { Pairing } from "@kiteline/api/context";
import { renderSVG, renderUnicodeCompact } from "uqr";

import { command, otherPortHint } from "./config";

/** LAN and tailnet addresses first, so the QR code points somewhere a phone can reach. */
export function reachableHosts(): string[] {
	const hosts: string[] = [];
	for (const addresses of Object.values(networkInterfaces())) {
		for (const address of addresses ?? []) {
			if (address.family === "IPv4" && !address.internal) hosts.push(address.address);
		}
	}
	const rank = (ip: string) =>
		ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("100.") ? 2 : 3;
	return hosts.sort((a, b) => rank(a) - rank(b));
}

/**
 * The pairing link points at the public URL when one is set (say, the HTTPS
 * address from `tailscale serve`), otherwise at the first LAN address.
 */
export function buildPairing(
	port: number,
	token: string,
	options: { publicUrl?: string; loopbackOnly: boolean; relay?: { url: string; hostId: string } },
): Pairing {
	const publicUrl = options.publicUrl?.replace(/\/+$/, "");
	const lan = options.loopbackOnly ? [] : reachableHosts().map((host) => `http://${host}:${port}`);
	const relay = options.relay?.url.replace(/\/+$/, "");
	const urls = [
		...(relay ? [relay] : []),
		...(publicUrl ? [publicUrl] : []),
		...lan,
		`http://localhost:${port}`,
	];
	// Through the relay, the link says which computer as well as the code; it works on any network.
	const url = relay ? `${relay}/#host=${options.relay?.hostId}&pair=${token}` : `${urls[0]}/#pair=${token}`;
	return { url, urls, svg: renderSVG(url, { border: 1 }) };
}

// Color only for a person at a terminal: a service's log or a pipe gets plain text.
const color = !!process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (open: string, close: string) => (s: string) => (color ? `\x1b[${open}m${s}\x1b[${close}m` : s);
export const dim = paint("2", "22");
export const bold = paint("1", "22");
export const accent = paint("38;5;117", "39");

export function printBanner(
	pairing: Pairing,
	options: { version: string; dev: boolean; relay?: string | null },
) {
	const lines = [
		"",
		`  ${accent("◆")}  ${bold("Kiteline")} ${dim(`v${options.version}`)}${options.dev ? dim("  (dev, web on :4546)") : ""}`,
		"",
		...pairing.urls.map((url, i) => {
			const label =
				i === pairing.urls.length - 1 ? "Local   " : url === options.relay ? "Anywhere" : "Network ";
			return `  ${dim(label)} ${url}`;
		}),
		...(options.relay
			? ["", `  ${dim("Through the relay, sealed end to end: it passes your sessions on unread.")}`]
			: []),
		"",
		`  ${bold("Pair your phone:")} scan this code, or open the link on it.`,
		"",
		...renderUnicodeCompact(pairing.url, { border: 1 })
			.split("\n")
			.map((row) => `  ${row}`),
		"",
		`  ${accent(pairing.url)}`,
		`  ${dim("Keep this link private. Start with --new-token to unpair every device.")}`,
		"",
	];
	console.log(lines.join("\n"));
}

export type SavedPairing = { version: string; url: string; urls: string[]; startedAt: string };

/** Lets `pnpm pair` show the code later without starting a second server. */
export function savePairing(home: string, pairing: Pairing, version: string) {
	const saved: SavedPairing = {
		version,
		url: pairing.url,
		urls: pairing.urls,
		startedAt: new Date().toISOString(),
	};
	try {
		mkdirSync(home, { recursive: true, mode: 0o700 });
		writeFileSync(join(home, "pairing.json"), `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
	} catch {
		// Only `pnpm pair` needs this file; the server runs fine without it.
	}
}

export function printAlreadyRunning(port: number) {
	console.error(
		[
			"",
			`  ${accent("◆")}  ${bold("Kiteline didn't start:")} port ${port} is already in use.`,
			"",
			"  If Kiteline is already running, for example as the background service,",
			"  there's nothing to start. Show the pairing code with:",
			"",
			`    ${accent(command("pair"))}`,
			"",
			dim(`  Otherwise another program has the port; ${otherPortHint()}.`),
			"",
		].join("\n"),
	);
}

export function printSettingsError(message: string) {
	console.error(["", `  ${accent("◆")}  ${bold("Kiteline didn't start:")} ${message}`, ""].join("\n"));
}
