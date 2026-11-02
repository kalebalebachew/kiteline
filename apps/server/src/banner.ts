import { networkInterfaces } from "node:os";

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

type Where = { publicUrl?: string; loopbackOnly: boolean; relay?: { url: string; hostId: string } };

/** Every address a phone might reach this computer at: the relay, the public URL, the LAN, this machine. */
export function addressesFor(port: number, where: Where) {
	const publicUrl = where.publicUrl?.replace(/\/+$/, "");
	const lan = where.loopbackOnly ? [] : reachableHosts().map((host) => `http://${host}:${port}`);
	const relay = where.relay?.url.replace(/\/+$/, "");
	return [...(relay ? [relay] : []), ...(publicUrl ? [publicUrl] : []), ...lan, `http://localhost:${port}`];
}

/**
 * Where a one-time code goes: through the relay, the link also says which computer, and works on any
 * network; otherwise it points at the public URL when one is set (say, the HTTPS address from
 * `tailscale serve`), or else the first LAN address. The code rides after #, which browsers never send.
 */
export function pairingLinks(port: number, where: Where) {
	const urls = addressesFor(port, where);
	const relay = where.relay;
	return (code: string) => {
		const url = relay
			? `${relay.url.replace(/\/+$/, "")}/#host=${relay.hostId}&code=${code}`
			: `${urls[0]}/#code=${code}`;
		return { url, svg: renderSVG(url, { border: 1 }) };
	};
}

// Color only for a person at a terminal: a service's log or a pipe gets plain text.
const color = !!process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (open: string, close: string) => (s: string) => (color ? `\x1b[${open}m${s}\x1b[${close}m` : s);
export const dim = paint("2", "22");
export const bold = paint("1", "22");
export const accent = paint("38;5;117", "39");

/** Six digits as people read them off a screen: 482 913. */
export const spaced = (match: string) => `${match.slice(0, 3)} ${match.slice(3)}`;

/** Who's running, and where: never a pairing link, which a service's log would keep. */
export function printBanner(
	urls: string[],
	options: { version: string; dev: boolean; relay?: string | null },
) {
	const lines = [
		"",
		`  ${accent("◆")}  ${bold("Kiteline")} ${dim(`v${options.version}`)}${options.dev ? dim("  (dev, web on :4546)") : ""}`,
		"",
		...urls.map((url, i) => {
			const label = i === urls.length - 1 ? "Local   " : url === options.relay ? "Anywhere" : "Network ";
			return `  ${dim(label)} ${url}`;
		}),
		...(options.relay
			? ["", `  ${dim("Through the relay, sealed end to end: it passes your sessions on unread.")}`]
			: []),
		"",
	];
	console.log(lines.join("\n"));
}

/** A one-time code to scan, for a person at a terminal. */
export function printPairingCode(link: { url: string; expiresAt: number }, options: { more?: string } = {}) {
	const minutes = Math.max(1, Math.round((link.expiresAt - Date.now()) / 60_000));
	const lines = [
		"",
		`  ${bold("Pair a phone:")} scan this code, or open the link on it.`,
		"",
		...renderUnicodeCompact(link.url, { border: 1 })
			.split("\n")
			.map((row) => `  ${row}`),
		"",
		`  ${accent(link.url)}`,
		`  ${dim(`Works once, for the next ${minutes} minutes. You'll be asked to allow the phone.`)}`,
		...(options.more ? [`  ${dim(options.more)}`] : []),
		"",
	];
	console.log(lines.join("\n"));
}

export function printAlreadyRunning(port: number) {
	console.error(
		[
			"",
			`  ${accent("◆")}  ${bold("Kiteline didn't start:")} port ${port} is already in use.`,
			"",
			"  If Kiteline is already running, for example as the background service,",
			"  there's nothing to start. Pair a phone with it:",
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
