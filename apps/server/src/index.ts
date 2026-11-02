import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { RunManager } from "@kiteline/api/agent/manager";
import { SessionTracker } from "@kiteline/api/agent/tracker";
import { type Actor, type ClaimProblem, Devices } from "@kiteline/api/devices";
import { appRouter } from "@kiteline/api/routers/index";
import type { Identity } from "@kiteline/api/tunnel/crypto";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono, type Context as HonoContext } from "hono";
import { compress } from "hono/compress";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { logger } from "hono/logger";

import pkg from "../package.json" with { type: "json" };
import {
	DEVICE_COOKIE,
	kitelineHome,
	loadComputerKey,
	localAddress,
	PairLimiter,
	safeEqual,
	saveServerInfo,
} from "./auth";
import {
	addressesFor,
	pairingLinks,
	printAlreadyRunning,
	printBanner,
	printSettingsError,
	spaced,
} from "./banner";
import { command, readSettings, SettingsError } from "./config";
import { startConsole } from "./console";
import { createContext } from "./context";
import { hostAddress, startRelay } from "./relay";

const dev = process.argv.includes("--dev");
let settings: ReturnType<typeof readSettings>;
try {
	settings = readSettings();
} catch (error) {
	if (!(error instanceof SettingsError)) throw error;
	printSettingsError(error.message);
	process.exit(1);
}
const { port, host, allowBypass } = settings;

const home = kitelineHome(settings.home);
const startOver = process.argv.includes("--new-token");
const computer = loadComputerKey(home, { rotate: startOver });
const devices = new Devices(join(home, "devices.json"));
if (startOver) devices.removeAll({ kind: "terminal" });
// Before 0.3 this kept the last pairing link, and the one code in it.
rmSync(join(home, "pairing.json"), { force: true });

const where = {
	publicUrl: settings.publicUrl,
	loopbackOnly: host === "127.0.0.1" || host === "localhost",
	...(settings.relay ? { relay: { url: settings.relay, hostId: await hostAddress(home) } } : {}),
};
const webPort = dev ? 4546 : port;
const pairingLink = pairingLinks(webPort, where);
const limiter = new PairLimiter();
// A person at a terminal can be asked about each device that wants to pair; a service can't.
const interactive = !dev && !!process.stdin.isTTY && !!process.stdout.isTTY;
const log = (message: string) => console.log(`  ${message}`);

const manager = new RunManager({
	claudePath: settings.claudePath ?? null,
	allowBypass,
	maxLiveRuns: settings.maxSessions,
	idleTimeoutMs: settings.idleMinutes * 60_000,
	tracker: new SessionTracker(join(home, "sessions.json")),
});

const shared = { manager, devices, pairingLink, allowBypass, version: pkg.version };

/** Requests through the relay come with who the tunnel proved is at the other end. */
type Env = { Bindings: { tunnel?: Identity } };

/**
 * Who a request is from: the device whose tunnel or cookie it came with, or the computer's own
 * `kiteline` commands, which hold the computer's key. Through the relay, only the tunnel counts.
 */
function callerOf(c: HonoContext<Env>): Actor | null {
	const tunnel = c.env?.tunnel;
	if (tunnel) {
		const device = tunnel.kind === "device" ? devices.device(tunnel.id) : null;
		return device ? { kind: "device", ...device } : null;
	}
	const cookie = getCookie(c, DEVICE_COOKIE);
	const device = cookie ? devices.fromCookie(cookie) : null;
	if (device) return { kind: "device", ...device };
	const header = c.req.header("authorization");
	if (header?.startsWith("Bearer ") && safeEqual(header.slice(7), computer.key)) return { kind: "terminal" };
	return null;
}

const CLAIM_ERRORS: Record<ClaimProblem, string> = {
	unknown: `That pairing code isn't one this computer made. Make a new one with ${command("pair")}.`,
	expired: `That pairing code has expired. Make a new one with ${command("pair")}.`,
	used: `That pairing code was already used. Make a new one with ${command("pair")}.`,
	busy: "Too many devices are waiting to pair. Answer those first, or wait a few minutes.",
};

/** Each device's open streams, so they end the moment it's removed. */
const streams = new Map<string, Set<() => void>>();

