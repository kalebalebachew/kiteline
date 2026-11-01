import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";

/** Where an "always" choice is remembered, in the words of the sentence it ends. */
const WHERE: Record<PermissionUpdate["destination"], string> = {
	session: "for the rest of this session",
	cliArg: "for the rest of this session",
	localSettings: "in this project",
	projectSettings: "in this project",
	userSettings: "in every project",
};

/** What one permission rule covers: "`pnpm test` commands", "edits", "fetches from github.com". */
function ruleScope(toolName: string, content: string | undefined): string {
	if (content) {
		if (toolName === "Bash" || toolName === "PowerShell")
			return `\`${content.replace(/:\*$/, "")}\` commands`;
		if (toolName === "WebFetch" && content.startsWith("domain:")) return `fetches from ${content.slice(7)}`;
		if (toolName === "Read") return `reading ${content}`;
		if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(toolName)) return `edits to ${content}`;
		return `${toolName}(${content})`;
	}
	switch (toolName) {
		case "Edit":
		case "Write":
		case "MultiEdit":
		case "NotebookEdit":
			return "edits";
		case "Read":
			return "reading files";
		case "Bash":
		case "PowerShell":
			return "commands";
		case "WebFetch":
			return "web fetches";
		case "WebSearch":
			return "web searches";
		default:
			return toolName;
	}
}

/**
 * Says what "always allow" will do, from the suggestions Claude Code offers with a permission
 * request, the way its own terminal prompt does: "Don't ask again for `pnpm test` commands in this
 * project". Null when there is nothing to describe.
 */
export function describeAlways(updates: PermissionUpdate[] | undefined): string | null {
	const update = updates?.[0];
	if (!update) return null;
	const where = WHERE[update.destination];
	switch (update.type) {
		case "addRules":
		case "replaceRules": {
			if (update.behavior !== "allow" || !update.rules.length) return null;
			const scopes = [...new Set(update.rules.map((rule) => ruleScope(rule.toolName, rule.ruleContent)))];
			return `Don't ask again for ${scopes.join(" and ")} ${where}`;
		}
		case "setMode":
			return update.mode === "acceptEdits"
				? `Accept every edit ${where}`
				: update.mode === "bypassPermissions"
					? `Stop asking ${where}`
					: null;
		case "addDirectories":
			return update.directories.length
				? `Allow access to ${update.directories.length === 1 ? update.directories[0] : `${update.directories.length} folders`} ${where}`
				: null;
		default:
			return null;
	}
}
