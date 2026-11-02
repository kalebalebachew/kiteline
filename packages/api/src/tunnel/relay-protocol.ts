/**
 * How computers and phones meet at the relay. The relay reads only this: who wants which computer.
 * Everything a phone and its computer say to each other goes past it sealed (see crypto.ts).
 */
import type { Bytes } from "./crypto";

/** The relay Kiteline uses unless told otherwise. */
export const DEFAULT_RELAY = "https://relay.kiteline.seefun.dev";

export const RelayPath = {
	/** A computer's standing connection, over which the relay asks it to open channels. */
	host: "/v1/host",
	/** A phone asking for a computer: /v1/client/<hostId>. */
	client: "/v1/client/",
	/** A computer answering a phone: /v1/data/<channel>. */
	data: "/v1/data/",
} as const;

/** Close codes, so each side can say plainly what happened. */
export const RelayClose = {
	Replaced: 4000,
	BadRequest: 4400,
	NotPaired: 4401,
	HostOffline: 4404,
	TooMany: 4429,
	ShuttingDown: 4503,
	HostSilent: 4504,
} as const;

export type HostHello = { t: "hello"; secret: string; version: string };
export type HostMessage = HostHello | { t: "ping" };
export type RelayMessage = { t: "ready"; hostId: string } | { t: "open"; channel: string } | { t: "pong" };

/** What the relay tells a phone once its computer has picked up: the handshake can start. */
export const PAIRED = '{"t":"paired"}';

export function toBase64Url(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Bytes {
	const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

/**
 * A computer's address at the relay, worked out from its relay secret: whoever can show the secret
 * owns the address, and the relay needs to remember nothing.
 */
export async function hostIdFor(secret: Bytes) {
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", secret));
	return toBase64Url(digest).slice(0, 22);
}

/** The relay's WebSocket address for a path, from its https address. */
export function relaySocketUrl(relay: string, path: string) {
	const url = new URL(path, relay);
	url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
	return url.toString();
}
