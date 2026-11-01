import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { RunManager } from "@kiteline/api/agent/manager";
import { SessionTracker } from "@kiteline/api/agent/tracker";
import { appRouter } from "@kiteline/api/routers/index";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono, type Context as HonoContext } from "hono";
import { compress } from "hono/compress";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { logger } from "hono/logger";

import pkg from "../package.json" with { type: "json" };
import { DEVICE_COOKIE, deviceSecret, kitelineHome, loadToken, PairLimiter, safeEqual } from "./auth";
import { buildPairing, printAlreadyRunning, printBanner, savePairing } from "./banner";
import { createContext } from "./context";
import { ENV } from "./env.server";

const dev = process.argv.includes("--dev");
const port = ENV.PORT ?? 4545;
const host = ENV.HOST || "0.0.0.0";
const allowBypass = ENV.KITELINE_ALLOW_BYPASS ?? true;

const home = kitelineHome(ENV.KITELINE_HOME);
const token = loadToken(home, {
	fixed: ENV.KITELINE_TOKEN,
	rotate: process.argv.includes("--new-token"),
});
const secret = deviceSecret(token);
const pairing = buildPairing(dev ? 4546 : port, token, {
	publicUrl: ENV.KITELINE_PUBLIC_URL,
	loopbackOnly: host === "127.0.0.1" || host === "localhost",
});
const limiter = new PairLimiter();

const manager = new RunManager({
	claudePath: ENV.CLAUDE_PATH || null,
	allowBypass,
	maxLiveRuns: ENV.KITELINE_MAX_SESSIONS ?? 6,
	idleTimeoutMs: (ENV.KITELINE_IDLE_MINUTES ?? 20) * 60_000,
	tracker: new SessionTracker(join(home, "sessions.json")),
});

const shared = { manager, pairing, allowBypass, version: pkg.version };

function isAuthed(c: HonoContext) {
	const cookie = getCookie(c, DEVICE_COOKIE);
	if (cookie && safeEqual(cookie, secret)) return true;
	const header = c.req.header("authorization");
	return !!header?.startsWith("Bearer ") && safeEqual(header.slice(7), token);
}

const app = new Hono();

if (process.env.KITELINE_DEBUG) app.use(logger());
// Transcripts are large JSON; Hono leaves event streams uncompressed so live updates still flow.
app.use(compress());

app.get("/auth/status", (c) => c.json({ authed: isAuthed(c) }));

app.post("/auth/pair", async (c) => {
	const ip = getConnInfo(c).remote.address ?? "unknown";
	if (limiter.blocked(ip)) {
		return c.json({ ok: false, error: "Too many wrong codes. Wait ten minutes and try again." }, 429);
	}
	const body = (await c.req.json().catch(() => ({}))) as { token?: unknown };
	const given = typeof body.token === "string" ? body.token.trim() : "";
	if (!given || !safeEqual(given, token)) {
		limiter.fail(ip);
		return c.json(
			{ ok: false, error: "That code doesn't match. Copy the link from your terminal again." },
			401,
		);
	}
	limiter.clear(ip);
	const https = c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:";
	setCookie(c, DEVICE_COOKIE, secret, {
		httpOnly: true,
		sameSite: "Strict",
		secure: https,
		path: "/",
		maxAge: 60 * 60 * 24 * 400,
	});
	return c.json({ ok: true });
});

app.post("/auth/logout", (c) => {
	deleteCookie(c, DEVICE_COOKIE, { path: "/" });
	return c.json({ ok: true });
});

const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			if (process.env.KITELINE_DEBUG) console.error(error);
		}),
	],
});

app.use("/rpc/*", async (c, next) => {
	const context = createContext({ context: c, authed: isAuthed(c), shared });
	const result = await rpcHandler.handle(c.req.raw, { prefix: "/rpc", context });
	if (result.matched) return c.newResponse(result.response.body, result.response);
	await next();
});

// After `pnpm build`, the server also hosts the web app, so one port does everything.
const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const indexFile = join(webDir, "index.html");
if (!dev && existsSync(indexFile)) {
	const indexHtml = readFileSync(indexFile, "utf8");
	app.use(
		"/*",
		serveStatic({
			root: webDir,
			onFound: (path, c) => {
				const immutable = path.includes(`${join(webDir, "assets")}`);
				c.header("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
			},
		}),
	);
	app.get("*", (c) => {
		// A missing file is a 404, not the app shell: HTML served as a script breaks the page silently.
		if (/\.[a-z0-9]+$/i.test(c.req.path)) return c.notFound();
		c.header("Cache-Control", "no-cache");
		return c.html(indexHtml);
	});
} else if (!dev) {
	app.get("/", (c) =>
		c.text("Kiteline's API is running. Build the web app with `pnpm build` to serve it from here."),
	);
}

const server = serve({ fetch: app.fetch, port, hostname: host }, () => {
	printBanner(pairing, { version: pkg.version, dev });
	if (!dev) savePairing(home, pairing, pkg.version);
});

server.on("error", (error: NodeJS.ErrnoException) => {
	if (error.code !== "EADDRINUSE") throw error;
	printAlreadyRunning(port);
	process.exit(1);
});

function shutdown() {
	manager.stopAll();
	server.close();
	setTimeout(() => process.exit(0), 300).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