/** Passes a device's response on, and knows when it's done: until then the device counts as active. */
function guarded(response: Response, device: string | null, release: () => void) {
	if (!device || !response.body) {
		release();
		return response;
	}
	const reader = response.body.getReader();
	let cut: (() => void) | null = null;
	let finished = false;
	const finish = () => {
		if (finished) return;
		finished = true;
		if (cut) streams.get(device)?.delete(cut);
		release();
	};
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			// Ended, not failed: the device's next request is refused, which tells it why.
			cut = () => {
				void reader.cancel().catch(() => {});
				try {
					controller.close();
				} catch {}
				finish();
			};
			const open = streams.get(device) ?? new Set();
			streams.set(device, open);
			open.add(cut);
		},
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					controller.close();
					finish();
				} else controller.enqueue(value);
			} catch (error) {
				controller.error(error);
				finish();
			}
		},
		cancel(reason) {
			finish();
			return reader.cancel(reason);
		},
	});
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

const app = new Hono<Env>();

if (process.env.KITELINE_DEBUG) app.use(logger());
// Transcripts are large JSON; Hono leaves event streams uncompressed so live updates still flow.
app.use(compress());

app.get("/auth/status", (c) => {
	const caller = callerOf(c);
	if (caller) return c.json({ authed: true, device: caller.kind === "device" ? caller : null });
	// A cookie that opens nothing: a device that was removed, or one paired before pairing changed.
	const stale = !!getCookie(c, DEVICE_COOKIE);
	if (stale) deleteCookie(c, DEVICE_COOKIE, { path: "/" });
	return c.json({ authed: false, stale });
});

/**
 * Asking to pair. The code is spent either way, and the device only gets in once someone allows it.
 * Through the relay the handshake already proved the code, and the tunnel says which.
 */
app.post("/auth/pair", async (c) => {
	const tunnel = c.env?.tunnel;
	const body = (await c.req.json().catch(() => ({}))) as { code?: unknown; name?: unknown };
	let result: Awaited<ReturnType<typeof devices.claim>>;
	if (tunnel) {
		if (tunnel.kind !== "pairing") return c.json({ ok: false, error: "This device is already paired." }, 409);
		result = await devices.claim({ id: tunnel.id }, { name: body.name, via: "relay" });
	} else {
		const ip = getConnInfo(c).remote.address ?? "unknown";
		if (limiter.blocked(ip)) {
			return c.json({ ok: false, error: "Too many wrong codes. Wait ten minutes and try again." }, 429);
		}
		const code = typeof body.code === "string" ? body.code.trim() : "";
		result = /^[\w-]{16,64}$/.test(code)
			? await devices.claim({ code }, { name: body.name, via: "direct" })
			: { ok: false, problem: "unknown" };
		if (!result.ok && result.problem === "unknown") limiter.fail(ip);
	}
	if (!result.ok) {
		return c.json(
			{ ok: false, problem: result.problem, error: CLAIM_ERRORS[result.problem] },
			result.problem === "busy" ? 429 : 410,
		);
	}
	const { claim, match, expiresAt } = result.request;
	return c.json({ ok: true, claim, match, expiresAt });
});

/** The device that asked waits here for the answer: up to `wait` seconds, then it asks again. */
app.get("/auth/pair/:claim", async (c) => {
	const tunnel = c.env?.tunnel;
	const wait = Math.min(25, Math.max(0, Number(c.req.query("wait")) || 0)) * 1000;
	const status = await devices.status(c.req.param("claim"), wait, c.req.raw.signal);
	if (!status) return c.json({ state: "gone" }, 404);
	if (status.state !== "approved") return c.json(status);
	// Through the relay the phone keeps its key itself; otherwise it's a cookie, out of the page's reach.
	if (tunnel) return c.json(status);
	const https = c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:";
	setCookie(c, DEVICE_COOKIE, Devices.cookieFor(status.device), {
		httpOnly: true,
		sameSite: "Strict",
		secure: https,
		path: "/",
		maxAge: 60 * 60 * 24 * 400,
	});
	return c.json({ state: "approved", device: { id: status.device.id, name: status.device.name } });
});

