import { type Bytes, type Cipher, HandshakeError, initiate, type SecretKey } from "./crypto";
import {
	CHUNK,
	json,
	Msg,
	type MsgType,
	pack,
	parseJson,
	type ResponseHead,
	readText,
	unpack,
} from "./messages";
import { PAIRED, RelayClose } from "./relay-protocol";
import { FrameSocket, opened, SocketClosed, SocketTimeout } from "./socket";

export type TunnelProblem = "offline" | "unpaired" | "silent" | "lost";

/** Why the tunnel isn't there, in words a person can act on. */
export class TunnelError extends Error {
	constructor(
		readonly problem: TunnelProblem,
		message: string,
	) {
		super(message);
	}
}

const MESSAGES: Record<TunnelProblem, string> = {
	offline: "Your computer isn't connected to the relay. Check that Kiteline is running there with --relay.",
	unpaired: "This phone isn't paired with that computer any more. Scan its pairing code again.",
	silent: "Your computer didn't answer. Check that Kiteline is still running there.",
	lost: "Lost the connection to your computer.",
};

function problemFor(error: unknown): TunnelProblem {
	if (error instanceof TunnelError) return error.problem;
	if (error instanceof HandshakeError) return "unpaired";
	if (error instanceof SocketClosed) {
		if (error.code === RelayClose.HostOffline) return "offline";
		if (error.code === RelayClose.NotPaired) return "unpaired";
		if (error.code === RelayClose.HostSilent) return "silent";
	}
	if (error instanceof SocketTimeout) return "silent";
	return "lost";
}

export const tunnelError = (error: unknown) =>
	error instanceof TunnelError ? error : new TunnelError(problemFor(error), MESSAGES[problemFor(error)]);

type Pending = {
	resolve: (response: Response) => void;
	reject: (error: unknown) => void;
	body?: ReadableStreamDefaultController<Uint8Array>;
};

const NO_BODY = new Set([101, 103, 204, 205, 304]);
const PING_MS = 20_000;
const SILENCE_MS = 50_000;

/**
 * The phone's end of a sealed tunnel to its computer, through the relay. `fetch` works like the
 * browser's, so the app's API client uses it unchanged; responses stream, and aborting cancels.
 */
export class Tunnel {
	private nextStream = 1;
	private readonly streams = new Map<number, Pending>();
	private sending: Promise<void> = Promise.resolve();
	private lastHeard = Date.now();
	private readonly timer: ReturnType<typeof setInterval>;
	private failure: TunnelError | null = null;
	private readonly listeners = new Set<(error: TunnelError) => void>();

	private constructor(
		private readonly socket: FrameSocket,
		private readonly cipher: Cipher,
	) {
		socket.onClose((code, reason) => this.fail(tunnelError(new SocketClosed(code, reason))));
		this.timer = setInterval(() => {
			if (Date.now() - this.lastHeard > SILENCE_MS) this.fail(tunnelError(new SocketTimeout()));
			else this.post(Msg.Ping, 0);
		}, PING_MS);
		void this.receive();
	}

	/** Reaches the computer through the relay and proves both ends hold the pairing. */
	static async connect(url: string, secret: SecretKey, timeoutMs = 20_000): Promise<Tunnel> {
		const ws = new WebSocket(url);
		const socket = new FrameSocket(ws);
		try {
			await opened(ws, timeoutMs);
			const note = await socket.nextText(timeoutMs);
			if (note !== PAIRED) throw new TunnelError("lost", MESSAGES.lost);
			const cipher = await initiate(
				secret,
				(frame) => socket.send(frame),
				() => socket.next(timeoutMs),
			);
			return new Tunnel(socket, cipher);
		} catch (error) {
			socket.close(1000, "done");
			throw tunnelError(error);
		}
	}

	get error() {
		return this.failure;
	}

	onClose(listener: (error: TunnelError) => void) {
		if (this.failure) listener(this.failure);
		else this.listeners.add(listener);
	}

