import {
	type Bytes,
	type Cipher,
	HandshakeError,
	type Identity,
	type KeyLookup,
	respond,
	UnknownKey,
} from "./crypto";
import { CHUNK, Msg, type MsgType, pack, parseJson, type RequestHead, text, unpack } from "./messages";
import { RelayClose } from "./relay-protocol";
import { FrameSocket } from "./socket";

export type TunnelHandler = (request: Request, identity: Identity) => Promise<Response>;

export type TunnelHooks = {
	/** The phone proved its key. `close` ends the tunnel, say when that device is removed. */
	opened?: (identity: Identity, close: (code: number, reason: string) => void) => void;
	closed?: (identity: Identity) => void;
};

/** More than the biggest real request: six photos at the limit, base64 in JSON. */
const MAX_BODY = 40 * 1024 * 1024;
const HANDSHAKE_MS = 20_000;
/** The phone pings every 20 seconds; a tunnel that's heard nothing for three of those is dead. */
const SILENCE_MS = 60_000;

type Stream = { head: RequestHead; chunks: Uint8Array[]; size: number; abort: AbortController };

/**
 * The computer's end of one phone's tunnel. Answers the handshake with the key the phone names,
 * refuses a phone that can't prove it, then turns each request into a `Request` for `handle`, saying
 * who it's from, and streams the answer back.
 */
export async function serveTunnel(
	ws: WebSocket,
	keyFor: KeyLookup,
	handle: TunnelHandler,
	hooks: TunnelHooks = {},
) {
	const socket = new FrameSocket(ws);
	let cipher: Cipher;
	let identity: Identity;
	try {
		const hello = await socket.next(HANDSHAKE_MS);
		({ cipher, identity } = await respond(
			keyFor,
			hello,
			(frame) => socket.send(frame),
			() => socket.next(HANDSHAKE_MS),
		));
	} catch (error) {
		// The reason tells a phone whether its pairing is gone or its pairing code is.
		const reason =
			error instanceof UnknownKey && error.identity.kind === "pairing" ? "code expired" : "not paired";
		const unpaired = error instanceof HandshakeError;
		socket.close(
			unpaired ? RelayClose.NotPaired : RelayClose.BadRequest,
			unpaired ? reason : "bad handshake",
		);
		return;
	}
	const who = identity;
	hooks.opened?.(who, (code, reason) => socket.close(code, reason));
	socket.onClose(() => hooks.closed?.(who));

	// A dead path may never say it closed; the phone's pings stopping says it instead. Closing ends the
	// tunnel here at once, so the phone stops counting as connected.
	let lastHeard = Date.now();
	const watchdog = setInterval(() => {
		if (Date.now() - lastHeard > SILENCE_MS) socket.close(1000, "silent");
	}, 15_000);
	socket.onClose(() => clearInterval(watchdog));

	const streams = new Map<number, Stream>();
	let sending: Promise<void> = Promise.resolve();
	let closed = false;
	socket.onClose(() => {
		closed = true;
		for (const stream of streams.values()) stream.abort.abort();
		streams.clear();
	});

	const post = (type: MsgType, stream: number, payload?: Uint8Array) => {
		const message = pack(type, stream, payload);
		sending = sending.then(async () => {
			if (!closed) socket.send(await cipher.seal(message));
		});
		sending.catch(() => socket.close(RelayClose.BadRequest, "send failed"));
		return sending;
	};

	const run = async (id: number, stream: Stream) => {
		const { head } = stream;
		try {
			const body =
				head.body && !["GET", "HEAD"].includes(head.method) ? joinChunks(stream.chunks, stream.size) : null;
			const request = new Request(new URL(head.path, "http://kiteline.tunnel"), {
				method: head.method,
				headers: head.headers,
				body,
				signal: stream.abort.signal,
			});
			const response = await handle(request, who);
			if (!streams.has(id)) return;
			await post(
				Msg.Response,
				id,
				new TextEncoder().encode(JSON.stringify({ status: response.status, headers: [...response.headers] })),
			);
			if (response.body) {
				const reader = response.body.getReader();
				stream.abort.signal.addEventListener("abort", () => void reader.cancel().catch(() => {}), {
					once: true,
				});
				for (;;) {
					const { done, value } = await reader.read();
					if (done || !streams.has(id)) break;
					for (let at = 0; at < value.length; at += CHUNK)
						await post(Msg.Data, id, value.subarray(at, at + CHUNK));
				}
			}
			if (streams.delete(id)) await post(Msg.Done, id);
		} catch (error) {
			if (streams.delete(id) && !stream.abort.signal.aborted) {
				await post(Msg.Fail, id, text(error instanceof Error ? error.message : String(error)));
			}
		}
	};

	try {
		for (;;) {
			const frame: Bytes = await socket.next();
			lastHeard = Date.now();
			const { type, stream: id, payload } = unpack(await cipher.open(frame));
			switch (type) {
				case Msg.Ping:
					void post(Msg.Pong, 0);
					break;
				case Msg.Request: {
					if (streams.has(id)) break;
					const stream: Stream = {
						head: parseJson<RequestHead>(payload),
						chunks: [],
						size: 0,
						abort: new AbortController(),
					};
					streams.set(id, stream);
					if (!stream.head.body) void run(id, stream);
					break;
				}
				case Msg.Body: {
					const stream = streams.get(id);
					if (!stream) break;
					stream.size += payload.length;
					if (stream.size > MAX_BODY) {
						streams.delete(id);
						void post(Msg.Fail, id, text("That's too big to send."));
						break;
					}
					stream.chunks.push(payload.slice());
					break;
				}
				case Msg.End: {
					const stream = streams.get(id);
					if (stream) void run(id, stream);
					break;
				}
				case Msg.Cancel: {
					const stream = streams.get(id);
					streams.delete(id);
					stream?.abort.abort();
					break;
				}
			}
		}
	} catch {
		socket.close(1000, "closing");
	}
}

function joinChunks(chunks: Uint8Array[], size: number): Bytes {
	const out = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}
