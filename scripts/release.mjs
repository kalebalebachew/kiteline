#!/usr/bin/env node
/**
 * `pnpm release`: builds the npm package into release/kiteline, packs it beside it, and lists what's in
 * it. Publishing is a separate, deliberate step: `npm publish ./release/kiteline`.
 *
 * It builds into its own folder, so the app's own build (and a Kiteline running from it) is left alone.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const release = join(root, "release");
const out = join(release, "kiteline");
const server = join(root, "apps", "server");
const web = join(root, "apps", "web");
const REPO = "https://github.com/sifenfisaha/kiteline";

const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });

rmSync(release, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// tsdown and Vite don't typecheck, so check first.
run(join(root, "node_modules", ".bin", "tsc"), ["-b", "packages/api"], root);
run(join(server, "node_modules", ".bin", "tsc"), ["--noEmit"], server);
run(
	join(server, "node_modules", ".bin", "tsdown"),
	["--config", "tsdown.release.config.ts", "--out-dir", join(out, "dist")],
	server,
);
run(
	join(web, "node_modules", ".bin", "vite"),
	["build", "--outDir", join(out, "dist", "web"), "--emptyOutDir"],
	web,
);

const app = JSON.parse(readFileSync(join(server, "package.json"), "utf8"));
const pkg = {
	name: "kiteline",
	version: app.version,
	description: "Drive Claude Code on your computer from your phone.",
	keywords: [
		"claude",
		"claude-code",
		"anthropic",
		"agent",
		"mobile",
		"phone",
		"remote",
		"pwa",
		"self-hosted",
	],
	homepage: "https://kiteline.seefun.dev",
	bugs: `${REPO}/issues`,
	repository: { type: "git", url: `git+${REPO}.git` },
	license: "MIT",
	type: "module",
	bin: { kiteline: "dist/cli.mjs" },
	files: ["dist"],
	engines: { node: ">=22.18.0" },
	// Everything else is bundled in. The SDK brings Claude Code itself, a build for each platform.
	dependencies: { "@anthropic-ai/claude-agent-sdk": app.dependencies["@anthropic-ai/claude-agent-sdk"] },
};
writeFileSync(join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
cpSync(join(root, "LICENSE"), join(out, "LICENSE"));

// npm shows the README on its own page, where the repo's relative links and pictures don't resolve.
const readme = readFileSync(join(root, "README.md"), "utf8")
	.replace(/(src|href)="(?!https?:|#|mailto:)([^"]+)"/g, (_, attr, path) =>
		attr === "src"
			? `${attr}="https://raw.githubusercontent.com/sifenfisaha/kiteline/master/${path}"`
			: `${attr}="${REPO}/blob/master/${path}"`,
	)
	.replace(/\]\((?!https?:|#|mailto:)([^)]+)\)/g, (_, path) => `](${REPO}/blob/master/${path})`);
writeFileSync(join(out, "README.md"), readme);

if (!existsSync(join(out, "dist", "cli.mjs")) || !existsSync(join(out, "dist", "web", "index.html"))) {
	throw new Error("The build is missing the command or the web app.");
}
run("npm", ["pack", "--pack-destination", release], out);
console.log(`\n  Built release/kiteline ${pkg.version}. Publish it with: npm publish ./release/kiteline\n`);
