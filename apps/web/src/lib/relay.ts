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

/** Keeps this phone's key for a computer, once the computer allowed it. Only the browser can use it. */
export async function rememberComputer(host: string, device: string, secret: string) {
	const key = await importSecret(fromBase64Url(secret));
	await store("readwrite", (s) => s.put({ id: host, device, key, pairedAt: Date.now() }));
	try {
		localStorage.setItem(CURRENT, host);
	} catch {}
	dropTunnel();
}

export async function forgetComputer() {
	const id = currentId();
	dropTunnel();
	try {
		localStorage.removeItem(CURRENT);
	} catch {}
	if (id) await store("readwrite", (s) => s.delete(id)).catch(() => {});
}

async function currentComputer() {
	const id = currentId();
	if (!id) return null;
	return ((await store("readonly", (s) => s.get(id)).catch(() => undefined)) as Computer | undefined) ?? null;
}

/** Paired, paired before pairing changed (whose key opens nothing now), or not at all. */
export async function computerState(): Promise<"paired" | "outdated" | "none"> {
	const computer = await currentComputer();
	if (!computer) return "none";
	return computer.device ? "paired" : "outdated";
}

let tunnel: Promise<Tunnel> | null = null;
let live: Tunnel | null = null;

/** Told when the computer stops knowing this phone, say because it was removed on another device. */
const unpairedListeners = new Set<() => void>();
export function onUnpaired(listener: () => void) {
	unpairedListeners.add(listener);
	return () => void unpairedListeners.delete(listener);
}

function unpaired() {
	void forgetComputer();
	for (const listener of unpairedListeners) listener();
}

function dropTunnel() {
	live?.close();
	live = null;
	tunnel = null;
}

/** One tunnel at a time, opened when first needed and again after it drops. */
function getTunnel() {
	tunnel ??= (async () => {
		const computer = await currentComputer();
		if (!computer?.device) throw new TunnelError("unpaired", "This phone isn't paired with a computer yet.");
		const url = relaySocketUrl(window.location.origin, RelayPath.client + computer.id);
		const opened = await Tunnel.connect(url, { kind: "device", id: computer.device }, computer.key);
		live = opened;
		opened.onClose((error) => {
			if (live !== opened) return;
			live = null;
			tunnel = null;
			// Closed by the computer because this phone was removed: its key opens nothing now.
			if (error.problem === "unpaired") unpaired();
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
		const problem = tunnelError(error);
		if (problem.problem === "unpaired" && currentId()) unpaired();
		throw problem;
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
