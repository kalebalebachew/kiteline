import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Identity, KeyLookup } from "@kiteline/api/tunnel/crypto";
import { serveTunnel } from "@kiteline/api/tunnel/host";
import {
	fromBase64Url,
	type HostMessage,
	hostIdFor,
	RelayClose,
	type RelayMessage,
	RelayPath,
	relaySocketUrl,
	toBase64Url,
} from "@kiteline/api/tunnel/relay-protocol";

/**
 * This computer's side of the relay: one standing connection out to it, over which the relay asks
 * for a channel whenever a phone wants this computer. Each channel is a sealed tunnel, opened with the
 * phone's own key or, while it asks to pair, the one-time code it scanned; what comes through is
 * answered by the same API the phone would reach directly, as that device.
 */

/** How often this computer pings the relay, and how long a quiet connection lasts before it's given up. */
const PING_MS = 20_000;
const SILENCE_MS = 50_000;

type Options = {
	relay: string;
	home: string;
	version: string;
	keyFor: KeyLookup;
	handle: (request: Request, identity: Identity) => Response | Promise<Response>;
	/** A tunnel opened; what this returns runs when it closes. */
	track?: (identity: Identity) => (() => void) | undefined;
	log: (message: string) => void;
};

/** The relay's secret for this computer, kept beside its other keys. Its hash is our address. */
function relaySecret(home: string) {
	const file = join(home, "relay.json");
	try {
		const stored = JSON.parse(readFileSync(file, "utf8")) as { secret?: unknown };
		if (typeof stored.secret === "string" && /^[\w-]{43}$/.test(stored.secret)) return stored.secret;
	} catch {
		// First time with the relay: make one below.
	}
	const secret = toBase64Url(randomBytes(32));
	mkdirSync(home, { recursive: true, mode: 0o700 });
	writeFileSync(file, `${JSON.stringify({ secret, createdAt: new Date().toISOString() }, null, 2)}\n`, {
		mode: 0o600,
	});
	return secret;
}

/**
 * Only the API and the pairing check go through, and only what each key is for: a paired phone's
 * reaches the API, a pairing code's reaches nothing but asking to pair. The app comes from the relay.
 */
function allowed(request: Request, identity: Identity) {
	const { pathname } = new URL(request.url);
	const { method } = request;
	if (pathname === "/auth/status") return method === "GET";
	if (identity.kind === "pairing") {
		if (pathname === "/auth/pair") return method === "POST";
		return /^\/auth\/pair\/[\w-]+$/.test(pathname) && (method === "GET" || method === "DELETE");
	}
	if (pathname === "/auth/logout") return method === "POST";
	return (method === "POST" || method === "GET") && pathname.startsWith("/rpc/");
}

export async function hostAddress(home: string) {
	return hostIdFor(fromBase64Url(relaySecret(home)));
}

export async function startRelay(options: Options) {
	const secret = relaySecret(options.home);
	const hostId = await hostIdFor(fromBase64Url(secret));
	const open = new Map<string, Set<(code: number, reason: string) => void>>();
	const keyOf = (identity: Identity) => `${identity.kind}:${identity.id}`;

	// The tunnel proved who's at the other end; nothing that came with the request can say otherwise.
	const handle = async (request: Request, identity: Identity) => {
		if (!allowed(request, identity)) return new Response("Not through the relay.", { status: 404 });
		const headers = new Headers(request.headers);
		headers.delete("cookie");
		headers.delete("authorization");
		return options.handle(new Request(request, { headers }), identity);
	};

	type Closer = (code: number, reason: string) => void;
	/** Keeps each open tunnel by its key, to end them when a device is removed. Returns the cleanup. */
	const track = (identity: Identity, close: Closer) => {
		const key = keyOf(identity);
		const closers = open.get(key) ?? new Set<Closer>();
		open.set(key, closers);
		closers.add(close);
		const release = options.track?.(identity);
		// A pairing tunnel lasts only as long as the pairing it's for.
		const limit =
			identity.kind === "pairing"
				? setTimeout(() => close(RelayClose.NotPaired, "code expired"), 30 * 60_000)
				: null;
		limit?.unref();
		return () => {
			if (limit) clearTimeout(limit);
			closers.delete(close);
			if (!closers.size) open.delete(key);
			release?.();
		};
	};

	let attempt = 0;
	let connected = false;
	let stopped = false;
	let socket: WebSocket | null = null;
	/** Stops the current connection's watchdog, when the relay connection is stopped for good. */
	let quiet: (() => void) | null = null;

	const connect = () => {
		if (stopped) return;
		const ws = new WebSocket(relaySocketUrl(options.relay, RelayPath.host));
		socket = ws;
		let lastHeard = Date.now();
		let gone = false;

		/**
		 * Done with this connection, whether it closed or only went quiet. A dead one may never finish
		 * closing, which can take a quarter of an hour, so this doesn't wait for it to: it reconnects.
		 */
		const lost = (code?: number) => {
			if (gone) return;
			gone = true;
			clearInterval(watchdog);
			try {
				ws.close();
			} catch {}
			if (stopped) return;
			if (connected) options.log("Lost the relay; reconnecting.");
			else if (attempt === 0) {
				const why = code === RelayClose.TooMany ? "it's full right now" : "couldn't reach it";
				options.log(`The relay at ${options.relay} isn't answering (${why}); retrying in the background.`);
			}
			connected = false;
			attempt++;
			// Quick at first, then every half minute: a relay that restarts is back within seconds.
			const wait = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) + Math.random() * 1000;
			setTimeout(connect, wait).unref();
		};

		// The relay answers every ping; a connection that's gone quiet, or never opened, is a dead one.
		const watchdog = setInterval(() => {
			if (Date.now() - lastHeard > SILENCE_MS) lost();
			else if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "ping" } satisfies HostMessage));
		}, PING_MS);
		quiet = () => clearInterval(watchdog);

		ws.addEventListener("open", () => {
			if (gone) return;
			lastHeard = Date.now();
			ws.send(JSON.stringify({ t: "hello", secret, version: options.version } satisfies HostMessage));
		});
		ws.addEventListener("message", (event) => {
			if (gone) return;
			lastHeard = Date.now();
			let message: RelayMessage;
			try {
				message = JSON.parse(String(event.data)) as RelayMessage;
			} catch {
				return;
			}
			if (message.t === "ready") {
				attempt = 0;
				if (!connected) options.log("Connected to the relay: phones can reach this computer from anywhere.");
				connected = true;
			} else if (message.t === "open" && /^[\w-]{22}$/.test(message.channel)) {
				const data = new WebSocket(relaySocketUrl(options.relay, RelayPath.data + message.channel));
				let done: (() => void) | undefined;
				void serveTunnel(data, options.keyFor, handle, {
					opened: (identity, close) => {
						done = track(identity, close);
					},
					closed: () => done?.(),
				});
			}
		});
		ws.addEventListener("close", (event) => lost(event.code));
		ws.addEventListener("error", () => {});
	};
	connect();

	return {
		hostId,
		get connected() {
			return connected;
		},
		/** Ends every tunnel open with this key, say because its device was just removed. */
		disconnect(identity: Identity, reason = "not paired") {
			for (const close of [...(open.get(keyOf(identity)) ?? [])]) close(RelayClose.NotPaired, reason);
		},
		stop() {
			stopped = true;
			quiet?.();
			socket?.close();
		},
	};
}
