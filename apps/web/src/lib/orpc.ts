import type { AppRouterClient } from "@kiteline/api/routers/index";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { onRelay, onUnpaired, relayFetch } from "./relay";

export function isUnauthorized(error: unknown) {
	return error instanceof ORPCError && error.code === "UNAUTHORIZED";
}

export function errorMessage(error: unknown) {
	if (error instanceof Error && error.message) return error.message;
	return "Something went wrong.";
}

/** This phone was paired and isn't now: removed, most likely. Back to pairing, saying why. */
export function lostPairing() {
	queryClient.setQueryData(["auth"], { authed: false, stale: true });
}

function onError(error: unknown) {
	if (isUnauthorized(error)) return lostPairing();
	toast.error(errorMessage(error));
}

export const queryClient = new QueryClient({
	queryCache: new QueryCache({ onError }),
	mutationCache: new MutationCache({ onError }),
	defaultOptions: {
		queries: { retry: (count, error) => !isUnauthorized(error) && count < 2, refetchOnWindowFocus: true },
	},
});

export const link = new RPCLink({
	url: `${window.location.origin}/rpc`,
	// On the relay, the API is at the other end of the sealed tunnel; otherwise it's this server.
	fetch: onRelay ? relayFetch : (request, init) => fetch(request, { ...init, credentials: "same-origin" }),
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

onUnpaired(lostPairing);
