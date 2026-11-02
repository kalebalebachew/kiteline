#!/usr/bin/env node
/**
 * Builds the relay into apps/relay/dist: relay.mjs with everything bundled, and the web app beside it
 * in web/, marked with the Kiteline version it came from. Node alone runs the result.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const relay = resolve(import.meta.dirname, "..");
const root = resolve(relay, "..", "..");
const web = join(root, "apps", "web");
const out = join(relay, "dist");
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });

rmSync(out, { recursive: true, force: true });
run(join(root, "node_modules", ".bin", "tsc"), ["-b", "packages/api"], root);
run(join(relay, "node_modules", ".bin", "tsc"), ["--noEmit"], relay);
run(join(relay, "node_modules", ".bin", "tsdown"), [], relay);
run(join(web, "node_modules", ".bin", "vite"), ["build", "--outDir", join(out, "web"), "--emptyOutDir"], web);
const { version } = JSON.parse(readFileSync(join(root, "apps", "server", "package.json"), "utf8"));
writeFileSync(join(out, "web", "version.json"), JSON.stringify({ version }));
console.log(`\n  Built the relay with app ${version} into apps/relay/dist\n`);
