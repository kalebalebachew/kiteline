import { ORPCError } from "@orpc/server";
import z from "zod";

import type { Context } from "../context";
import type { Actor } from "../devices";
import { protectedProcedure } from "../index";

const id = z.object({ id: z.string().min(1).max(64) });

const current = (context: Context) => (context.caller?.kind === "device" ? context.caller.id : undefined);
const actor = (context: Context): Actor => context.caller ?? { kind: "terminal" };

const ANSWERED = {
	approved: "That device was already allowed.",
	denied: "That request was already declined.",
	expired: "That request expired before anyone answered it.",
	cancelled: "That device stopped asking.",
	gone: "That request isn't waiting any more.",
} as const;

/** The devices paired with this computer, and the ones asking to be: any paired device can answer. */
export const devicesRouter = {
	list: protectedProcedure.handler(({ context }) => context.devices.snapshot(current(context))),

	watch: protectedProcedure.handler(async function* ({ context, signal }) {
		yield* context.devices.watch(current(context), signal);
	}),

	/** A one-time pairing code for another device: a link and its QR code, for ten minutes. */
	code: protectedProcedure.handler(async ({ context }) => {
		const code = await context.devices.createCode();
		return { id: code.id, expiresAt: code.expiresAt, ...context.pairingLink(code.code) };
	}),

	cancelCode: protectedProcedure.input(id).handler(({ input, context }) => {
		context.devices.cancelCode(input.id);
	}),

	decide: protectedProcedure
		.input(z.object({ id: z.string().min(1).max(64), allow: z.boolean() }))
		.handler(({ input, context }) => {
			const result = context.devices.decide(input.id, input.allow, actor(context));
			if (!result.ok) throw new ORPCError("CONFLICT", { message: ANSWERED[result.state] });
			return { device: result.device };
		}),

	remove: protectedProcedure.input(id).handler(({ input, context }) => {
		const removed = context.devices.remove(input.id, actor(context));
		if (!removed) throw new ORPCError("NOT_FOUND", { message: "That device isn't paired any more." });
		return { device: removed };
	}),
};
