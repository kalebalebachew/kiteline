import type { Context as ApiContext } from "@kiteline/api/context";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
	context: HonoContext;
	authed: boolean;
	shared: Omit<ApiContext, "authed">;
};

export function createContext({ authed, shared }: CreateContextOptions): ApiContext {
	return { ...shared, authed };
}

export type Context = ReturnType<typeof createContext>;
