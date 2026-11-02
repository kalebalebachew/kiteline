import { defineConfig } from "tsdown";

/**
 * The npm package's build (`pnpm release`): the `kiteline` command with everything bundled in except
 * the Claude Agent SDK, which brings Claude Code itself for each platform and installs as a dependency.
 */
export default defineConfig({
	entry: ["./src/cli.ts"],
	format: "esm",
	platform: "node",
	target: "node22",
	clean: true,
	deps: {
		alwaysBundle: (id) => !id.startsWith("@anthropic-ai/claude-agent-sdk"),
		onlyBundle: false,
	},
});
