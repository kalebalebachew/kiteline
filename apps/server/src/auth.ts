import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEVICE_COOKIE = "kiteline_device";

export function kitelineHome(override: string | undefined) {
	return override || join(homedir(), ".kiteline");
}

function writePrivate(home: string, name: string, value: unknown) {
	const file = join(home, name);
	mkdirSync(home, { recursive: true, mode: 0o700 });
	writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	chmodSync(file, 0o600);
}

/**
 * The computer's own key, in ~/.kiteline/auth.json (mode 600): the `kiteline` commands show it to
 * the Kiteline that's running, to make pairing codes and manage devices. No link or log carries it,
 * and no phone holds it; each of those has a key of its own.
 *
 * Before 0.3 this file held the one pairing code, which every pairing link carried. Finding one of
 * those replaces it, so an old link opens nothing.
 */
export function loadComputerKey(home: string, options: { rotate: boolean }) {
	if (!options.rotate) {
		const key = readComputerKey(home);
		if (key) return { key, replaced: false };
	}
	let replaced = options.rotate;
	try {
		replaced ||=
			typeof (JSON.parse(readFileSync(join(home, "auth.json"), "utf8")) as { token?: unknown }).token ===
			"string";
	} catch {
		// First run: nothing to replace.
	}
	const key = randomBytes(32).toString("base64url");
	writePrivate(home, "auth.json", { key, createdAt: new Date().toISOString() });
	return { key, replaced };
}

export function readComputerKey(home: string) {
	try {
		const stored = JSON.parse(readFileSync(join(home, "auth.json"), "utf8")) as { key?: unknown };
		return typeof stored.key === "string" && stored.key.length >= 43 ? stored.key : null;
	} catch {
		return null;
	}
}

/** Where the running Kiteline answers, for the `kiteline` commands. Nothing secret. */
export type ServerInfo = {
	version: string;
	pid: number;
	local: string;
	relay: string | null;
	startedAt: string;
};

export function saveServerInfo(home: string, info: ServerInfo) {
	try {
		writePrivate(home, "server.json", info);
	} catch {
		// Only the `kiteline` commands need it; the server runs fine without.
	}
}

export function readServerInfo(home: string): ServerInfo | null {
	try {
		const info = JSON.parse(readFileSync(join(home, "server.json"), "utf8")) as ServerInfo;
		return typeof info.local === "string" ? info : null;
	} catch {
		return null;
	}
}

/** Where a server listening on `host` answers from this computer. */
export function localAddress(port: number, host: string) {
	const loopback = ["0.0.0.0", "::", "127.0.0.1", "localhost", ""].includes(host);
	return `http://${loopback ? "127.0.0.1" : host.includes(":") ? `[${host}]` : host}:${port}`;
}

export function safeEqual(a: string, b: string) {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
}

/** Slows down guessing: ten wrong codes from one address locks it out for ten minutes. */
export class PairLimiter {
	private failures = new Map<string, { count: number; until: number }>();

	blocked(key: string) {
		const entry = this.failures.get(key);
		return !!entry && entry.count >= 10 && entry.until > Date.now();
	}

	fail(key: string) {
		const entry = this.failures.get(key);
		const fresh = !entry || entry.until < Date.now();
		this.failures.set(key, { count: fresh ? 1 : entry.count + 1, until: Date.now() + 10 * 60_000 });
	}

	clear(key: string) {
		this.failures.delete(key);
	}
}
