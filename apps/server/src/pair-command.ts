import { createInterface, type Interface } from "node:readline/promises";

import type { PairRequestInfo } from "@kiteline/api/devices";

import { accent, bold, dim, printPairingCode, spaced } from "./banner";
import { command } from "./config";
import { connectToKiteline } from "./control";

const say = (...lines: string[]) => console.log(lines.map((line) => (line ? `  ${line}` : "")).join("\n"));

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * `kiteline pair`: a fresh one-time code from the Kiteline that's running, and then, when a device
 * uses it, the question of whether to let it in. Says whether a device was paired.
 */
export async function pairCommand(): Promise<boolean> {
	const { client } = await connectToKiteline();
	// Listening for Ctrl C before the code exists, so stopping never leaves one working.
	let interrupted = false;
	let interrupt = () => {};
	const onSignal = () => {
		interrupted = true;
		interrupt();
	};
	process.on("SIGINT", onSignal);
	let code: Awaited<ReturnType<typeof client.devices.code>>;
	try {
		code = await client.devices.code();
	} catch (error) {
		process.off("SIGINT", onSignal);
		throw error;
	}

	const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;
	const watching = new AbortController();
	let rl: Interface | null = null;
	let question: AbortController | null = null;
	let mine: PairRequestInfo | null = null;
	/** Answered here: the request leaving the list is this answer, not someone else's. */
	let answering = false;
	let done = false;

	return new Promise<boolean>((resolve) => {
		const finish = (paired: boolean, ...lines: string[]) => {
			if (done) return;
			done = true;
			if (lines.length) say(...lines, "");
			clearTimeout(deadline);
			process.off("SIGINT", onSignal);
			question?.abort();
			rl?.close();
			watching.abort();
			resolve(paired);
		};
		// Stopped before anyone used it: the code goes with it, before this process does.
		interrupt = () => {
			console.log();
			if (mine) return finish(false);
			const cancelled = client.devices.cancelCode({ id: code.id }).catch(() => {});
			const patience = new Promise((resolve) => setTimeout(resolve, 2000));
			void Promise.race([cancelled, patience]).then(() => finish(false));
		};
		let deadline = setTimeout(
			() => finish(false, `Nobody used the code in time. Run ${bold(command("pair"))} for a new one.`),
			code.expiresAt - Date.now() + 1000,
		);
		// Ctrl C while the code was being made: it goes before it was ever shown.
		if (interrupted) return interrupt();

		printPairingCode(code);
		say(
			dim(interactive ? "Waiting for a phone to use it. Ctrl C stops." : "Waiting for a phone to use it."),
			"",
		);

		const ask = async (request: PairRequestInfo) => {
			say(
				`${accent("◆")}  ${bold(request.name)} wants to pair${request.via === "relay" ? ", through the relay" : ""}.`,
				`   Allow it only if it's yours and its screen shows ${bold(spaced(request.match))}.`,
			);
			if (!interactive) {
				say(dim("   Allow it on a device that's already paired."), "");
				return;
			}
			rl = createInterface({ input: process.stdin, output: process.stdout });
			rl.on("SIGINT", onSignal);
			question = new AbortController();
			for (;;) {
				let answer: string;
				try {
					answer = (await rl.question(`     Allow it? ${dim("y or n")} `, { signal: question.signal }))
						.trim()
						.toLowerCase();
				} catch {
					return; // Answered somewhere else; the watch below says how.
				}
				if (!["y", "yes", "n", "no"].includes(answer)) continue;
				const allow = answer.startsWith("y");
				answering = true;
				try {
					await client.devices.decide({ id: request.id, allow });
					finish(
						allow,
						"",
						allow
							? `${accent("◆")}  Paired ${bold(request.name)}. See every device with ${bold(command("devices"))}.`
							: `Declined ${request.name}. It isn't paired.`,
					);
				} catch (error) {
					finish(false, "", errorText(error));
				}
				return;
			}
		};

		void (async () => {
			try {
				const stream = await client.devices.watch(undefined, { signal: watching.signal });
				for await (const snapshot of stream) {
					const request = snapshot.requests.find((r) => r.code === code.id);
					if (request && !mine) {
						mine = request;
						// The code's spent; what's left is the request's own time.
						clearTimeout(deadline);
						deadline = setTimeout(
							() => finish(false, "", `${request.name} waited too long. Run ${bold(command("pair"))} again.`),
							request.expiresAt - Date.now() + 2000,
						);
						void ask(request);
					} else if (!request && mine && !answering) {
						const asked = mine;
						const paired = snapshot.devices.some(
							(d) => d.name === asked.name && Date.parse(d.pairedAt) >= asked.requestedAt,
						);
						finish(
							paired,
							"",
							paired
								? `${accent("◆")}  ${bold(asked.name)} was allowed on another device.`
								: `${asked.name} isn't paired: it was declined, or stopped asking.`,
						);
					}
				}
				finish(false, "Kiteline stopped.");
			} catch (error) {
				if (!done) finish(false, `Lost Kiteline: ${errorText(error)}`);
			}
		})();
	});
}
