import type { Bytes } from "./crypto";

/** A WebSocket's messages as two in-order queues: frames for the tunnel, text for the relay's notes. */
export class FrameSocket {
	private readonly frames: Bytes[] = [];
	private readonly texts: string[] = [];
	private readonly waiting: {
		binary: boolean;
		resolve: (value: Bytes | string) => void;
		reject: (error: Error) => void;
	}[] = [];
	private ended: { code: number; reason: string } | null = null;
	private readonly closeListeners = new Set<(code: number, reason: string) => void>();

	constructor(readonly ws: WebSocket) {
		ws.binaryType = "arraybuffer";
		ws.addEventListener("message", (event) => {
			const data = event.data;
			if (typeof data === "string") this.deliver(false, data);
			else if (data instanceof ArrayBuffer) this.deliver(true, new Uint8Array(data));
		});
		ws.addEventListener("close", (event) => this.end(event.code, event.reason));
		ws.addEventListener("error", () => this.end(1006, "connection error"));
	}

	get closed() {
		return this.ended;
	}

	onClose(listener: (code: number, reason: string) => void) {
		if (this.ended) listener(this.ended.code, this.ended.reason);
		else this.closeListeners.add(listener);
	}

	private deliver(binary: boolean, value: Bytes | string) {
		const at = this.waiting.findIndex((w) => w.binary === binary);
		if (at !== -1) {
			const [waiter] = this.waiting.splice(at, 1);
			waiter?.resolve(value);
		} else if (binary) this.frames.push(value as Bytes);
		else this.texts.push(value as string);
	}

	private end(code: number, reason: string) {
		if (this.ended) return;
		this.ended = { code, reason };
		const error = new SocketClosed(code, reason);
		for (const waiter of this.waiting.splice(0)) waiter.reject(error);
		for (const listener of this.closeListeners) listener(code, reason);
		this.closeListeners.clear();
	}

	private take(binary: boolean, timeoutMs?: number): Promise<Bytes | string> {
		const queued = binary ? this.frames.shift() : this.texts.shift();
		if (queued !== undefined) return Promise.resolve(queued);
		if (this.ended) return Promise.reject(new SocketClosed(this.ended.code, this.ended.reason));
		return new Promise((resolve, reject) => {
			const waiter = { binary, resolve, reject };
			this.waiting.push(waiter);
			if (timeoutMs !== undefined) {
				setTimeout(() => {
					const at = this.waiting.indexOf(waiter);
					if (at === -1) return;
					this.waiting.splice(at, 1);
					reject(new SocketTimeout());
				}, timeoutMs);
			}
		});
	}

	next(timeoutMs?: number) {
		return this.take(true, timeoutMs) as Promise<Bytes>;
	}

	nextText(timeoutMs?: number) {
		return this.take(false, timeoutMs) as Promise<string>;
	}

	send(frame: Bytes) {
		if (this.ws.readyState === WebSocket.OPEN) this.ws.send(frame);
	}

	close(code: number, reason: string) {
		try {
			this.ws.close(code, reason.slice(0, 120));
		} catch {
			this.ws.close();
		}
		this.end(code, reason);
	}
}

export class SocketClosed extends Error {
	constructor(
		readonly code: number,
		readonly reason: string,
	) {
		super(reason || `Connection closed (${code}).`);
	}
}

export class SocketTimeout extends Error {
	constructor() {
		super("Timed out.");
	}
}

/** Waits for a socket to open, or says why it didn't. */
export function opened(ws: WebSocket, timeoutMs: number) {
	return new Promise<void>((resolve, reject) => {
		if (ws.readyState === WebSocket.OPEN) return resolve();
		const timer = setTimeout(() => reject(new SocketTimeout()), timeoutMs);
		ws.addEventListener("open", () => {
			clearTimeout(timer);
			resolve();
		});
		ws.addEventListener("close", (event) => {
			clearTimeout(timer);
			reject(new SocketClosed(event.code, event.reason));
		});
	});
}
