import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { z } from "zod";

import { protectedProcedure } from "../index";

const SKIP = new Set(["node_modules", "__pycache__", "target", "dist", "build", ".git"]);

export const fsRouter = {
	/** Sub-folders of a folder, for picking where a new session starts. */
	dirs: protectedProcedure
		.input(z.object({ path: z.string().optional(), hidden: z.boolean().default(false) }))
		.handler(async ({ input }) => {
			const path = resolve(input.path?.replace(/^~(?=$|\/)/, homedir()) || homedir());
			const info = await stat(path).catch(() => null);
			if (!info?.isDirectory()) throw new Error(`${path} isn't a folder.`);
			const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
			const dirs = await Promise.all(
				entries
					.filter((e) => e.isDirectory() && !SKIP.has(e.name) && (input.hidden || !e.name.startsWith(".")))
					.map(async (e) => {
						const full = join(path, e.name);
						const git = await stat(join(full, ".git")).catch(() => null);
						return { name: e.name, path: full, isGit: !!git };
					}),
			);
			dirs.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
			const parent = dirname(path);
			return { path, parent: parent === path ? null : parent, home: homedir(), dirs };
		}),
};
