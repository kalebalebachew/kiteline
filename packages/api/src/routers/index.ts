import { homedir, hostname, platform } from "node:os";

import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { fsRouter } from "./fs";
import { runsRouter } from "./runs";
import { sessionsRouter } from "./sessions";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),

	system: {
		info: protectedProcedure.handler(({ context }) => ({
			hostname: hostname(),
			home: homedir(),
			platform: platform(),
			version: context.version,
			allowBypass: context.allowBypass,
			pairing: context.pairing,
		})),
	},

	sessions: sessionsRouter,
	runs: runsRouter,
	fs: fsRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