	close() {
		this.fail(new TunnelError("lost", "Closed."));
	}

	private fail(error: TunnelError) {
		if (this.failure) return;
		this.failure = error;
		clearInterval(this.timer);
		this.socket.close(1000, "closing");
		for (const pending of this.streams.values()) {
			if (pending.body) pending.body.error(error);
			else pending.reject(error);
		}
		this.streams.clear();
		for (const listener of this.listeners) listener(error);
		this.listeners.clear();
	}

	/** Seals in send order: the counter in each nonce must match the order frames leave in. */
	private post(type: MsgType, stream: number, payload?: Uint8Array) {
		const message = pack(type, stream, payload);
		this.sending = this.sending.then(async () => {
			if (this.failure) return;
			this.socket.send(await this.cipher.seal(message));
		});
		this.sending.catch((error: unknown) => this.fail(tunnelError(error)));
	}

	private async receive() {
		try {
			for (;;) {
				const frame: Bytes = await this.socket.next();
				const { type, stream, payload } = unpack(await this.cipher.open(frame));
				this.lastHeard = Date.now();
				this.dispatch(type, stream, payload);
			}
		} catch (error) {
			this.fail(tunnelError(error));
		}
	}

	private dispatch(type: MsgType, stream: number, payload: Bytes) {
		if (type === Msg.Pong || type === Msg.Ping) return;
		const pending = this.streams.get(stream);
		if (!pending) return;
		switch (type) {
			case Msg.Response: {
				const head = parseJson<ResponseHead>(payload);
				let body: ReadableStream<Uint8Array> | null = null;
				if (!NO_BODY.has(head.status)) {
					body = new ReadableStream<Uint8Array>({
						start: (controller) => {
							pending.body = controller;
						},
						cancel: () => {
							this.streams.delete(stream);
							this.post(Msg.Cancel, stream);
						},
					});
				}
				pending.resolve(new Response(body, { status: head.status, headers: head.headers }));
				if (!body) this.streams.delete(stream);
				break;
			}
			case Msg.Data:
				// Copied: the frame's buffer belongs to the decryption.
				pending.body?.enqueue(payload.slice());
				break;
			case Msg.Done:
				pending.body?.close();
				this.streams.delete(stream);
				break;
			case Msg.Fail: {
				const error = new TypeError(readText(payload) || "The computer couldn't answer that.");
				if (pending.body) pending.body.error(error);
				else pending.reject(error);
				this.streams.delete(stream);
				break;
			}
		}
	}

	/** Like the browser's fetch, to the computer at the other end. */
	fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
		if (this.failure) throw this.failure;
		const request = new Request(input, init);
		const signal = init?.signal ?? request.signal;
		if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
		const url = new URL(request.url);
		const body =
			request.method === "GET" || request.method === "HEAD"
				? null
				: new Uint8Array(await request.arrayBuffer());

		const stream = this.nextStream;
		this.nextStream += 2;
		const response = new Promise<Response>((resolve, reject) => {
			this.streams.set(stream, { resolve, reject });
		});
		const onAbort = () => {
			const pending = this.streams.get(stream);
			if (!pending) return;
			this.streams.delete(stream);
			this.post(Msg.Cancel, stream);
			const reason = signal?.reason ?? new DOMException("Aborted", "AbortError");
			if (pending.body) pending.body.error(reason);
			else pending.reject(reason);
		};
		signal?.addEventListener("abort", onAbort, { once: true });

		const headers = [...request.headers].filter(([name]) => name !== "cookie" && name !== "authorization");
		this.post(
			Msg.Request,
			stream,
			json({ method: request.method, path: url.pathname + url.search, headers, body: !!body?.length }),
		);
		if (body?.length) {
			for (let at = 0; at < body.length; at += CHUNK)
				this.post(Msg.Body, stream, body.subarray(at, at + CHUNK));
			this.post(Msg.End, stream);
		}
		return response;
	};
}