app.delete("/auth/pair/:claim", (c) => {
	devices.cancel(c.req.param("claim"));
	return c.json({ ok: true });
});

/** Unpairing: the device is forgotten here too, so its key opens nothing even if it was copied. */
app.post("/auth/logout", (c) => {
	const caller = callerOf(c);
	if (caller?.kind === "device") devices.remove(caller.id, caller);
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
	const caller = callerOf(c);
	const device = caller?.kind === "device" ? caller.id : null;
	const release = device ? devices.using(device) : () => {};
	let result: Awaited<ReturnType<typeof rpcHandler.handle>>;
	try {
		result = await rpcHandler.handle(c.req.raw, {
			prefix: "/rpc",
			context: createContext({ caller, shared }),
		});
	} catch (error) {
		release();
		throw error;
	}
	if (result.matched) return guarded(result.response, device, release);
	release();
	await next();
});

// The server also hosts the web app, so one port does everything: from `web/` beside it in the npm
// package, or from the web app's own build in a clone of the repo.
const here = dirname(fileURLToPath(import.meta.url));
const webDir = [join(here, "web"), resolve(here, "../../web/dist")].find((dir) =>
	existsSync(join(dir, "index.html")),
);
const indexFile = webDir ? join(webDir, "index.html") : "";
if (!dev && webDir) {
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

let relay: Awaited<ReturnType<typeof startRelay>> | null = null;

devices.on("removed", (device, by) => {
	// A device removing itself still wants the answer: cut it off a moment later.
	const self = by.kind === "device" && by.id === device.id;
	setTimeout(
		() => {
			for (const cut of [...(streams.get(device.id) ?? [])]) cut();
			streams.delete(device.id);
			relay?.disconnect({ kind: "device", id: device.id });
		},
		self ? 1000 : 0,
	);
});

// For the record, in the service's log. A terminal says it all as it happens instead.
if (!interactive) {
	devices.on("request", (r) => log(`${r.name} asks to pair; its screen shows ${spaced(r.match)}.`));
	devices.on("settled", (r) => {
		if (r.state === "approved")
			log(`Paired ${r.name}, allowed ${r.by?.kind === "device" ? `on ${r.by.name}` : "in the terminal"}.`);
		else if (r.state === "denied") log(`Declined ${r.name}.`);
		else if (r.state === "expired") log(`Nobody answered ${r.name} in time; it isn't paired.`);
	});
	devices.on("removed", (device) => log(`Removed ${device.name}.`));
}

const server = serve({ fetch: app.fetch, port, hostname: host }, () => {
	printBanner(addressesFor(webPort, where), { version: pkg.version, dev, relay: settings.relay });
	if (!dev) {
		saveServerInfo(home, {
			version: pkg.version,
			pid: process.pid,
			local: localAddress(port, host),
			relay: settings.relay,
			startedAt: new Date().toISOString(),
		});
	}
	if (process.env.KITELINE_TOKEN?.trim())
		log(
			`KITELINE_TOKEN isn't used any more: each device pairs with a one-time code from ${command("pair")}.`,
		);
	if (startOver) log("Every device was unpaired.");
	else if (computer.replaced)
		log(
			`Pairing works differently from this version on: pair each phone again, once, with ${command("pair")}.`,
		);

	if (interactive) startConsole({ devices, pairingLink });
	else if (devices.count) log(`Pair another device with: ${command("pair")}\n`);
	else log(`Pair your phone with: ${command("pair")}\n`);

	if (settings.relay) {
		void startRelay({
			relay: settings.relay,
			home,
			version: pkg.version,
			keyFor: (identity) => devices.key(identity),
			handle: (request, identity) => app.fetch(request, { tunnel: identity }),
			track: (identity) => (identity.kind === "device" ? devices.using(identity.id) : undefined),
			log,
		}).then((started) => {
			relay = started;
		});
	}
});

server.on("error", (error: NodeJS.ErrnoException) => {
	if (error.code !== "EADDRINUSE") throw error;
	printAlreadyRunning(port);
	process.exit(1);
});

function shutdown() {
	relay?.stop();
	manager.stopAll();
	devices.flush();
	server.close();
	setTimeout(() => process.exit(0), 300).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
