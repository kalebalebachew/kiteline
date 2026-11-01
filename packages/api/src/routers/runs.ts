import { z } from "zod";

import { PERMISSION_MODES } from "../agent/types";
import { protectedProcedure } from "../index";

const permissionMode = z.enum(PERMISSION_MODES);

const image = z.object({
	mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
	data: z.base64().max(8_000_000),
});

const decision = z.discriminatedUnion("behavior", [
	z.object({ behavior: z.literal("allow") }),
	z.object({ behavior: z.literal("allowAlways") }),
	z.object({
		behavior: z.literal("deny"),
		message: z.string().max(4000).optional(),
		interrupt: z.boolean().optional(),
	}),
	z.object({ behavior: z.literal("answer"), answers: z.record(z.string(), z.string().max(4000)) }),
]);

const session = z.object({ sessionId: z.uuid() });

export const runsRouter = {
	/** Live sessions on this computer, pushed whenever one changes. */
	list: protectedProcedure.handler(async function* ({ context, signal }) {
		yield* context.manager.watchList(signal);
	}),

	watch: protectedProcedure.input(session).handler(async function* ({ input, context, signal }) {
		yield* context.manager.watchSession(input.sessionId, signal);
	}),

	send: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid().optional(),
				cwd: z.string().min(1).optional(),
				text: z.string().max(200_000),
				images: z.array(image).max(6).optional(),
				permissionMode: permissionMode.optional(),
				model: z.string().max(100).nullable().optional(),
			}),
		)
		.handler(({ input, context }) => context.manager.send(input)),

	respond: protectedProcedure
		.input(session.extend({ permissionId: z.string().min(1), decision }))
		.handler(({ input, context }) => {
			context.manager.respond(input.sessionId, input.permissionId, input.decision);
			return { ok: true };
		}),

	interrupt: protectedProcedure.input(session).handler(async ({ input, context }) => {
		await context.manager.interrupt(input.sessionId);
		return { ok: true };
	}),

	setPermissionMode: protectedProcedure
		.input(session.extend({ mode: permissionMode }))
		.handler(async ({ input, context }) => {
			await context.manager.setPermissionMode(input.sessionId, input.mode);
			return { ok: true };
		}),

	setModel: protectedProcedure
		.input(session.extend({ model: z.string().max(100).nullable() }))
		.handler(async ({ input, context }) => {
			await context.manager.setModel(input.sessionId, input.model);
			return { ok: true };
		}),

	stop: protectedProcedure.input(session).handler(({ input, context }) => {
		context.manager.stop(input.sessionId);
		return { ok: true };
	}),
};
