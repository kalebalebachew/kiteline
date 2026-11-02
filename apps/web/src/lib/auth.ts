import { useQuery } from "@tanstack/react-query";

import { deviceName } from "./device-name";
import {
	computerState,
	forgetComputer,
	onRelay,
	pairingTunnel,
	relayFetch,
	rememberComputer,
	type Tunnel,
	TunnelError,
	tunnelError,
} from "./relay";

export type AuthState = {
	authed: boolean;
	device?: { id: string; name: string } | null;
	/** This phone was paired once, and isn't now: removed, or paired before pairing changed. */
	stale?: boolean;
};

/** A pairing link's one-time code, and through the relay, which computer it's for. */
export type PairLink = { code: string; host: string | null };

/** A link from before codes worked once, which no Kiteline takes any more. */
export const OUTDATED = "outdated";

/** What a pasted or opened link holds: a code, an outdated link, or nothing Kiteline knows. */
export function readPairLink(value: string): PairLink | typeof OUTDATED | null {
	const text = value.trim();
	const code = /(?:^|[#&?])code=([\w-]{16,64})/.exec(text)?.[1];
	const host = /(?:^|[#&?])host=([\w-]{22})/.exec(text)?.[1] ?? null;
	if (code) return { code, host };
	if (/(?:^|[#&?])pair=[\w-]+/.test(text)) return OUTDATED;
	// The code on its own, copied from the end of the link.
	if (/^[\w-]{22}$/.test(text)) return { code: text, host: null };
	return null;
}

/** Reads a pairing link from the address bar, then takes it out of there and out of history. */
export function takePairLink() {
	const hash = window.location.hash;
	if (!/(?:^#|&)(?:code|pair)=/.test(hash)) return null;
	history.replaceState(null, "", window.location.pathname + window.location.search);
	return readPairLink(hash.slice(1));
}

/** Read once at startup, before the router touches the URL, so the code never lands in history. */
export const initialPairLink = typeof window === "undefined" ? null : takePairLink();

type Outcome = { ok: true } | { ok: false; error: string };

/** A request to pair, waiting for someone to allow it. */
export type PairAttempt = {
	/** The six digits to check against the screen that allows it. */
	match: string;
	expiresAt: number;
	/** Settles once it's answered: paired, or why not. */
	result: Promise<Outcome>;
	cancel: () => void;
};

type ClaimReply =
	| { ok: true; claim: string; match: string; expiresAt: number }
	| { ok: false; error?: string };
type AnswerReply =
	| { state: "pending" }
	| { state: "approved"; device: { id: string; name: string; secret?: string } }
	| { state: "denied" | "expired" | "cancelled" | "gone" };

const ANSWERS: Record<Exclude<AnswerReply["state"], "pending" | "approved">, string> = {
	denied: "The request was declined, so this phone isn't paired.",
	expired: "Nobody allowed it in time. Make a new code with kiteline pair, and try again.",
	cancelled: "You stopped asking.",
	gone: "That request isn't waiting any more. Make a new code with kiteline pair, and try again.",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Asks again and again, each a long wait, until the request is answered or given up on. */
async function waitForAnswer(
	poll: () => Promise<Response>,
	signal: AbortSignal,
	onApproved: (device: { id: string; name: string; secret?: string }) => Promise<void>,
): Promise<Outcome> {
	let failures = 0;
	while (!signal.aborted) {
		let answer: AnswerReply;
		try {
			answer = (await (await poll()).json()) as AnswerReply;
			failures = 0;
		} catch {
			if (signal.aborted) break;
			// A phone that locks its screen drops its connections: keep at it for a while.
			if (++failures > 6)
				return { ok: false, error: "Lost touch with your computer while waiting. Try again." };
			await sleep(Math.min(8000, 500 * 2 ** failures));
			continue;
		}
		if (answer.state === "pending") continue;
		if (answer.state === "approved") {
			await onApproved(answer.device);
			return { ok: true };
		}
		return { ok: false, error: ANSWERS[answer.state] ?? ANSWERS.gone };
	}
	return { ok: false, error: ANSWERS.cancelled };
}

/**
 * Asks the computer to pair, with the code from the link, then waits for someone to allow it.
 * Nothing gets in until then: the code only lets this phone ask.
 */
export async function startPairing(link: PairLink): Promise<PairAttempt | { error: string }> {
	return onRelay ? startThroughRelay(link) : startDirect(link);
}

async function startDirect(link: PairLink): Promise<PairAttempt | { error: string }> {
	const response = await fetch("/auth/pair", {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify({ code: link.code, name: await deviceName() }),
	});
	const reply = (await response.json().catch(() => ({ ok: false }))) as ClaimReply;
	if (!reply.ok) return { error: reply.error ?? "Couldn't ask your computer to pair. Try again." };

	const controller = new AbortController();
	const result = waitForAnswer(
		() =>
			fetch(`/auth/pair/${reply.claim}?wait=20`, { credentials: "same-origin", signal: controller.signal }),
		controller.signal,
		// The computer handed this browser a cookie with the answer; there's nothing to keep here.
		async () => {},
	);
	return {
		match: reply.match,
		expiresAt: reply.expiresAt,
		result,
		cancel: () => {
			controller.abort();
			void fetch(`/auth/pair/${reply.claim}`, { method: "DELETE", credentials: "same-origin" }).catch(
				() => {},
			);
		},
	};
}

/** Through the relay, the code opens a tunnel that can only ask; the answer brings this phone's key. */
async function startThroughRelay(link: PairLink): Promise<PairAttempt | { error: string }> {
	const host = link.host;
	if (!host) return { error: "Paste the whole link from your computer: it says which computer to reach." };
	let tunnel: Tunnel;
	try {
		tunnel = await pairingTunnel(host, link.code);
	} catch (error) {
		return { error: tunnelError(error).message };
	}
	let reply: ClaimReply;
	try {
		const response = await tunnel.fetch("/auth/pair", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: await deviceName() }),
		});
		reply = (await response.json()) as ClaimReply;
	} catch (error) {
		tunnel.close();
		return { error: tunnelError(error).message };
	}
	if (!reply.ok) {
		tunnel.close();
		return { error: reply.error ?? "Couldn't ask your computer to pair. Try again." };
	}

	const { claim } = reply;
	const controller = new AbortController();
	let current = tunnel;
	let cancelling: Promise<unknown> | null = null;
	const result = waitForAnswer(
		async () => {
			// Dropped while waiting, say when the screen locked: the code still opens a new one.
			if (current.error) current = await pairingTunnel(host, link.code);
			return current.fetch(`/auth/pair/${claim}?wait=20`, { signal: controller.signal });
		},
		controller.signal,
		async (device) => {
			if (!device.secret) throw new Error("Your computer didn't send this phone's key.");
			await rememberComputer(host, device.id, device.secret);
		},
	).finally(() => {
		if (!cancelling) current.close();
	});
	return {
		match: reply.match,
		expiresAt: reply.expiresAt,
		result,
		cancel: () => {
			controller.abort();
			cancelling = current
				.fetch(`/auth/pair/${claim}`, { method: "DELETE" })
				.catch(() => {})
				.finally(() => current.close());
		},
	};
}

export async function unpair() {
	if (onRelay) {
		// Forgotten on the computer too, so this phone's key opens nothing there even if it was copied.
		await relayFetch("/auth/logout", { method: "POST" })
			.then((response) => response.body?.cancel())
			.catch(() => {});
		await forgetComputer();
	} else await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
}

export function useAuth() {
	return useQuery({
		queryKey: ["auth"],
		queryFn: async (): Promise<AuthState> => {
			if (onRelay) {
				const state = await computerState();
				if (state === "none") return { authed: false };
				if (state === "outdated") {
					await forgetComputer();
					return { authed: false, stale: true };
				}
				try {
					const response = await relayFetch("/auth/status");
					return (await response.json()) as AuthState;
				} catch (error) {
					// The computer doesn't know this phone any more: its key is no use, so pair again.
					if (error instanceof TunnelError && error.problem === "unpaired") {
						await forgetComputer();
						return { authed: false, stale: true };
					}
					throw error;
				}
			}
			const response = await fetch("/auth/status", { credentials: "same-origin" });
			if (!response.ok) throw new Error("Kiteline's server isn't answering.");
			return (await response.json()) as AuthState;
		},
		staleTime: 60_000,
		retry: 2,
	});
}
