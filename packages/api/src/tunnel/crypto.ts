/**
 * End-to-end encryption between a phone and its computer, across a relay that only passes bytes on.
 *
 * Both sides hold the device secret a pairing stands for. The handshake mixes it with a fresh P-256
 * key exchange: the relay sees the public halves, but without the secret it can't derive the keys,
 * and each side proves it has them before anything else is sent. Every message after that is
 * AES-256-GCM with its own key per direction and a counter for a nonce, so a message can't be read,
 * altered, replayed or reordered on the way. Fresh keys each connection: a secret that leaks later
 * opens no earlier conversation.
 *
 * WebCrypto only, so the same code runs in the phone's browser and in Node on the computer.
 */

export type Bytes = Uint8Array<ArrayBuffer>;
/** A WebCrypto key, typed from WebCrypto itself so browser and Node typings agree. */
export type SecretKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const encoder = new TextEncoder();
const LABEL = encoder.encode("kiteline-tunnel-v1");
const AAD = encoder.encode("kiteline-tunnel-v1/message");

export const TUNNEL_VERSION = 1;
const PUBLIC_KEY_BYTES = 65;
const NONCE_BYTES = 16;
const CONFIRM_BYTES = 32;

/** Handshake frames, then sealed messages. The first byte says which. */
export const Frame = { Hello: 1, Welcome: 2, Confirm: 3, Sealed: 0x10 } as const;

export class HandshakeError extends Error {}

export function concat(...parts: Uint8Array[]): Bytes {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

function random(length: number): Bytes {
	return crypto.getRandomValues(new Uint8Array(length));
}

/** What a pairing token stands for on every device: the same value the computer's cookie holds. */
export async function deviceSecret(token: string): Promise<Bytes> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(token),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode("kiteline-device-v1")));
}

/** The device secret as a key for the handshake. A phone keeps it non-extractable: usable, never readable. */
export function importSecret(secret: Bytes, extractable = false) {
	return crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, extractable, ["sign"]);
}

async function ephemeral() {
	const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
	const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
	return { privateKey: pair.privateKey, publicKey };
}

async function agree(privateKey: SecretKey, peerPublic: Bytes): Promise<Bytes> {
	const peer = await crypto.subtle.importKey(
		"raw",
		peerPublic,
		{ name: "ECDH", namedCurve: "P-256" },
		false,
		[],
	);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, privateKey, 256));
}

async function sha256(data: Bytes): Promise<Bytes> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

type Schedule = { c2s: SecretKey; s2c: SecretKey; hostConfirm: SecretKey; clientConfirm: SecretKey };

/** Keys for one connection, from the key exchange, the device secret and everything both sides said. */
async function schedule(secret: SecretKey, exchanged: Bytes, transcript: Bytes): Promise<Schedule> {
	const ikm = new Uint8Array(await crypto.subtle.sign("HMAC", secret, concat(exchanged, transcript)));
	const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
	const bits = (label: string) =>
		crypto.subtle.deriveBits(
			{ name: "HKDF", hash: "SHA-256", salt: transcript, info: encoder.encode(label) },
			base,
			256,
		);
	const aes = async (label: string) =>
		crypto.subtle.importKey("raw", await bits(label), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
	const mac = async (label: string) =>
		crypto.subtle.importKey("raw", await bits(label), { name: "HMAC", hash: "SHA-256" }, false, [
			"sign",
			"verify",
		]);
	return {
		c2s: await aes("client-to-host"),
		s2c: await aes("host-to-client"),
		hostConfirm: await mac("host-confirm"),
		clientConfirm: await mac("client-confirm"),
	};
}

/** Seals and opens one connection's messages, strictly in order. */
export class Cipher {
	private sent = 0n;
	private received = 0n;

	constructor(
		private readonly sendKey: SecretKey,
		private readonly receiveKey: SecretKey,
	) {}

	private static iv(counter: bigint): Bytes {
		const iv = new Uint8Array(12);
		new DataView(iv.buffer).setBigUint64(4, counter);
		return iv;
	}

	/** Callers must seal in the order the frames go out; the counter is taken here. */
	async seal(plain: Bytes): Promise<Bytes> {
		const iv = Cipher.iv(this.sent++);
		const sealed = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv, additionalData: AAD },
			this.sendKey,
			plain,
		);
		return concat(Uint8Array.of(Frame.Sealed), new Uint8Array(sealed));
	}

	/** Throws on anything altered, replayed, reordered or not from the other end. */
	async open(frame: Bytes): Promise<Bytes> {
		if (frame[0] !== Frame.Sealed) throw new HandshakeError("Expected a sealed message.");
		const iv = Cipher.iv(this.received++);
		const plain = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv, additionalData: AAD },
			this.receiveKey,
			frame.subarray(1),
		);
		return new Uint8Array(plain);
	}
}

