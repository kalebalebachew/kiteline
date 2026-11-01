import { useQuery } from "@tanstack/react-query";

export type AuthState = { authed: boolean };

/** Reads `#pair=<token>` from the link the terminal printed, then drops it from the address bar. */
export function takePairToken(): string | null {
	const match = window.location.hash.match(/pair=([\w-]+)/);
	if (!match?.[1]) return null;
	history.replaceState(null, "", window.location.pathname + window.location.search);
	return match[1];
}

export async function pair(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
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

export async function unpair() {
	await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
}

export function useAuth() {
	return useQuery({
		queryKey: ["auth"],
		queryFn: async (): Promise<AuthState> => {
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
