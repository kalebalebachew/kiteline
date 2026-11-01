import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEVICE_COOKIE = "kiteline_device";

export function kitelineHome(override: string | undefined) {
	return override || join(homedir(), ".kiteline");
}

/**
 * The pairing token lives in ~/.kiteline/auth.json (mode 600) so paired phones
 * survive restarts. `--new-token` replaces it, which unpairs every device.
 */
export function loadToken(home: string, options: { fixed?: string; rotate: boolean }): string {
	if (options.fixed) return options.fixed;
	const file = join(home, "auth.json");
	if (!options.rotate) {
		try {
			const stored = JSON.parse(readFileSync(file, "utf8")) as { token?: unknown };
			if (typeof stored.token === "string" && stored.token.length >= 16) return stored.token;
		} catch {
			// First run, or an unreadable file: make a new token below.
		}
	}
	const token = randomBytes(18).toString("base64url");
	mkdirSync(home, { recursive: true, mode: 0o700 });
	writeFileSync(file, `${JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2)}\n`, {
		mode: 0o600,
	});
	return token;
}

/** What a paired device's cookie holds. Derived from the token, so a new token unpairs everyone. */
export function deviceSecret(token: string) {
	return createHmac("sha256", token).update("kiteline-device-v1").digest("base64url");
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
