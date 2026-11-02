import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderSVG } from "uqr";

import { kitelineHome } from "./auth";
import { printBanner, type SavedPairing } from "./banner";
import { command, loadOwnEnvFile } from "./config";

/** The pairing code of the Kiteline that's running, read from what it saved when it started. */
export async function showPairing() {
	loadOwnEnvFile();
	const home = kitelineHome(process.env.KITELINE_HOME?.trim() || undefined);

	let saved: SavedPairing;
	try {
		saved = JSON.parse(readFileSync(join(home, "pairing.json"), "utf8")) as SavedPairing;
	} catch {
		console.error(
			`\n  Kiteline hasn't run yet on this computer. Start it with \`${command("start")}\` first.\n`,
		);
		process.exitCode = 1;
		return;
	}

	const local = saved.urls[saved.urls.length - 1] ?? "http://localhost:4545";
	const running = await fetch(`${local}/auth/status`, { signal: AbortSignal.timeout(2000) })
		.then((r) => r.ok)
		.catch(() => false);

	printBanner(
		{ url: saved.url, urls: saved.urls, svg: renderSVG(saved.url) },
		{ version: saved.version, dev: false },
	);
	if (!running)
		console.log("  Kiteline isn't running right now, so this link won't open until it starts again.\n");
}
