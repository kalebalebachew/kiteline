import { Tunnel, TunnelError, tunnelError } from "@kiteline/api/tunnel/client";
import { deviceSecret, importSecret, type SecretKey } from "@kiteline/api/tunnel/crypto";
import { RelayPath, relaySocketUrl } from "@kiteline/api/tunnel/relay-protocol";

/**
 * Kiteline through the relay: the app comes from the relay, and everything it asks of the computer
 * goes through a sealed tunnel. The computer's key lives in IndexedDB as a key the browser can use
 * but can't hand back, so even a script that got into the page couldn't carry it off.
 */

/** The relay marks the page it serves; the computer's own copy has no mark. */
export const onRelay =
	typeof document !== "undefined" && !!document.querySelector('meta[name="kiteline-relay"]');

const DB = "kiteline-relay";
const STORE = "computers";
const CURRENT = "kiteline:relay:computer";

type Computer = { id: string; key: SecretKey; pairedAt: number };

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

/** Reads `host=…&pair=…` from a pairing link, or the part of it after #. */
export function parseRelayLink(value: string) {
	const text = value.trim();
	const host = /host=([\w-]{22})/.exec(text)?.[1];
	const pair = /pair=([\w-]+)/.exec(text)?.[1];
	return host && pair ? { host, pair } : null;
}

/** Keeps this computer's key on this phone. The pairing code itself is never stored. */
export async function rememberComputer(host: string, pair: string) {
	const key = await importSecret(await deviceSecret(pair));
	await store("readwrite", (s) => s.put({ id: host, key, pairedAt: Date.now() }));
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

export async function hasComputer() {
	return !!(await currentComputer());
}

let tunnel: Promise<Tunnel> | null = null;
let live: Tunnel | null = null;

function dropTunnel() {
	live?.close();
	live = null;
	tunnel = null;
}

/** One tunnel at a time, opened when first needed and again after it drops. */
function getTunnel() {
	tunnel ??= (async () => {
		const computer = await currentComputer();
		if (!computer) throw new TunnelError("unpaired", "This phone isn't paired with a computer yet.");
		const url = relaySocketUrl(window.location.origin, RelayPath.client + computer.id);
		const opened = await Tunnel.connect(url, computer.key);
		live = opened;
		opened.onClose(() => {
			if (live !== opened) return;
			live = null;
			tunnel = null;
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

export { TunnelError };
