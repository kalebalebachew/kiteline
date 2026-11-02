import { defineConfig } from "tsdown";

/** One file the server runs with Node alone: ws and the protocol module are bundled in. */
export default defineConfig({
	entry: { relay: "./src/index.ts" },
	format: "esm",
	platform: "node",
	target: "node22",
	outDir: "./dist",
	clean: false,
	deps: {
		alwaysBundle: () => true,
		neverBundle: ["bufferutil", "utf-8-validate"],
		onlyBundle: false,
	},
});
