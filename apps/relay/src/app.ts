import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { gunzipSync } from "node:zlib";

/**
 * The web app the relay serves, and only that: never anything a connected computer sends. It starts
 * with the copy bundled at deploy time, and moves to a newer official release when one is published
 * to npm, checked against the registry's integrity hash.
 */
export type App = { version: string; dir: string } | null;

type Options = { bundled: string; fixed: string | null; cache: string; log: (message: string) => void };

const REGISTRY = "https://registry.npmjs.org/kiteline";
const CHECK_MS = 15 * 60_000;

/** Plain releases only: 1.2.3. Pre-releases and npm's staging placeholders never get served. */
function parse(version: string): [number, number, number] | null {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function newer(a: string, b: string) {
	const x = parse(a);
	const y = parse(b);
	if (!x) return false;
	if (!y) return true;
	for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
	return false;
}

function versionOf(dir: string) {
	try {
		return (JSON.parse(readFileSync(join(dir, "version.json"), "utf8")) as { version: string }).version;
	} catch {
		return "0.0.0";
	}
}

export class AppSource {
	private app: App = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private checking: Promise<void> | null = null;

	constructor(private readonly options: Options) {}

	current() {
		return this.app;
	}

	start() {
		const { fixed, bundled, cache } = this.options;
		if (fixed) {
			this.app = { version: versionOf(fixed), dir: fixed };
			this.options.log(`serving the app from ${fixed}`);
			return;
		}
		if (existsSync(join(bundled, "index.html"))) this.app = { version: versionOf(bundled), dir: bundled };
		// A release fetched before this restart, if it's newer than the bundled one.
		if (existsSync(cache)) {
			for (const name of readdirSync(cache)) {
				const dir = join(cache, name);
				if (existsSync(join(dir, "index.html")) && (!this.app || newer(name, this.app.version))) {
					this.app = { version: name, dir };
				}
			}
		}
		this.options.log(`serving app ${this.app?.version ?? "(none)"}`);
		void this.check();
		this.timer = setInterval(() => void this.check(), CHECK_MS);
		this.timer.unref();
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
	}

	/** A computer on a newer release than the app: look for it now rather than at the next check. */
	noticeVersion(version: string) {
		if (!this.options.fixed && this.app && newer(version, this.app.version)) void this.check();
	}

	private check() {
		this.checking ??= this.update()
			.catch((error: unknown) =>
				this.options.log(`app update failed: ${error instanceof Error ? error.message : error}`),
			)
			.finally(() => {
				this.checking = null;
			});
		return this.checking;
	}

	private async update() {
		const response = await fetch(REGISTRY, {
			headers: { accept: "application/vnd.npm.install-v1+json" },
			signal: AbortSignal.timeout(20_000),
		});
		if (!response.ok) throw new Error(`registry answered ${response.status}`);
		const packument = (await response.json()) as {
			"dist-tags"?: { latest?: string };
			versions?: Record<string, { dist?: { tarball?: string; integrity?: string } }>;
		};
		const latest = packument["dist-tags"]?.latest;
		if (!latest || !parse(latest) || (this.app && !newer(latest, this.app.version))) return;
		const dist = packument.versions?.[latest]?.dist;
		if (!dist?.tarball || !dist.integrity?.startsWith("sha512-")) throw new Error(`no tarball for ${latest}`);

		const tarball = Buffer.from(
			await (await fetch(dist.tarball, { signal: AbortSignal.timeout(60_000) })).arrayBuffer(),
		);
		const digest = createHash("sha512").update(tarball).digest("base64");
		if (`sha512-${digest}` !== dist.integrity)
			throw new Error(`${latest}'s tarball doesn't match its integrity hash`);

		const target = join(this.options.cache, latest);
		const staging = `${target}.partial`;
		rmSync(staging, { recursive: true, force: true });
		let files = 0;
		for (const entry of untar(gunzipSync(tarball))) {
			if (!entry.path.startsWith("package/dist/web/")) continue;
			const relative = normalize(entry.path.slice("package/dist/web/".length));
			if (!relative || relative.startsWith("..")) continue;
			const file = join(staging, relative);
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, entry.data);
			files++;
		}
		if (!existsSync(join(staging, "index.html"))) throw new Error(`${latest} has no web app`);
		writeFileSync(join(staging, "version.json"), JSON.stringify({ version: latest }));
		rmSync(target, { recursive: true, force: true });
		renameSync(staging, target);
		this.app = { version: latest, dir: target };
		this.options.log(`now serving app ${latest} from npm (${files} files)`);

		// Keep the two newest releases.
		const kept = readdirSync(this.options.cache)
			.filter((name) => parse(name))
			.sort((a, b) => (newer(a, b) ? -1 : 1));
		for (const name of kept.slice(2))
			rmSync(join(this.options.cache, name), { recursive: true, force: true });
	}
}

/** Enough of tar to read an npm package: regular files, long names from pax or GNU headers. */
function* untar(archive: Buffer): Generator<{ path: string; data: Buffer }> {
	const field = (block: Buffer, start: number, length: number) =>
		block
			.subarray(start, start + length)
			.toString("utf8")
			.replace(/\0.*$/s, "");
	let offset = 0;
	let longPath: string | null = null;
	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const size = Number.parseInt(field(header, 124, 12).trim() || "0", 8);
		const type = String.fromCharCode(header[156] ?? 0);
		const data = archive.subarray(offset + 512, offset + 512 + size);
		offset += 512 + Math.ceil(size / 512) * 512;
		if (type === "x") {
			const path = /\d+ path=([^\n]*)\n/.exec(data.toString("utf8"))?.[1];
			if (path) longPath = path;
			continue;
		}
		if (type === "L") {
			longPath = data.toString("utf8").replace(/\0.*$/s, "");
			continue;
		}
		if (type === "g") continue;
		const prefix = field(header, 345, 155);
		const name = field(header, 0, 100);
		const path = longPath ?? (prefix ? `${prefix}/${name}` : name);
		longPath = null;
		if (type === "0" || type === "\0") yield { path, data };
	}
}
