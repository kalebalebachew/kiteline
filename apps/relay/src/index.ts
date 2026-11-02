import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { dirname, join } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";

import {
	fromBase64Url,
	type HostMessage,
	hostIdFor,
	PAIRED,
	RelayClose,
	type RelayMessage,
	RelayPath,
	toBase64Url,
} from "@kiteline/api/tunnel/relay-protocol";
import { type RawData, type WebSocket, WebSocketServer } from "ws";

import { AppSource } from "./app";
import { serveStatic } from "./static";

/**
 * Kiteline's relay. A computer keeps one connection here; a phone asks for that computer by its
 * address; the relay asks the computer to open a channel and joins the two. From then on it passes
 * bytes both ways and never reads them: they're sealed end to end (packages/api/src/tunnel).
 *
 * It keeps nothing on disk but the web app it serves, holds no accounts, and logs no addresses.
 */

const PORT = Number(process.env.PORT ?? 3880);
const HOST = process.env.HOST ?? "127.0.0.1";
const here = dirname(fileURLToPath(import.meta.url));

const LIMITS = {
	hosts: 5000,
	channelsPerHost: 16,
	controlMessage: 4 * 1024,
	/** A sealed frame: a 64 KB chunk plus framing, with room to spare. */
	frame: 512 * 1024,
	/** Per channel, per minute: plenty for a session's text and photos, not for a free proxy. */
	bytesPerMinute: 200 * 1024 * 1024,
	connectionsPerMinute: 120,
	hostAnswerMs: 10_000,
	helloMs: 10_000,
	heartbeatMs: 25_000,
} as const;

const app = new AppSource({
	bundled: join(here, "web"),
	fixed: process.env.RELAY_APP_DIR || null,
	cache: process.env.RELAY_DATA ? join(process.env.RELAY_DATA, "app") : join(here, "..", "data", "app"),
	log,
});

type Host = { id: string; ws: WebSocket; version: string; channels: Set<string> };
type Waiting = { hostId: string; client: WebSocket; timer: ReturnType<typeof setTimeout> };

const hosts = new Map<string, Host>();
const waiting = new Map<string, Waiting>();
const alive = new WeakMap<WebSocket, boolean>();

function log(message: string) {
	console.log(`[relay] ${message}`);
}

/** The phone's address, from Caddy in front; only trusted when the connection is Caddy's. */
function clientAddress(req: IncomingMessage) {
	const remote = req.socket.remoteAddress ?? "";
	const loopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
	const forwarded = req.headers["x-forwarded-for"];
	if (loopback && typeof forwarded === "string" && forwarded)
		return forwarded.split(",")[0]?.trim() ?? remote;
	return remote;
}

/** A few connections a minute per address keeps one misbehaving client from crowding out the rest. */
const recent = new Map<string, { count: number; since: number }>();
function allowConnection(address: string) {
	const now = Date.now();
	const entry = recent.get(address);
	if (!entry || now - entry.since > 60_000) {
		recent.set(address, { count: 1, since: now });
		return true;
	}
	entry.count++;
	return entry.count <= LIMITS.connectionsPerMinute;
}
setInterval(() => {
	const now = Date.now();
	for (const [address, entry] of recent) if (now - entry.since > 60_000) recent.delete(address);
}, 60_000).unref();

