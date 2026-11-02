import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["./src/index.ts", "./src/pair.ts", "./src/cli.ts"],
	format: "esm",
	outDir: "./dist",
	clean: true,
	deps: {
		alwaysBundle: [/@kiteline\/.*/],
	},
});
