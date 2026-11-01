import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { renderSVG } from "uqr";

import { printBanner, type SavedPairing } from "./banner";

/** `pnpm pair`: show the running server's pairing code without starting another one. */
const home = process.env.KITELINE_HOME || join(homedir(), ".kiteline");

let saved: SavedPairing;
try {
	saved = JSON.parse(readFileSync(join(home, "pairing.json"), "utf8")) as SavedPairing;
} catch {
	console.error("\n  Kiteline hasn't run yet on this computer. Start it with `pnpm start` first.\n");
	process.exit(1);
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
