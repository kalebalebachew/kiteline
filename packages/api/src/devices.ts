import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { AsyncQueue } from "./agent/queue";
import { type Identity, importSecret, pairingKey, type SecretKey } from "./tunnel/crypto";

/**
 * The devices paired with this computer, and the ones asking to be.
 *
 * A pairing code works once, for ten minutes, and using it only asks: the device gets in once someone
 * approves it, in the terminal or on a device that's already paired, after checking both screens show
 * the same six digits. Each device then gets a key of its own, so any one of them can be removed
 * without touching the rest. Kept in devices.json (mode 600); codes and requests live in memory only.
 */

export const CODE_TTL_MS = 10 * 60_000;
/** How long a request waits for an answer. */
const REQUEST_TTL_MS = 5 * 60_000;
/** How long an answered request can still be collected by the device that asked. */
const COLLECT_MS = 10 * 60_000;
/** A spent or expired code is remembered a while, to tell "expired" from "never made here". */
const CODE_MEMORY_MS = 60 * 60_000;
const MAX_CODES = 20;
const MAX_PENDING = 5;
/** Seen this recently counts as active, between one request and the next. */
const ACTIVE_MS = 2 * 60_000;
const SAVE_SEEN_MS = 60_000;

export type Via = "relay" | "direct";

/** Who approved, removed or asked: the terminal, or a paired device. */
export type Actor = { kind: "terminal" } | { kind: "device"; id: string; name: string };

type Stored = {
	id: string;
	name: string;
	secret: string;
	pairedAt: string;
	lastSeen: string | null;
	/** "terminal", or the name of the device that approved it. */
	approvedBy: string;
	via: Via;
};

/** A paired device as the app and the terminal show it: never its key. */
export type DeviceInfo = {
	id: string;
	name: string;
	pairedAt: string;
	/** To the minute. */
	lastSeen: string | null;
	approvedBy: string;
	via: Via;
	/** In use now, or within the last couple of minutes. */
	active: boolean;
	/** The device that's asking. */
	current: boolean;
};

/** A device asking to pair, as the ones that can approve it see it. */
export type PairRequestInfo = {
	id: string;
	name: string;
	/** Six digits both screens show, so you can tell your own device's request from anyone else's. */
	match: string;
	via: Via;
	/** The code it used, so `kiteline pair` can pick out the request its own code brought. */
	code: string;
	requestedAt: number;
	expiresAt: number;
};

export type DevicesSnapshot = { devices: DeviceInfo[]; requests: PairRequestInfo[] };

export type PairingCode = { id: string; code: string; expiresAt: number };

export type Claimed = { id: string; claim: string; match: string; expiresAt: number };
export type ClaimProblem = "unknown" | "expired" | "used" | "busy";

type Settled = "approved" | "denied" | "expired" | "cancelled";

export type RequestState =
	| { state: "pending"; match: string; expiresAt: number }
	| { state: "approved"; device: { id: string; name: string; secret: string } }
	| { state: Exclude<Settled, "approved"> };

export type SettledInfo = PairRequestInfo & { state: Settled; by: Actor | null; device: DeviceInfo | null };

type Code = { id: string; key: SecretKey; expiresAt: number; request: string | null };

type Asking = {
	id: string;
	claim: string;
	code: string;
	name: string;
	match: string;
	via: Via;
	requestedAt: number;
	expiresAt: number;
	forgetAt: number;
	state: "pending" | Settled;
	device: Stored | null;
	wake: Set<() => void>;
};

type Events = {
	request: [PairRequestInfo];
	settled: [SettledInfo];
	removed: [DeviceInfo, Actor];
};

const token = (bytes: number) => randomBytes(bytes).toString("base64url");

/** What a device calls itself, made safe to print in a terminal and show in a list. */
export function cleanName(name: unknown) {
	const text =
		typeof name === "string"
			? name
					.replace(/[\p{C}]/gu, " ")
					.replace(/\s+/g, " ")
					.trim()
			: "";
	return text.slice(0, 60) || "A device";
}

function isStored(value: unknown): value is Stored {
	const d = value as Stored;
	return (
		!!d &&
		typeof d.id === "string" &&
		/^[\w-]{22}$/.test(d.id) &&
		typeof d.secret === "string" &&
		d.secret.length >= 43 &&
		typeof d.name === "string" &&
		typeof d.pairedAt === "string"
	);
}

