import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { deviceSecret, importSecret } from "@kiteline/api/tunnel/crypto";
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
 * for a channel whenever a phone wants this computer. Each channel is a sealed tunnel; what comes
 * through it is answered by the same API the phone would reach directly, as a paired device.
 */

type Options = {
	relay: string;
	home: string;
	token: string;
	version: string;
	handle: (request: Request) => Response | Promise<Response>;
	log: (message: string) => void;
};

/** The relay's secret for this computer, kept beside the pairing token. Its hash is our address. */
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

/** Only the API and the pairing check go through: the phone's app comes from the relay itself. */
function allowed(request: Request) {
	const { pathname } = new URL(request.url);
	return (
		(request.method === "POST" || request.method === "GET") &&
		(pathname.startsWith("/rpc/") || pathname === "/auth/status")
	);
}

export async function hostAddress(home: string) {
	return hostIdFor(fromBase64Url(relaySecret(home)));
}

export async function startRelay(options: Options) {
	const secret = relaySecret(options.home);
	const hostId = await hostIdFor(fromBase64Url(secret));
	const pairingKey = await importSecret(await deviceSecret(options.token));

	// A tunnel has already proved the pairing, so it speaks as a paired device.
	const handle = async (request: Request) => {
		if (!allowed(request)) return new Response("Not through the relay.", { status: 404 });
		const headers = new Headers(request.headers);
		headers.delete("cookie");
		headers.set("authorization", `Bearer ${options.token}`);
		return options.handle(new Request(request, { headers }));
	};

	let attempt = 0;
	let connected = false;
	let stopped = false;
	let socket: WebSocket | null = null;
	let silence: ReturnType<typeof setInterval> | null = null;

	const connect = () => {
		if (stopped) return;
		const ws = new WebSocket(relaySocketUrl(options.relay, RelayPath.host));
		socket = ws;
		let lastHeard = Date.now();

		ws.addEventListener("open", () => {
			ws.send(JSON.stringify({ t: "hello", secret, version: options.version } satisfies HostMessage));
			silence = setInterval(() => {
				// The relay answers every ping; a connection that's gone quiet is a dead one.
				if (Date.now() - lastHeard > 75_000) ws.close();
				else ws.send(JSON.stringify({ t: "ping" } satisfies HostMessage));
			}, 30_000);
		});
		ws.addEventListener("message", (event) => {
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
				void serveTunnel(data, pairingKey, handle);
			}
		});
		ws.addEventListener("close", (event) => {
			if (silence) clearInterval(silence);
			if (stopped) return;
			if (connected) options.log("Lost the relay; reconnecting.");
			else if (attempt === 0) {
				const why = event.code === RelayClose.TooMany ? "it's full right now" : "couldn't reach it";
				options.log(`The relay at ${options.relay} isn't answering (${why}); retrying in the background.`);
			}
			connected = false;
			attempt++;
			// Quick at first, then every half minute: a relay that restarts is back within seconds.
			const wait = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) + Math.random() * 1000;
			setTimeout(connect, wait).unref();
		});
		ws.addEventListener("error", () => {});
	};
	connect();

	return {
		hostId,
		get connected() {
			return connected;
		},
		stop() {
			stopped = true;
			if (silence) clearInterval(silence);
			socket?.close();
		},
	};
}
