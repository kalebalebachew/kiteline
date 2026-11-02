import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";

import type { App } from "./app";

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".webmanifest": "application/manifest+json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".txt": "text/plain; charset=utf-8",
};

const SECURITY = {
	"x-content-type-options": "nosniff",
	"referrer-policy": "no-referrer",
	"x-frame-options": "DENY",
	"strict-transport-security": "max-age=31536000",
	"permissions-policy": "camera=(), microphone=(), geolocation=()",
};

/** Tells the app it's on the relay, so it talks to its computer through the sealed tunnel. */
const MARK = '<meta name="kiteline-relay" content="1" />';
const shells = new Map<string, string>();

function shell(dir: string) {
	let html = shells.get(dir);
	if (!html) {
		html = readFileSync(join(dir, "index.html"), "utf8").replace("<head>", `<head>\n    ${MARK}`);
		shells.set(dir, html);
	}
	return html;
}

export function serveStatic(req: IncomingMessage, res: ServerResponse, path: string, app: App) {
	if (!app) {
		res
			.writeHead(503, { "content-type": "text/plain" })
			.end("Kiteline's app isn't here yet. Try again in a minute.");
		return;
	}
	const relative = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, "");
	if (relative.startsWith("..")) {
		res.writeHead(400).end();
		return;
	}
	const file = join(app.dir, relative);
	if (relative && relative !== "index.html" && existsSync(file) && statSync(file).isFile()) {
		const immutable = relative.startsWith("assets/");
		res.writeHead(200, {
			...SECURITY,
			"content-type": TYPES[extname(file)] ?? "application/octet-stream",
			"content-length": statSync(file).size,
			"cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
		});
		if (req.method === "HEAD") res.end();
		else createReadStream(file).pipe(res);
		return;
	}
	// A missing file is a 404; any other path is a route in the app.
	if (extname(relative)) {
		res.writeHead(404, SECURITY).end();
		return;
	}
	const html = shell(app.dir);
	res.writeHead(200, { ...SECURITY, "content-type": TYPES[".html"], "cache-control": "no-cache" });
	res.end(req.method === "HEAD" ? undefined : html);
}
