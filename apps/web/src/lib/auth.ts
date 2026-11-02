import { useQuery } from "@tanstack/react-query";

import {
	forgetComputer,
	hasComputer,
	onRelay,
	parseRelayLink,
	relayFetch,
	rememberComputer,
	TunnelError,
} from "./relay";

export type AuthState = { authed: boolean };

/**
 * Reads the pairing code from the link the terminal printed, then drops it from the address bar.
 * Through the relay the link also says which computer: `#host=…&pair=…`.
 */
export function takePairToken(): string | null {
	const hash = window.location.hash;
	const match = hash.match(/pair=([\w-]+)/);
	if (!match?.[1]) return null;
	history.replaceState(null, "", window.location.pathname + window.location.search);
	return onRelay ? hash.slice(1) : match[1];
}

export async function pair(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
	if (onRelay) return pairThroughRelay(token);
	const response = await fetch("/auth/pair", {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify({ token: extractToken(token) }),
	});
	const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
	return body.ok ? { ok: true } : { ok: false, error: body.error ?? "Pairing failed." };
}

/** Accepts the bare token or the whole link pasted from the terminal. */
export function extractToken(value: string) {
	return value.trim().match(/pair=([\w-]+)/)?.[1] ?? value.trim();
}

/**
 * Through the relay there's no server to hand a cookie: the phone keeps the computer's key and proves
 * it at every connection. The first one checks the link really was this computer's.
 */
async function pairThroughRelay(value: string): Promise<{ ok: true } | { ok: false; error: string }> {
	const link = parseRelayLink(value);
	if (!link)
		return { ok: false, error: "Paste the whole link from your computer: it says which computer to reach." };
	await rememberComputer(link.host, link.pair);
	try {
		const response = await relayFetch("/auth/status");
		const body = (await response.json()) as AuthState;
		return body.authed ? { ok: true } : { ok: false, error: "That code doesn't match. Copy the link again." };
	} catch (error) {
		if (error instanceof TunnelError && error.problem === "unpaired") {
			await forgetComputer();
			return {
				ok: false,
				error: "That code doesn't match this computer. Copy the link from your terminal again.",
			};
		}
		// Offline right now: the key is kept, and the next screen says what's wrong.
		return { ok: true };
	}
}

export async function unpair() {
	if (onRelay) await forgetComputer();
	else await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
}

export function useAuth() {
	return useQuery({
		queryKey: ["auth"],
		queryFn: async (): Promise<AuthState> => {
			if (onRelay) {
				if (!(await hasComputer())) return { authed: false };
				try {
					const response = await relayFetch("/auth/status");
					return (await response.json()) as AuthState;
				} catch (error) {
					// The computer no longer knows this phone: pair again.
					if (error instanceof TunnelError && error.problem === "unpaired") return { authed: false };
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

/** Read once at startup, before the router touches the URL, so the token never lands in history. */
export const initialPairToken = takePairToken();
