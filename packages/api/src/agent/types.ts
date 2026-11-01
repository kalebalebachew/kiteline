/**
 * The wire model Kiteline sends to the browser. The server turns raw Agent SDK
 * messages and saved transcripts into these, so the client never parses SDK
 * shapes and never receives image data or multi-megabyte tool output.
 */

export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto", "bypassPermissions"] as const;
export type PermissionModeId = (typeof PERMISSION_MODES)[number];

export type ToolResult = {
	text: string;
	isError: boolean;
	truncated: boolean;
	images: number;
};

export type Item =
	| {
			kind: "user";
			id: string;
			text: string;
			images: number;
			/** Set when the turn was a slash command, e.g. "/compact". */
			command?: string;
	  }
	| { kind: "text"; id: string; text: string; parent: string | null }
	| { kind: "thinking"; id: string; text: string; parent: string | null }
	| {
			kind: "tool";
			id: string;
			name: string;
			input: Record<string, unknown>;
			parent: string | null;
			result?: ToolResult;
	  }
	| { kind: "notice"; id: string; tone: "info" | "warn" | "error"; text: string };

export type RunStatus = "starting" | "running" | "waiting" | "idle" | "closed" | "error";

export type RunMeta = {
	model: string | null;
	permissionMode: PermissionModeId | null;
	slashCommands: string[];
	claudeCodeVersion: string | null;
	apiKeySource: string | null;
	compacting: boolean;
};

export type RunUsage = {
	costUsd: number;
	durationMs: number;
	numTurns: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
};

export type PermissionRequest = {
	id: string;
	toolName: string;
	input: Record<string, unknown>;
	title: string | null;
	description: string | null;
	displayName: string | null;
	decisionReason: string | null;
	blockedPath: string | null;
	canAlwaysAllow: boolean;
	/** What "always allow" covers, in words: "Don't ask again for `pnpm test` commands in this project". */
	alwaysAllow: string | null;
	defaultToNo: boolean;
	fromSubagent: boolean;
	createdAt: number;
};

export type PermissionDecision =
	| { behavior: "allow" }
	| { behavior: "allowAlways" }
	| { behavior: "deny"; message?: string; interrupt?: boolean }
	| { behavior: "answer"; answers: Record<string, string> };

export type RunSnapshot = {
	sessionId: string;
	cwd: string;
	status: RunStatus;
	items: Item[];
	draft: string;
	meta: RunMeta;
	usage: RunUsage | null;
	error: string | null;
	permissions: PermissionRequest[];
	toolProgress: Record<string, number>;
	startedAt: number;
};

export type RunEvent =
	| { type: "snapshot"; run: RunSnapshot | null }
	| { type: "item"; item: Item }
	| { type: "tool-result"; toolUseId: string; result: ToolResult }
	| { type: "tool-progress"; toolUseId: string; seconds: number }
	| { type: "draft-delta"; text: string }
	| { type: "draft-reset" }
	| { type: "status"; status: RunStatus; error: string | null }
	| { type: "meta"; meta: RunMeta }
	| { type: "usage"; usage: RunUsage }
	| { type: "permission"; request: PermissionRequest }
	| { type: "permission-resolved"; id: string };

export type RunSummary = {
	sessionId: string;
	cwd: string;
	title: string;
	status: RunStatus;
	pendingPermissions: number;
	startedAt: number;
	lastActivity: number;
};

export type SessionInfo = {
	sessionId: string;
	title: string;
	firstPrompt: string | null;
	cwd: string | null;
	gitBranch: string | null;
	lastModified: number;
	createdAt: number | null;
	sizeBytes: number | null;
};

export type HistoryPage = {
	items: Item[];
	/** Index of `items[0]` within the full transcript, for "load earlier". */
	start: number;
	total: number;
};
