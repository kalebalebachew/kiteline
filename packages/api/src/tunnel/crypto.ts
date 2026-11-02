/**
 * End-to-end encryption between a phone and its computer, across a relay that only passes bytes on.
 *
 * Both sides hold a secret: the key a paired phone was given, or, while it asks to pair, the one-time
 * code it scanned. The phone says which key it holds by name, and the handshake mixes that key with a
 * fresh P-256 key exchange: the relay sees the public halves, but without the secret it can't derive
 * the keys, and each side proves it has them before anything else is sent. Every message after that
 * is AES-256-GCM with its own key per direction and a counter for a nonce, so a message can't be read,
 * altered, replayed or reordered on the way. Fresh keys each connection: a secret that leaks later
 * opens no earlier conversation.
 *
 * WebCrypto only, so the same code runs in the phone's browser and in Node on the computer.
 */

export type Bytes = Uint8Array<ArrayBuffer>;
/** A WebCrypto key, typed from WebCrypto itself so browser and Node typings agree. */
export type SecretKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const LABEL = encoder.encode("kiteline-tunnel-v2");
const AAD = encoder.encode("kiteline-tunnel-v2/message");

export const TUNNEL_VERSION = 2;
const PUBLIC_KEY_BYTES = 65;
const NONCE_BYTES = 16;
const CONFIRM_BYTES = 32;
/** A key's name: a device's id, or a pairing code's. Always 22 base64url characters. */
const ID_BYTES = 22;
const HELLO_BYTES = 3 + ID_BYTES + PUBLIC_KEY_BYTES + NONCE_BYTES;

/** Handshake frames, then sealed messages. The first byte says which. */
export const Frame = { Hello: 1, Welcome: 2, Confirm: 3, Sealed: 0x10 } as const;

/** Which key a phone holds: a paired device's own, or a one-time code that only lets it ask to pair. */
export type KeyKind = "device" | "pairing";
export type Identity = { kind: KeyKind; id: string };
const KINDS: Record<number, KeyKind> = { 1: "device", 2: "pairing" };
const KIND_BYTE: Record<KeyKind, number> = { device: 1, pairing: 2 };

/** The computer's keys, by the name a phone gives. Null for a name it doesn't know. */
export type KeyLookup = (identity: Identity) => SecretKey | null | Promise<SecretKey | null>;

export class HandshakeError extends Error {}

/** The phone named a key this computer doesn't hold: never paired, removed, or a code that's done. */
export class UnknownKey extends HandshakeError {
	constructor(readonly identity: Identity) {
		super(
			identity.kind === "pairing"
				? "That pairing code has expired or was already used."
				: "This phone isn't paired with this computer.",
		);
	}
}

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

function base64Url(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A one-time pairing code as a tunnel key, and the name it goes by. The name is a hash, so the relay,
 * which sees it, learns nothing it could pair with.
 */
export async function pairingKey(code: string): Promise<{ id: string; secret: Bytes }> {
	const id = base64Url(await sha256(encoder.encode(`kiteline-pair-id/${code}`))).slice(0, ID_BYTES);
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(code),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const secret = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode("kiteline-pair-v2")));
	return { id, secret };
}

/** A secret as a key for the handshake. A phone keeps it non-extractable: usable, never readable. */
export function importSecret(secret: Bytes, extractable = false): Promise<SecretKey> {
	// Typed as SecretKey: browser and Node typings each have their own CryptoKey.
	return crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, extractable, [
		"sign",
	]) as Promise<SecretKey>;
}

function nameBytes(identity: Identity): Bytes {
	if (!/^[\w-]{22}$/.test(identity.id)) throw new HandshakeError("A key's name is 22 characters.");
	return concat(Uint8Array.of(KIND_BYTE[identity.kind]), encoder.encode(identity.id));
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

/**
 * The phone's side. `identity` names the key it holds; `send` puts a frame on the wire; `next` waits
 * for the next one from the computer.
 */
export async function initiate(
	identity: Identity,
	secret: SecretKey,
	send: (frame: Bytes) => void,
	next: () => Promise<Bytes>,
): Promise<Cipher> {
	const name = nameBytes(identity);
	const mine = await ephemeral();
	const clientNonce = random(NONCE_BYTES);
	send(concat(Uint8Array.of(Frame.Hello, TUNNEL_VERSION), name, mine.publicKey, clientNonce));

	const welcome = await next();
	if (welcome[0] !== Frame.Welcome || welcome.length !== 1 + PUBLIC_KEY_BYTES + NONCE_BYTES + CONFIRM_BYTES) {
		throw new HandshakeError("The computer's answer wasn't a handshake.");
	}
	const hostPublic = welcome.slice(1, 1 + PUBLIC_KEY_BYTES);
	const hostNonce = welcome.slice(1 + PUBLIC_KEY_BYTES, 1 + PUBLIC_KEY_BYTES + NONCE_BYTES);
	const hostProof = welcome.slice(1 + PUBLIC_KEY_BYTES + NONCE_BYTES);

	const transcript = await sha256(concat(LABEL, name, mine.publicKey, clientNonce, hostPublic, hostNonce));
	const keys = await schedule(secret, await agree(mine.privateKey, hostPublic), transcript);
	if (!(await crypto.subtle.verify("HMAC", keys.hostConfirm, hostProof, transcript))) {
		throw new HandshakeError("The computer doesn't hold this phone's pairing.");
	}
	const proof = new Uint8Array(await crypto.subtle.sign("HMAC", keys.clientConfirm, transcript));
	send(concat(Uint8Array.of(Frame.Confirm), proof));
	return new Cipher(keys.c2s, keys.s2c);
}

/**
 * The computer's side: looks up the key the phone names, answers its hello, and accepts it only once
 * it proves it holds that key. Says which key it was, so the computer knows who's at the other end.
 */
export async function respond(
	keyFor: KeyLookup,
	hello: Bytes,
	send: (frame: Bytes) => void,
	next: () => Promise<Bytes>,
): Promise<{ cipher: Cipher; identity: Identity }> {
	if (hello[0] !== Frame.Hello) throw new HandshakeError("That wasn't a handshake.");
	if (hello[1] !== TUNNEL_VERSION) throw new HandshakeError(`Unsupported tunnel version ${hello[1]}.`);
	const kind = KINDS[hello[2] ?? 0];
	const id = decoder.decode(hello.subarray(3, 3 + ID_BYTES));
	if (hello.length !== HELLO_BYTES || !kind || !/^[\w-]{22}$/.test(id)) {
		throw new HandshakeError("That wasn't a handshake.");
	}
	const identity: Identity = { kind, id };
	const secret = await keyFor(identity);
	if (!secret) throw new UnknownKey(identity);
	const name = hello.slice(2, 3 + ID_BYTES);
	const clientPublic = hello.slice(3 + ID_BYTES, 3 + ID_BYTES + PUBLIC_KEY_BYTES);
	const clientNonce = hello.slice(3 + ID_BYTES + PUBLIC_KEY_BYTES);

	const mine = await ephemeral();
	const hostNonce = random(NONCE_BYTES);
	const transcript = await sha256(concat(LABEL, name, clientPublic, clientNonce, mine.publicKey, hostNonce));
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
	return { cipher: new Cipher(keys.s2c, keys.c2s), identity };
}