export class Devices extends EventEmitter<Events> {
	private devices: Stored[];
	private readonly keys = new Map<string, Promise<SecretKey>>();
	private readonly codes = new Map<string, Code>();
	private readonly asking = new Map<string, Asking>();
	private readonly claims = new Map<string, string>();
	private readonly live = new Map<string, number>();
	private readonly watchers = new Set<AsyncQueue<true>>();
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly file: string) {
		super();
		this.devices = Devices.load(file);
		setInterval(() => this.sweep(), 15_000).unref();
	}

	private static load(file: string): Stored[] {
		try {
			const data = JSON.parse(readFileSync(file, "utf8")) as { devices?: unknown };
			return Array.isArray(data.devices)
				? data.devices.filter(isStored).map((d) => ({
						...d,
						name: cleanName(d.name),
						lastSeen: typeof d.lastSeen === "string" ? d.lastSeen : null,
						approvedBy: typeof d.approvedBy === "string" ? d.approvedBy : "terminal",
						via: d.via === "relay" ? "relay" : "direct",
					}))
				: [];
		} catch {
			return [];
		}
	}

	get count() {
		return this.devices.length;
	}

	names() {
		return this.devices.map((d) => d.name);
	}

	// --- Codes -----------------------------------------------------------------------------------

	/** A fresh one-time code. Each stands alone: making one leaves the others as they were. */
	async createCode(): Promise<PairingCode> {
		const now = Date.now();
		const open = [...this.codes.values()].filter((c) => !c.request && c.expiresAt > now);
		for (const old of open.slice(0, Math.max(0, open.length - MAX_CODES + 1))) old.expiresAt = now;
		const code = token(16);
		const { id, secret } = await pairingKey(code);
		const expiresAt = now + CODE_TTL_MS;
		this.codes.set(id, { id, key: await importSecret(secret), expiresAt, request: null });
		return { id, code, expiresAt };
	}

	/** A code nobody used after all: it stops working now. */
	cancelCode(id: string) {
		const code = this.codes.get(id);
		if (code && !code.request) code.expiresAt = Math.min(code.expiresAt, Date.now());
	}

	// --- Asking to pair ----------------------------------------------------------------------------

	/** A device asks to pair with a code. That spends the code, whatever the answer. */
	async claim(
		given: { code: string } | { id: string },
		details: { name: unknown; via: Via },
	): Promise<{ ok: true; request: Claimed } | { ok: false; problem: ClaimProblem }> {
		const id = "id" in given ? given.id : (await pairingKey(given.code)).id;
		const code = this.codes.get(id);
		const now = Date.now();
		if (!code) return { ok: false, problem: "unknown" };
		if (code.request) return { ok: false, problem: "used" };
		if (code.expiresAt <= now) return { ok: false, problem: "expired" };
		if (this.pending().length >= MAX_PENDING) return { ok: false, problem: "busy" };

		const request: Asking = {
			id: token(12),
			claim: token(24),
			code: id,
			name: cleanName(details.name),
			match: String(randomInt(0, 1_000_000)).padStart(6, "0"),
			via: details.via,
			requestedAt: now,
			expiresAt: now + REQUEST_TTL_MS,
			forgetAt: now + REQUEST_TTL_MS + COLLECT_MS,
			state: "pending",
			device: null,
			wake: new Set(),
		};
		code.request = request.id;
		this.asking.set(request.id, request);
		this.claims.set(request.claim, request.id);
		this.emit("request", this.requestInfo(request));
		this.changed();
		return {
			ok: true,
			request: { id: request.id, claim: request.claim, match: request.match, expiresAt: request.expiresAt },
		};
	}

	/** Where a request stands, for the device that made it; waits up to `waitMs` for an answer. */
	async status(claim: string, waitMs = 0, signal?: AbortSignal): Promise<RequestState | null> {
		const request = this.byClaim(claim);
		if (!request) return null;
		if (request.state === "pending" && waitMs > 0 && !signal?.aborted) {
			await new Promise<void>((resolve) => {
				const done = () => {
					clearTimeout(timer);
					request.wake.delete(done);
					signal?.removeEventListener("abort", done);
					resolve();
				};
				const timer = setTimeout(done, Math.max(0, Math.min(waitMs, request.expiresAt - Date.now() + 50)));
				request.wake.add(done);
				signal?.addEventListener("abort", done, { once: true });
			});
		}
		this.refresh(request);
		switch (request.state) {
			case "pending":
				return { state: "pending", match: request.match, expiresAt: request.expiresAt };
			case "approved": {
				const device = request.device && this.devices.find((d) => d.id === request.device?.id);
				// Removed before it was collected: as good as declined.
				if (!device) return { state: "denied" };
				return { state: "approved", device: { id: device.id, name: device.name, secret: device.secret } };
			}
			default:
				return { state: request.state };
		}
	}

	/** The device that asked changed its mind. */
	cancel(claim: string) {
		const request = this.byClaim(claim);
		if (request?.state === "pending") this.settle(request, "cancelled", null);
	}

	/** Allow or decline a request. Says so if it was already answered, elsewhere or by the clock. */
	decide(
		id: string,
		allow: boolean,
		by: Actor,
	): { ok: true; device: DeviceInfo | null } | { ok: false; state: Settled | "gone" } {
		const request = this.asking.get(id);
		if (!request) return { ok: false, state: "gone" };
		this.refresh(request);
		if (request.state !== "pending") return { ok: false, state: request.state };
		if (!allow) {
			this.settle(request, "denied", by);
			return { ok: true, device: null };
		}
		const device: Stored = {
			id: token(16),
			name: request.name,
			secret: token(32),
			pairedAt: new Date().toISOString(),
			lastSeen: null,
			approvedBy: by.kind === "terminal" ? "terminal" : by.name,
			via: request.via,
		};
		this.devices.push(device);
		try {
			this.save();
		} catch (error) {
			this.devices.pop();
			throw error;
		}
		request.device = device;
		this.settle(request, "approved", by);
		return { ok: true, device: this.info(device) };
	}

	private byClaim(claim: string) {
		const id = this.claims.get(claim);
		return id ? this.asking.get(id) : undefined;
	}

	private pending() {
		return [...this.asking.values()].filter((r) => {
			this.refresh(r);
			return r.state === "pending";
		});
	}

	private refresh(request: Asking) {
		if (request.state === "pending" && request.expiresAt <= Date.now()) this.settle(request, "expired", null);
	}

	private settle(request: Asking, state: Settled, by: Actor | null) {
		request.state = state;
		request.forgetAt = Date.now() + COLLECT_MS;
		for (const wake of [...request.wake]) wake();
		this.emit("settled", {
			...this.requestInfo(request),
			state,
			by,
			device: request.device ? this.info(request.device) : null,
		});
		this.changed();
	}

	private requestInfo(r: Asking): PairRequestInfo {
		return {
			id: r.id,
			name: r.name,
			match: r.match,
			via: r.via,
			code: r.code,
			requestedAt: r.requestedAt,
			expiresAt: r.expiresAt,
		};
	}

	// --- Paired devices ----------------------------------------------------------------------------

	/** The device a cookie stands for: `<id>.<secret>`. */
	fromCookie(value: string) {
		const [id, secret] = value.split(".");
		if (!id || !secret) return null;
		const device = this.devices.find((d) => d.id === id);
		if (!device) return null;
		const given = Buffer.from(secret);
		const held = Buffer.from(device.secret);
		return given.length === held.length && timingSafeEqual(given, held) ? this.ref(device) : null;
	}

	/** A paired device's cookie, for the server to hand over when its pairing is approved. */
	static cookieFor(device: { id: string; secret: string }) {
		return `${device.id}.${device.secret}`;
	}

	device(id: string) {
		const device = this.devices.find((d) => d.id === id);
		return device ? this.ref(device) : null;
	}

	private ref(device: Stored) {
		return { id: device.id, name: device.name };
	}

	/**
	 * The tunnel key a phone names: its own, while it's paired, or a pairing code's, while that code can
	 * still be used or its request is waiting to be answered and collected.
	 */
	key(identity: Identity): Promise<SecretKey | null> | SecretKey | null {
		if (identity.kind === "device") {
			const device = this.devices.find((d) => d.id === identity.id);
			if (!device) return null;
			let key = this.keys.get(device.id);
			if (!key) {
				key = importSecret(new Uint8Array(Buffer.from(device.secret, "base64url")));
				this.keys.set(device.id, key);
			}
			return key;
		}
		const code = this.codes.get(identity.id);
		if (!code) return null;
		if (!code.request) return code.expiresAt > Date.now() ? code.key : null;
		const request = this.asking.get(code.request);
		if (request) this.refresh(request);
		return request && (request.state === "pending" || request.state === "approved") ? code.key : null;
	}

	/** A device is using Kiteline, by a request, a stream or a tunnel. Call what comes back when it's done. */
	using(id: string): () => void {
		const device = this.devices.find((d) => d.id === id);
		if (!device) return () => {};
		const wasActive = this.info(device).active;
		this.live.set(id, (this.live.get(id) ?? 0) + 1);
		this.seen(device);
		if (!wasActive) this.changed();
		let done = false;
		return () => {
			if (done) return;
			done = true;
			const left = (this.live.get(id) ?? 1) - 1;
			if (left > 0) this.live.set(id, left);
			else this.live.delete(id);
			this.seen(device);
		};
	}

	private seen(device: Stored) {
		device.lastSeen = new Date().toISOString();
		this.saveTimer ??= setTimeout(() => {
			try {
				this.save();
			} catch {
				// Only the last-seen times were waiting; the next save brings them.
			}
		}, SAVE_SEEN_MS);
		this.saveTimer.unref?.();
	}

	remove(id: string, by: Actor): DeviceInfo | null {
		const at = this.devices.findIndex((d) => d.id === id);
		if (at === -1) return null;
		const [device] = this.devices.splice(at, 1);
		if (!device) return null;
		try {
			this.save();
		} catch (error) {
			this.devices.splice(at, 0, device);
			throw error;
		}
		this.keys.delete(id);
		this.live.delete(id);
		const removed = this.info(device);
		this.emit("removed", removed, by);
		this.changed();
		return removed;
	}

	removeAll(by: Actor) {
		for (const device of [...this.devices]) this.remove(device.id, by);
	}

	// --- Watching ----------------------------------------------------------------------------------

	snapshot(current?: string): DevicesSnapshot {
		return {
			devices: this.devices.map((d) => this.info(d, current)),
			requests: this.pending().map((r) => this.requestInfo(r)),
		};
	}

	/** The devices and requests, again whenever they change, until `signal` aborts. */
	async *watch(current: string | undefined, signal?: AbortSignal): AsyncGenerator<DevicesSnapshot> {
		const queue = new AsyncQueue<true>();
		this.watchers.add(queue);
		const stop = () => queue.close();
		signal?.addEventListener("abort", stop, { once: true });
		let last = "";
		const fresh = () => {
			const snapshot = this.snapshot(current);
			const json = JSON.stringify(snapshot);
			if (json === last) return null;
			last = json;
			return snapshot;
		};
		try {
			yield fresh() ?? this.snapshot(current);
			for await (const _ of queue) {
				const snapshot = fresh();
				if (snapshot) yield snapshot;
			}
		} finally {
			signal?.removeEventListener("abort", stop);
			this.watchers.delete(queue);
		}
	}

	private changed() {
		for (const queue of this.watchers) queue.push(true);
	}

	private info(d: Stored, current?: string): DeviceInfo {
		const seen = d.lastSeen ? Date.parse(d.lastSeen) : 0;
		return {
			id: d.id,
			name: d.name,
			pairedAt: d.pairedAt,
			lastSeen: d.lastSeen ? new Date(Math.floor(seen / 60_000) * 60_000).toISOString() : null,
			approvedBy: d.approvedBy,
			via: d.via,
			active: (this.live.get(d.id) ?? 0) > 0 || (!!seen && Date.now() - seen < ACTIVE_MS),
			current: d.id === current,
		};
	}

	/** Expires what's due; watchers see a device go from active to last seen. */
	private sweep() {
		const now = Date.now();
		for (const request of [...this.asking.values()]) {
			if (request.state === "pending") this.refresh(request);
			else if (request.forgetAt <= now) {
				this.asking.delete(request.id);
				this.claims.delete(request.claim);
			}
		}
		for (const code of [...this.codes.values()]) {
			if (code.expiresAt + CODE_MEMORY_MS <= now && !(code.request && this.asking.has(code.request)))
				this.codes.delete(code.id);
		}
		this.changed();
	}

	private save() {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = null;
		mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
		const temp = `${this.file}.${process.pid}.tmp`;
		writeFileSync(temp, `${JSON.stringify({ version: 1, devices: this.devices }, null, 2)}\n`, {
			mode: 0o600,
		});
		renameSync(temp, this.file);
	}

	/** Writes what's waiting, before the server stops. */
	flush() {
		if (!this.saveTimer) return;
		try {
			this.save();
		} catch {}
	}
}
