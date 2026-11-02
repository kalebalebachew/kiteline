import { type Bytes, concat } from "./crypto";

/**
 * What travels inside the sealed tunnel: HTTP requests from the phone and streamed responses from
 * the computer, several at once, each on its own numbered stream.
 */
export const Msg = {
	Request: 1,
	Body: 2,
	End: 3,
	Cancel: 4,
	Response: 0x11,
	Data: 0x12,
	Done: 0x13,
	Fail: 0x14,
	Ping: 0x20,
	Pong: 0x21,
} as const;
export type MsgType = (typeof Msg)[keyof typeof Msg];

export type RequestHead = { method: string; path: string; headers: [string, string][]; body: boolean };
export type ResponseHead = { status: number; headers: [string, string][] };

/** Body and response chunks stay under this, so one big reply never holds up the others for long. */
export const CHUNK = 64 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function pack(type: MsgType, stream: number, payload?: Uint8Array): Bytes {
	const head = new Uint8Array(5);
	head[0] = type;
	new DataView(head.buffer).setUint32(1, stream);
	return payload?.length ? concat(head, payload) : head;
}

export function unpack(message: Bytes) {
	if (message.length < 5) throw new Error("A tunnel message was cut short.");
	return {
		type: message[0] as MsgType,
		stream: new DataView(message.buffer, message.byteOffset, message.byteLength).getUint32(1),
		payload: message.subarray(5),
	};
}

export const json = (value: unknown) => encoder.encode(JSON.stringify(value));
export const parseJson = <T>(payload: Uint8Array) => JSON.parse(decoder.decode(payload)) as T;
export const text = (value: string) => encoder.encode(value);
export const readText = (payload: Uint8Array) => decoder.decode(payload);
