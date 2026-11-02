import type { AppRouterClient } from "@kiteline/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import { kitelineHome, localAddress, readComputerKey, readServerInfo } from "./auth";
import { bold } from "./banner";
import { command, loadOwnEnvFile, readSettings } from "./config";

/** Why a `kiteline` command can't reach the Kiteline that should be running, in words to act on. */
export class Unreachable extends Error {}

type Status = { authed: boolean };

async function status(url: string, key?: string): Promise<Status | null> {
	try {
		const response = await fetch(`${url}/auth/status`, {
			headers: key ? { authorization: `Bearer ${key}` } : {},
			signal: AbortSignal.timeout(2500),
		});
		return response.ok ? ((await response.json()) as Status) : null;
	} catch {
		return null;
	}
}

/**
 * The Kiteline running on this computer, for the `kiteline` commands: found at the address it saved
 * when it started, and let in with the computer's key, which only this user can read.
 */
export async function connectToKiteline() {
	loadOwnEnvFile();
	const home = kitelineHome(process.env.KITELINE_HOME?.trim() || undefined);
	const info = readServerInfo(home);
	const key = readComputerKey(home);

	if (info && key) {
		const answer = await status(info.local, key);
		if (answer?.authed) {
			const client: AppRouterClient = createORPCClient(
				new RPCLink({ url: `${info.local}/rpc`, headers: { authorization: `Bearer ${key}` } }),
			);
			return { client, info };
		}
		if (answer) {
			throw new Unreachable(
				"The Kiteline that's running didn't accept this command. Run it as the same user Kiteline runs as, with the same KITELINE_HOME.",
			);
		}
	}

	// Nothing saved, or nothing where it said: perhaps a Kiteline from before these commands.
	let guess = "http://127.0.0.1:4545";
	try {
		const settings = readSettings();
		guess = localAddress(settings.port, settings.host);
	} catch {}
	if (await status(guess)) {
		throw new Unreachable(
			`The Kiteline that's running is older than this command. Restart it, then try again${
				process.platform === "linux"
					? `; in the background, that's ${bold("systemctl --user restart kiteline")}`
					: ""
			}.`,
		);
	}
	throw new Unreachable(
		`Kiteline isn't running. Start it with ${bold(command("start"))}, or keep it running with ${bold("kiteline service install")}.`,
	);
}
