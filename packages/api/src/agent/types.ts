/**
 * The wire model Kiteline sends to the browser. The server turns raw Agent SDK
 * messages and saved transcripts into these, so the client never parses SDK
 * shapes and never receives image data or multi-megabyte tool output.
 */

export const AGENT_PROVIDERS = ["claude", "codex"] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto", "bypassPermissions"] as const;
export type PermissionModeId = (typeof PERMISSION_MODES)[number];

/** Claude Code's effort levels, from fastest to smartest. */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/**
 * An effort level to switch to, as `/effort` does. `persist` also saves it as the default for new
 * sessions on that model, in the same settings file the terminal writes; Claude Code never saves
 * max. A null level puts the session back on its model's own default, like `/effort auto`.
 */
export type EffortChoice = { level: EffortLevel | null; persist: boolean };

/** Where a session that isn't running would start: the effort sheet's view before anything is live. */
export type EffortInfo = {
	/** The model it would run, e.g. "claude-opus-5-5". */
	model: string | null;
	/** The levels that model offers, low to high: empty when it takes none, null when unknown. */
	levels: EffortLevel[] | null;
	/** The level it would start at: your saved default for the model, else the model's own. */
	effort: EffortLevel | null;
	/** The model's own default, which `/effort auto` goes back to. */
	modelDefault: EffortLevel | null;
};

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
			/** Stop cancelled it while it waited in the queue, before Claude Code read it. */
			cancelled?: boolean;
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
	provider: AgentProvider;
	model: string | null;
	permissionMode: PermissionModeId | null;
	slashCommands: string[];
	claudeCodeVersion: string | null;
	apiKeySource: string | null;
	compacting: boolean;
	/** The level the next turn runs at, as Claude Code reports it; null when the model takes none. */
	effort: EffortLevel | null;
	/** The levels the session's model offers, low to high: empty when it takes none, null until known. */
	effortLevels: EffortLevel[] | null;
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
	/** The tool item when the runtime uses a separate id for each approval callback. */
	toolUseId?: string;
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
	provider: AgentProvider;
	sessionId: string;
	cwd: string;
	title: string;
	status: RunStatus;
	pendingPermissions: number;
	startedAt: number;
	lastActivity: number;
};

export type SessionInfo = {
	provider: AgentProvider;
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
