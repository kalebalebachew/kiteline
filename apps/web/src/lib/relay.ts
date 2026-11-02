import { Tunnel, TunnelError, tunnelError } from "@kiteline/api/tunnel/client";
import { importSecret, pairingKey, type SecretKey } from "@kiteline/api/tunnel/crypto";
import { fromBase64Url, RelayPath, relaySocketUrl } from "@kiteline/api/tunnel/relay-protocol";

/**
 * Kiteline through the relay: the app comes from the relay, and everything it asks of the computer
 * goes through a sealed tunnel. This phone's key for the computer lives in IndexedDB as a key the
 * browser can use but can't hand back, so even a script that got into the page couldn't carry it off.
 */

/** The relay marks the page it serves; the computer's own copy has no mark. */
export const onRelay =
	typeof document !== "undefined" && !!document.querySelector('meta[name="kiteline-relay"]');

const DB = "kiteline-relay";
const STORE = "computers";
const CURRENT = "kiteline:relay:computer";

/** A computer this phone is paired with: its address, this phone's id there, and this phone's key. */
type Computer = { id: string; device?: string; key: SecretKey; pairedAt: number };

function database() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function store<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
	const db = await database();
	return new Promise<T>((resolve, reject) => {
		const request = run(db.transaction(STORE, mode).objectStore(STORE));
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	}).finally(() => db.close());
}

function currentId() {
	try {
		return localStorage.getItem(CURRENT);
	} catch {
		return null;
	}
}

async function read(host: string) {
	return (
		((await store("readonly", (s) => s.get(host)).catch(() => undefined)) as Computer | undefined) ?? null
	);
}

async function currentComputer() {
	const id = currentId();
	return id ? read(id) : null;
}

/**
 * Keeps this phone's new key for a computer, once the computer allowed it; only the browser can use
 * it. A key this phone held there before is signed out first, so the computer's list doesn't keep a
 * device nobody holds.
 */
export async function rememberComputer(host: string, device: string, secret: string) {
	const old = await read(host);
	if (old?.device && old.device !== device) await retire(host, old.device, old.key);
	const key = await importSecret(fromBase64Url(secret));
	await store("readwrite", (s) => s.put({ id: host, device, key, pairedAt: Date.now() }));
	try {
		localStorage.setItem(CURRENT, host);
	} catch {}
	dropTunnel();
}

/** Signs an old key out on its computer, over a tunnel of its own that it then closes. Best effort. */
async function retire(host: string, device: string, key: SecretKey) {
	// The shared tunnel goes first, so the computer letting go of the old key can't look like this
	// phone being unpaired.
	if (currentId() === host) dropTunnel();
	try {
		const url = relaySocketUrl(window.location.origin, RelayPath.client + host);
		const tunnel = await Tunnel.connect(url, { kind: "device", id: device }, key, 10_000);
		try {
			await (await tunnel.fetch("/auth/logout", { method: "POST" })).body?.cancel();
		} finally {
			tunnel.close();
		}
	} catch {
		// Already removed there, or out of reach: nothing more to do.
	}
}

/** Unpairing on purpose: this phone forgets the computer it's on. */
export async function forgetComputer() {
	const id = currentId();
	dropTunnel();
	try {
		localStorage.removeItem(CURRENT);
	} catch {}
	if (id) await store("readwrite", (s) => s.delete(id)).catch(() => {});
}

/**
 * Forgets a computer's key, but only the one named: a fresh pairing may have replaced it meanwhile, and
 * that one stays. One transaction, so nothing can land between the look and the delete.
 */
async function forgetKey(host: string, device: string | undefined) {
	const db = await database();
	return new Promise<boolean>((resolve, reject) => {
		const transaction = db.transaction(STORE, "readwrite");
		const objects = transaction.objectStore(STORE);
		let forgot = false;
		const look = objects.get(host);
		look.onsuccess = () => {
			const record = look.result as Computer | undefined;
			if (record && record.device === device) {
				objects.delete(host);
				forgot = true;
			}
		};
		transaction.oncomplete = () => resolve(forgot);
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	}).finally(() => db.close());
}

/** A key from before pairing changed opens nothing now: drop it, unless a new pairing just replaced it. */
export async function forgetOutdated() {
	const id = currentId();
	if (id) await forgetKey(id, undefined).catch(() => false);
}

/** Paired, paired before pairing changed (whose key opens nothing now), or not at all. */
export async function computerState(): Promise<"paired" | "outdated" | "none"> {
	const computer = await currentComputer();
	if (!computer) return "none";
	return computer.device ? "paired" : "outdated";
}

let tunnel: Promise<Tunnel> | null = null;
let live: Tunnel | null = null;
/** Counts drops, so a tunnel that finishes connecting after one knows it's out of date. */
let generation = 0;

/** Told when the computer stops knowing this phone, say because it was removed on another device. */
const unpairedListeners = new Set<() => void>();
export function onUnpaired(listener: () => void) {
	unpairedListeners.add(listener);
	return () => void unpairedListeners.delete(listener);
}

/** The computer turned this key away, so it opens nothing now: forget it, if it's still the one kept. */
async function unpaired(host: string, device: string) {
	if (!(await forgetKey(host, device).catch(() => false))) return;
	if (currentId() === host) for (const listener of unpairedListeners) listener();
}

function dropTunnel() {
	generation++;
	live?.close();
	live = null;
	tunnel = null;
}

/** One tunnel at a time, opened when first needed and again after it drops. */
function getTunnel() {
	tunnel ??= (async () => {
		const started = generation;
		const computer = await currentComputer();
		const device = computer?.device;
		if (!computer || !device)
			throw new TunnelError("unpaired", "This phone isn't paired with a computer yet.");
		const host = computer.id;
		const url = relaySocketUrl(window.location.origin, RelayPath.client + host);
		let opened: Tunnel;
		try {
			opened = await Tunnel.connect(url, { kind: "device", id: device }, computer.key);
		} catch (error) {
			const problem = tunnelError(error);
			if (problem.problem === "unpaired") await unpaired(host, device);
			throw problem;
		}
		// Dropped while this one connected, say for a newer key: it's out of date.
		if (started !== generation) {
			opened.close();
			throw new TunnelError("lost", "Reconnecting.");
		}
		live = opened;
		opened.onClose((error) => {
			if (live !== opened) return;
			live = null;
			tunnel = null;
			// Closed by the computer because this phone was removed there.
			if (error.problem === "unpaired") void unpaired(host, device);
		});
		return opened;
	})();
	const attempt = tunnel;
	attempt.catch(() => {
		if (tunnel === attempt) tunnel = null;
	});
	return attempt;
}

/**
 * The browser's fetch, to the computer at the other end of the tunnel. Not reaching it comes back as
 * a TunnelError that says why; anything the computer answers comes back as it is.
 */
export async function relayFetch(input: Request | string | URL, init?: RequestInit) {
	let open: Tunnel;
	try {
		open = await getTunnel();
	} catch (error) {
		throw tunnelError(error);
	}
	return open.fetch(input, init);
}

/**
 * A tunnel opened with a one-time pairing code instead of a key: it reaches nothing but asking to
 * pair and hearing the answer. The code works for the relay's handshake and is never sent.
 */
export async function pairingTunnel(host: string, code: string) {
	const { id, secret } = await pairingKey(code);
	const url = relaySocketUrl(window.location.origin, RelayPath.client + host);
	return Tunnel.connect(url, { kind: "pairing", id }, await importSecret(secret));
}

export { type Tunnel, TunnelError, tunnelError };