/** The phone's side. `send` puts a frame on the wire; `next` waits for the next one from the computer. */
export async function initiate(
	secret: SecretKey,
	send: (frame: Bytes) => void,
	next: () => Promise<Bytes>,
): Promise<Cipher> {
	const mine = await ephemeral();
	const clientNonce = random(NONCE_BYTES);
	send(concat(Uint8Array.of(Frame.Hello, TUNNEL_VERSION), mine.publicKey, clientNonce));

	const welcome = await next();
	if (welcome[0] !== Frame.Welcome || welcome.length !== 1 + PUBLIC_KEY_BYTES + NONCE_BYTES + CONFIRM_BYTES) {
		throw new HandshakeError("The computer's answer wasn't a handshake.");
	}
	const hostPublic = welcome.slice(1, 1 + PUBLIC_KEY_BYTES);
	const hostNonce = welcome.slice(1 + PUBLIC_KEY_BYTES, 1 + PUBLIC_KEY_BYTES + NONCE_BYTES);
	const hostProof = welcome.slice(1 + PUBLIC_KEY_BYTES + NONCE_BYTES);

	const transcript = await sha256(concat(LABEL, mine.publicKey, clientNonce, hostPublic, hostNonce));
	const keys = await schedule(secret, await agree(mine.privateKey, hostPublic), transcript);
	if (!(await crypto.subtle.verify("HMAC", keys.hostConfirm, hostProof, transcript))) {
		throw new HandshakeError("The computer doesn't hold this phone's pairing.");
	}
	const proof = new Uint8Array(await crypto.subtle.sign("HMAC", keys.clientConfirm, transcript));
	send(concat(Uint8Array.of(Frame.Confirm), proof));
	return new Cipher(keys.c2s, keys.s2c);
}

/** The computer's side: answers a phone's hello, and accepts it only once it proves the pairing. */
export async function respond(
	secret: SecretKey,
	hello: Bytes,
	send: (frame: Bytes) => void,
	next: () => Promise<Bytes>,
): Promise<Cipher> {
	if (hello[0] !== Frame.Hello || hello.length !== 2 + PUBLIC_KEY_BYTES + NONCE_BYTES) {
		throw new HandshakeError("That wasn't a handshake.");
	}
	if (hello[1] !== TUNNEL_VERSION) throw new HandshakeError(`Unsupported tunnel version ${hello[1]}.`);
	const clientPublic = hello.slice(2, 2 + PUBLIC_KEY_BYTES);
	const clientNonce = hello.slice(2 + PUBLIC_KEY_BYTES);

	const mine = await ephemeral();
	const hostNonce = random(NONCE_BYTES);
	const transcript = await sha256(concat(LABEL, clientPublic, clientNonce, mine.publicKey, hostNonce));
	const keys = await schedule(secret, await agree(mine.privateKey, clientPublic), transcript);
	const proof = new Uint8Array(await crypto.subtle.sign("HMAC", keys.hostConfirm, transcript));
	send(concat(Uint8Array.of(Frame.Welcome), mine.publicKey, hostNonce, proof));

	const confirm = await next();
	if (confirm[0] !== Frame.Confirm || confirm.length !== 1 + CONFIRM_BYTES) {
		throw new HandshakeError("The phone didn't finish the handshake.");
	}
	if (!(await crypto.subtle.verify("HMAC", keys.clientConfirm, confirm.slice(1), transcript))) {
		throw new HandshakeError("This phone isn't paired with this computer.");
	}
	return new Cipher(keys.s2c, keys.c2s);
}
