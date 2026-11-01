import { networkInterfaces } from "node:os";
import type { Pairing } from "@kiteline/api/context";
import { renderSVG, renderUnicodeCompact } from "uqr";

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
	options: { publicUrl?: string; loopbackOnly: boolean },
): Pairing {
	const publicUrl = options.publicUrl?.replace(/\/+$/, "");
	const lan = options.loopbackOnly ? [] : reachableHosts().map((host) => `http://${host}:${port}`);
	const urls = [...(publicUrl ? [publicUrl] : []), ...lan, `http://localhost:${port}`];
	const url = `${urls[0]}/#pair=${token}`;
	return { url, urls, svg: renderSVG(url, { border: 1 }) };
}

const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const accent = (s: string) => `\x1b[38;5;117m${s}\x1b[39m`;

export function printBanner(pairing: Pairing, options: { version: string; dev: boolean }) {
	const lines = [
		"",
		`  ${accent("◆")}  ${bold("Kiteline")} ${dim(`v${options.version}`)}${options.dev ? dim("  (dev, web on :4546)") : ""}`,
		"",
		...pairing.urls.map(
			(url, i) => `  ${dim(i === pairing.urls.length - 1 ? "Local   " : "Network ")} ${url}`,
		),
		"",
		`  ${bold("Pair your phone:")} scan this code, or open the link on it.`,
		"",
		...renderUnicodeCompact(pairing.url, { border: 1 })
			.split("\n")
			.map((row) => `  ${row}`),
		"",
		`  ${accent(pairing.url)}`,
		`  ${dim("Keep this link private. Run with --new-token to unpair every device.")}`,
		"",
	];
	console.log(lines.join("\n"));
}
