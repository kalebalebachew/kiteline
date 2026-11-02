import { z } from "zod";

import { AGENT_PROVIDERS, EFFORT_LEVELS, PERMISSION_MODES } from "../agent/types";
import { protectedProcedure } from "../index";

const permissionMode = z.enum(PERMISSION_MODES);
const effort = z.object({ level: z.enum(EFFORT_LEVELS).nullable(), persist: z.boolean() });

const image = z.object({
	mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
	// About 3.7 MB an image once decoded, inside the API's 5 MB limit; the phone shrinks photos first.
	data: z.base64().max(5_000_000, "That image is too big to send."),
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
				provider: z.enum(AGENT_PROVIDERS).optional(),
				sessionId: z.uuid().optional(),
				cwd: z.string().min(1).optional(),
				text: z.string().max(200_000),
				images: z.array(image).max(6).optional(),
				permissionMode: permissionMode.optional(),
				model: z.string().max(100).nullable().optional(),
				effort: effort.optional(),
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

	setEffort: protectedProcedure.input(session.extend({ effort })).handler(async ({ input, context }) => {
		await context.manager.setEffort(input.sessionId, input.effort);
		return { ok: true };
	}),

	/** Where a session that isn't running would start: for the effort sheet before anything is live. */
	effortFor: protectedProcedure
		.input(
			z.object({
				cwd: z.string().min(1).nullable(),
				model: z.string().max(100).nullable(),
				provider: z.enum(AGENT_PROVIDERS).optional(),
			}),
		)
		.handler(({ input, context }) => context.manager.effortFor(input.cwd, input.model, input.provider)),

	models: protectedProcedure
		.input(z.object({ provider: z.enum(AGENT_PROVIDERS) }))
		.handler(({ input, context }) => context.manager.modelsFor(input.provider)),

	stop: protectedProcedure.input(session).handler(({ input, context }) => {
		context.manager.stop(input.sessionId);
		return { ok: true };
	}),
};