function send(ws: WebSocket, message: RelayMessage) {
	if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function closeWith(ws: WebSocket, code: number, reason: string) {
	try {
		ws.close(code, reason);
	} catch {
		ws.terminate();
	}
}

/** Ping every socket; one that doesn't answer is gone, whatever its TCP connection thinks. */
function watch(ws: WebSocket) {
	alive.set(ws, true);
	ws.on("pong", () => alive.set(ws, true));
}

const sockets = new WebSocketServer({ noServer: true, maxPayload: LIMITS.frame, perMessageDeflate: false });

const heartbeat = setInterval(() => {
	for (const ws of sockets.clients) {
		if (alive.get(ws) === false) {
			ws.terminate();
			continue;
		}
		alive.set(ws, false);
		ws.ping();
	}
}, LIMITS.heartbeatMs);

// --- Computers ---------------------------------------------------------------------------------

function acceptHost(ws: WebSocket) {
	watch(ws);
	let host: Host | null = null;
	const hello = setTimeout(() => closeWith(ws, RelayClose.BadRequest, "say hello"), LIMITS.helloMs);

	ws.on("message", async (data, isBinary) => {
		if (isBinary || (data as Buffer).length > LIMITS.controlMessage)
			return closeWith(ws, RelayClose.BadRequest, "bad message");
		let message: HostMessage;
		try {
			message = JSON.parse(data.toString()) as HostMessage;
		} catch {
			return closeWith(ws, RelayClose.BadRequest, "bad message");
		}
		if (message.t === "ping") {
			if (host) send(ws, { t: "pong" });
			return;
		}
		if (message.t !== "hello" || host) return;
		clearTimeout(hello);
		if (typeof message.secret !== "string" || !/^[\w-]{43}$/.test(message.secret)) {
			return closeWith(ws, RelayClose.BadRequest, "bad secret");
		}
		if (hosts.size >= LIMITS.hosts) return closeWith(ws, RelayClose.TooMany, "relay is full");
		const id = await hostIdFor(fromBase64Url(message.secret));
		// The same computer reconnecting: the newer connection wins.
		const previous = hosts.get(id);
		if (previous) closeWith(previous.ws, RelayClose.Replaced, "replaced by a newer connection");
		host = { id, ws, version: String(message.version ?? "").slice(0, 32), channels: new Set() };
		hosts.set(id, host);
		send(ws, { t: "ready", hostId: id });
		app.noticeVersion(host.version);
	});

	ws.on("close", () => {
		clearTimeout(hello);
		if (host && hosts.get(host.id) === host) hosts.delete(host.id);
	});
	ws.on("error", () => ws.terminate());
}

// --- Phones ------------------------------------------------------------------------------------

function acceptClient(ws: WebSocket, hostId: string) {
	watch(ws);
	const host = hosts.get(hostId);
	// A computer whose connection is closing can't answer: it's as good as gone.
	if (!host || host.ws.readyState !== host.ws.OPEN)
		return closeWith(ws, RelayClose.HostOffline, "computer not connected");
	if (host.channels.size >= LIMITS.channelsPerHost)
		return closeWith(ws, RelayClose.TooMany, "too many connections");

	const channel = toBase64Url(randomBytes(16));
	host.channels.add(channel);
	const timer = setTimeout(() => {
		waiting.delete(channel);
		host.channels.delete(channel);
		closeWith(ws, RelayClose.HostSilent, "computer didn't answer");
	}, LIMITS.hostAnswerMs);
	waiting.set(channel, { hostId, client: ws, timer });
	send(host.ws, { t: "open", channel });

	ws.on("close", () => {
		const entry = waiting.get(channel);
		if (entry?.client === ws) {
			clearTimeout(entry.timer);
			waiting.delete(channel);
			host.channels.delete(channel);
		}
	});
	ws.on("error", () => ws.terminate());
}

// --- Joining the two ---------------------------------------------------------------------------

function acceptData(ws: WebSocket, channel: string) {
	watch(ws);
	const entry = waiting.get(channel);
	if (!entry) return closeWith(ws, RelayClose.BadRequest, "no such channel");
	waiting.delete(channel);
	clearTimeout(entry.timer);
	const { client } = entry;
	const host = hosts.get(entry.hostId);

	let budget = { bytes: 0, since: Date.now() };
	const pipe = (from: WebSocket, to: WebSocket) => {
		from.on("message", (data: RawData, isBinary: boolean) => {
			// Only sealed frames cross; anything else is noise.
			if (!isBinary || to.readyState !== to.OPEN) return;
			const size = (data as Buffer).length;
			const now = Date.now();
			if (now - budget.since > 60_000) budget = { bytes: 0, since: now };
			budget.bytes += size;
			if (budget.bytes > LIMITS.bytesPerMinute) {
				closeWith(client, RelayClose.TooMany, "too much traffic");
				closeWith(ws, RelayClose.TooMany, "too much traffic");
				return;
			}
			to.send(data, { binary: true });
			// A slow reader slows the writer instead of piling up here.
			if (to.bufferedAmount > 4 * 1024 * 1024) {
				from.pause();
				const resume = setInterval(() => {
					if (to.readyState !== to.OPEN || to.bufferedAmount < 1024 * 1024) {
						clearInterval(resume);
						from.resume();
					}
				}, 50);
			}
		});
		from.on("close", (code: number, reason: Buffer) => {
			host?.channels.delete(channel);
			const passOn = code >= 4000 && code < 5000 ? code : 1000;
			if (to.readyState === to.OPEN || to.readyState === to.CONNECTING)
				closeWith(to, passOn, reason.toString().slice(0, 120));
		});
		from.on("error", () => from.terminate());
	};
	pipe(client, ws);
	pipe(ws, client);
	if (client.readyState === client.OPEN) client.send(PAIRED);
	else closeWith(ws, 1000, "phone left");
}

// --- HTTP ----------------------------------------------------------------------------------------

const server = createServer((req, res) => {
	const path = (req.url ?? "/").split("?")[0] ?? "/";
	if (path === "/healthz") {
		res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }).end("ok");
		return;
	}
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.writeHead(405).end();
		return;
	}
	serveStatic(req, res, path, app.current());
});

server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
	const path = (req.url ?? "").split("?")[0] ?? "";
	const reject = (status: number) => {
		socket.end(`HTTP/1.1 ${status} ${status === 429 ? "Too Many Requests" : "Not Found"}\r\n\r\n`);
	};
	if (!allowConnection(clientAddress(req))) return reject(429);

	let accept: ((ws: WebSocket) => void) | null = null;
	if (path === RelayPath.host) accept = acceptHost;
	else if (path.startsWith(RelayPath.client)) {
		const hostId = path.slice(RelayPath.client.length);
		if (/^[\w-]{22}$/.test(hostId)) accept = (ws) => acceptClient(ws, hostId);
	} else if (path.startsWith(RelayPath.data)) {
		const channel = path.slice(RelayPath.data.length);
		if (/^[\w-]{22}$/.test(channel)) accept = (ws) => acceptData(ws, channel);
	}
	if (!accept) return reject(404);
	const run = accept;
	sockets.handleUpgrade(req, socket, head, (ws) => run(ws));
});

server.listen(PORT, HOST, () => {
	const version = existsSync(join(here, "web", "version.json"))
		? (JSON.parse(readFileSync(join(here, "web", "version.json"), "utf8")) as { version: string }).version
		: "none";
	log(`listening on ${HOST}:${PORT}, bundled app ${version}`);
	app.start();
});

function shutdown() {
	clearInterval(heartbeat);
	app.stop();
	for (const ws of sockets.clients) closeWith(ws, RelayClose.ShuttingDown, "relay restarting");
	server.close();
	setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
