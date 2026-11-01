import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

/**
 * Everything except the health check needs a paired device. Plain errors
 * thrown by the run manager carry sentences meant for the person, so they are
 * passed through instead of collapsing into a generic 500.
 */
export const protectedProcedure = o.use(async ({ context, next }) => {
	if (!context.authed) throw new ORPCError("UNAUTHORIZED", { message: "Pair this device first." });
	try {
		return await next();
	} catch (error) {
		if (error instanceof ORPCError || !(error instanceof Error)) throw error;
		throw new ORPCError("BAD_REQUEST", { message: error.message, cause: error });
	}
});
