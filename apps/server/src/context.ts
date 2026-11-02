import type { Context as ApiContext } from "@kiteline/api/context";

export type CreateContextOptions = {
	caller: ApiContext["caller"];
	shared: Omit<ApiContext, "authed" | "caller">;
};

export function createContext({ caller, shared }: CreateContextOptions): ApiContext {
	return { ...shared, caller, authed: caller !== null };
}

export type Context = ReturnType<typeof createContext>;
