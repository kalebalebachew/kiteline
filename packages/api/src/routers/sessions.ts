import { z } from "zod";

import { historyPage, listAllSessions, rename, sessionInfo } from "../agent/history";
import { protectedProcedure } from "../index";

export const sessionsRouter = {
	list: protectedProcedure
		.input(z.object({ limit: z.number().int().min(1).max(500).default(200), cwd: z.string().optional() }))
		.handler(({ input, context }) => listAllSessions(input, context.manager.tracker.list())),

	get: protectedProcedure
		.input(z.object({ sessionId: z.uuid() }))
		.handler(({ input }) => sessionInfo(input.sessionId)),

	history: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				before: z.number().int().min(0).optional(),
				limit: z.number().int().min(1).max(1000).default(240),
			}),
		)
		.handler(({ input }) => historyPage(input.sessionId, input)),

	rename: protectedProcedure
		.input(z.object({ sessionId: z.uuid(), title: z.string().trim().min(1).max(200) }))
		.handler(async ({ input }) => {
			await rename(input.sessionId, input.title);
			return { ok: true };
		}),
};
