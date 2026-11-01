import { randomUUID } from "node:crypto";

import {
	type CanUseTool,
	type PermissionResult,
	type PermissionUpdate,
	type Query,
	query,
	type SDKMessage,
	type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { describeAlways } from "./always";
import { assistantItems, trimInput, userParts } from "./normalize";
import { AsyncQueue } from "./queue";
import type {
	Item,
	PermissionDecision,
	PermissionModeId,
	PermissionRequest,
	RunEvent,
	RunMeta,
	RunSnapshot,
	RunStatus,
	RunUsage,
} from "./types";

const PHONE_NOTE =
	"The user is driving this session from Kiteline, a web client usually open on a phone. Keep replies easy to scan on a narrow screen: short paragraphs, and code blocks only when they help.";

export type ImageInput = { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

export type RunOptions = {
	sessionId: string;
	cwd: string;
	resume: boolean;
	permissionMode: PermissionModeId;
	model: string | null;
	claudePath: string | null;
	allowBypass: boolean;
};

type Pending = {
	request: PermissionRequest;
	input: Record<string, unknown>;
	suggestions: PermissionUpdate[] | undefined;
	settle: (result: PermissionResult) => void;
};

export class Run {
	readonly sessionId: string;
	readonly cwd: string;
	readonly startedAt = Date.now();
	status: RunStatus = "starting";
	error: string | null = null;
	items: Item[] = [];
	draft = "";
	usage: RunUsage | null = null;
	meta: RunMeta;
	lastActivity = Date.now();
	title = "";

	private readonly input = new AsyncQueue<SDKUserMessage>();
	private readonly pending = new Map<string, Pending>();
	private readonly toolProgress = new Map<string, number>();
	private readonly tools = new Map<string, Extract<Item, { kind: "tool" }>>();
	private readonly q: Query;
	private draftBuffer = "";
	private draftTimer: ReturnType<typeof setTimeout> | null = null;
	/**
	 * Messages sent whose turn hasn't ended yet. A message sent while Claude Code works is its own
	 * turn after the current one, so the run is only idle once every turn it was given has ended.
	 */
	private turnsOwed = 0;
	/** Set by Stop until the interrupted turn reports its end. */
	private interrupting = false;
	/** Claude Code reports its own running/idle state; once it has, that decides the status. */
	private stateEvents = false;

	constructor(
		options: RunOptions,
		private readonly emit: (event: RunEvent) => void,
		private readonly onEnd: () => void,
	) {
		this.sessionId = options.sessionId;
		this.cwd = options.cwd;
		this.meta = {
			model: options.model,
			permissionMode: options.permissionMode,
			slashCommands: [],
			claudeCodeVersion: null,
			apiKeySource: null,
			compacting: false,
		};

		this.q = query({
			prompt: this.input,
			options: {
				cwd: options.cwd,
				...(options.resume ? { resume: options.sessionId } : { sessionId: options.sessionId }),
				permissionMode: options.permissionMode,
				allowDangerouslySkipPermissions: options.allowBypass,
				...(options.model ? { model: options.model } : {}),
				...(options.claudePath ? { pathToClaudeCodeExecutable: options.claudePath } : {}),
				includePartialMessages: true,
				systemPrompt: { type: "preset", preset: "claude_code", append: PHONE_NOTE },
				settingSources: ["user", "project", "local"],
				canUseTool: this.canUseTool,
				// Ask Claude Code to say when a turn is really over (after background work, too).
				env: { ...process.env, CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1" },
				stderr: (line) => {
					if (process.env.KITELINE_DEBUG)
						process.stderr.write(`[claude ${options.sessionId.slice(0, 8)}] ${line}`);
				},
			},
		});

		void this.pump();
	}

	snapshot(): RunSnapshot {
		return {
			sessionId: this.sessionId,
			cwd: this.cwd,
			status: this.status,
			items: this.items,
			// The unflushed buffer reaches a new watcher as its next delta; counting it here too doubled it.
			draft: this.draft,
			meta: this.meta,
			usage: this.usage,
			error: this.error,
			permissions: [...this.pending.values()].map((p) => p.request),
			toolProgress: Object.fromEntries(this.toolProgress),
			startedAt: this.startedAt,
		};
	}

	get pendingCount() {
		return this.pending.size;
	}

	get isLive() {
		return this.status !== "closed" && this.status !== "error";
	}

	send(text: string, images: ImageInput[] = []) {
		if (!this.isLive) throw new Error("This session has stopped.");
		const uuid = randomUUID();
		const content: Exclude<SDKUserMessage["message"]["content"], string> = images.map((image) => ({
			type: "image" as const,
			source: { type: "base64" as const, media_type: image.mediaType, data: image.data },
		}));
		if (text) content.push({ type: "text", text });

		const trimmed = text.trim();
		const command = trimmed.startsWith("/") ? trimmed.split(/\s/)[0] : undefined;
		this.push({ kind: "user", id: uuid, text, images: images.length, ...(command ? { command } : {}) });
		if (!this.title && trimmed) this.title = trimmed.slice(0, 120);

		this.input.push({
			type: "user",
			uuid,
			session_id: this.sessionId,
			parent_tool_use_id: null,
			message: { role: "user", content },
		});
		this.turnsOwed++;
		// A message sent while a request waits for you doesn't unblock it: still waiting.
		this.setStatus(this.pending.size ? "waiting" : "running");
	}

	respond(id: string, decision: PermissionDecision) {
		const pending = this.pending.get(id);
		if (!pending) throw new Error("That request is no longer waiting.");
		switch (decision.behavior) {
			case "allow":
				pending.settle({ behavior: "allow", updatedInput: pending.input });
				break;
			case "allowAlways":
				// Claude Code can refuse to remember a rule; then "always" is a plain allow.
				if (!pending.request.canAlwaysAllow) {
					pending.settle({ behavior: "allow", updatedInput: pending.input });
					break;
				}
				pending.settle({
					behavior: "allow",
					updatedInput: pending.input,
					...(pending.suggestions?.length ? { updatedPermissions: pending.suggestions } : {}),
				});
				break;
			case "answer":
				pending.settle({ behavior: "allow", updatedInput: { ...pending.input, answers: decision.answers } });
				break;
			case "deny":
				pending.settle({
					behavior: "deny",
					message: decision.message?.trim() || "The user declined this from Kiteline.",
					...(decision.interrupt ? { interrupt: true } : {}),
				});
				break;
		}
	}

	async interrupt() {
		// A Stop can drop the turns queued behind the current one, so stop counting on them; if one
		// still runs, its first message sets the status back to running.
		if (this.status === "running" || this.status === "waiting") this.interrupting = true;
		await this.q.interrupt();
	}

	async setPermissionMode(mode: PermissionModeId) {
		await this.q.setPermissionMode(mode);
		this.updateMeta({ permissionMode: mode });
	}

	async setModel(model: string | null) {
		await this.q.setModel(model ?? undefined);
		this.updateMeta({ model });
	}

	close() {
		this.input.close();
		this.q.close();
	}

	private canUseTool: CanUseTool = (toolName, input, options) =>
		new Promise<PermissionResult>((resolve) => {
			const id = options.toolUseID || randomUUID();
			const request: PermissionRequest = {
				id,
				toolName,
				input: (trimInput(input) ?? {}) as Record<string, unknown>,
				title: options.title ?? null,
				description: options.description ?? null,
				displayName: options.displayName ?? null,
				decisionReason: options.decisionReason ?? null,
				blockedPath: options.blockedPath ?? null,
				canAlwaysAllow: !!options.suggestions?.length && !options.suppressAlwaysAllowRule,
				alwaysAllow: describeAlways(options.suggestions),
				defaultToNo: !!options.defaultToNo,
				fromSubagent: !!options.agentID,
				createdAt: Date.now(),
			};
			const settle = (result: PermissionResult) => {
				if (!this.pending.delete(id)) return;
				this.emit({ type: "permission-resolved", id });
				if (this.status === "waiting" && this.pending.size === 0) this.setStatus("running");
				else this.touch();
				resolve(result);
			};
			this.pending.set(id, { request, input, suggestions: options.suggestions, settle });
			options.signal.addEventListener("abort", () => settle({ behavior: "deny", message: "Cancelled" }), {
				once: true,
			});
			this.emit({ type: "permission", request });
			this.setStatus("waiting");
		});

	private async pump() {
		try {
			for await (const message of this.q) this.handle(message);
			this.finish("closed", null);
		} catch (error) {
			// Don't leave the Claude Code process running behind a run that's gone.
			try {
				this.q.close();
			} catch {}
			this.finish("error", error instanceof Error ? error.message : String(error));
		}
	}

	private finish(status: RunStatus, error: string | null) {
		this.flushDraft();
		for (const pending of this.pending.values())
			pending.settle({ behavior: "deny", message: "Session ended" });
		this.input.close();
		this.error = error;
		this.setStatus(status);
		this.onEnd();
	}

	private handle(m: SDKMessage) {
		// Work arriving while idle is a turn that started on its own, such as one queued behind a Stop.
		if (
			this.status === "idle" &&
			(m.type === "assistant" || m.type === "stream_event" || m.type === "tool_progress")
		) {
			this.setStatus("running");
		}
		switch (m.type) {
			case "assistant": {
				if (m.parent_tool_use_id === null) this.resetDraft();
				for (const item of assistantItems(m.uuid, m.message, m.parent_tool_use_id)) {
					if (item.kind === "tool") this.tools.set(item.id, item);
					this.push(item);
				}
				if (m.error && m.parent_tool_use_id === null && !m.message.content?.length) {
					this.push({ kind: "notice", id: `${m.uuid}:error`, tone: "error", text: `API error: ${m.error}` });
				}
				break;
			}
			case "user": {
				const parts = userParts(m.uuid ?? randomUUID(), m.message);
				// Claude Code's "Interrupted" marker, with the id its transcript keeps, so it shows once
				// live and once after a reload. Command output reaches us as a system message instead.
				for (const item of parts.items) {
					if (item.kind === "notice" && item.text === "Interrupted") this.push(item);
				}
				for (const { toolUseId, result } of parts.results) {
					const tool = this.tools.get(toolUseId);
					if (tool) tool.result = result;
					this.toolProgress.delete(toolUseId);
					this.emit({ type: "tool-result", toolUseId, result });
				}
				this.touch();
				break;
			}
			case "stream_event": {
				if (m.parent_tool_use_id !== null) break;
				const event = m.event;
				if (event.type === "content_block_start" && event.content_block.type === "text") this.resetDraft();
				else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
					this.draftBuffer += event.delta.text;
					this.draftTimer ??= setTimeout(() => this.flushDraft(), 40);
				}
				break;
			}
			case "tool_progress": {
				this.toolProgress.set(m.tool_use_id, m.elapsed_time_seconds);
				this.touch();
				this.emit({ type: "tool-progress", toolUseId: m.tool_use_id, seconds: m.elapsed_time_seconds });
				break;
			}
			case "result": {
				this.resetDraft();
				const usage = m.usage;
				this.usage = {
					costUsd: m.total_cost_usd,
					durationMs: m.duration_ms,
					numTurns: m.num_turns,
					inputTokens: usage.input_tokens,
					outputTokens: usage.output_tokens,
					cacheReadTokens: usage.cache_read_input_tokens,
				};
				this.emit({ type: "usage", usage: this.usage });
				const stopped = this.interrupting;
				this.interrupting = false;
				this.turnsOwed = stopped ? 0 : Math.max(0, this.turnsOwed - 1);
				// A turn the user stopped isn't an error; Claude Code marks it "Interrupted" itself.
				if (m.subtype !== "success" && !stopped) {
					const detail = "errors" in m && Array.isArray(m.errors) ? m.errors.join("\n") : "";
					this.push({
						kind: "notice",
						id: m.uuid,
						tone: "error",
						text: detail || `The turn ended early (${m.subtype.replaceAll("_", " ")}).`,
					});
				}
				if (
					!this.stateEvents &&
					this.pending.size === 0 &&
					this.turnsOwed === 0 &&
					!(m.queued_turn_count && m.queued_turn_count > 0)
				)
					this.setStatus("idle");
				break;
			}
			case "system":
				this.handleSystem(m);
				break;
		}
	}

	private handleSystem(m: Extract<SDKMessage, { type: "system" }>) {
		switch (m.subtype) {
			case "init":
				this.updateMeta({
					model: m.model,
					permissionMode: m.permissionMode as PermissionModeId,
					slashCommands: m.slash_commands.filter((c) => !m.terminal_slash_commands?.includes(c)),
					claudeCodeVersion: m.claude_code_version,
					apiKeySource: m.apiKeySource,
				});
				if (this.status === "starting") this.setStatus("running");
				break;
			case "status":
				this.updateMeta({
					compacting: m.status === "compacting",
					...(m.permissionMode ? { permissionMode: m.permissionMode as PermissionModeId } : {}),
				});
				break;
			case "session_state_changed":
				this.stateEvents = true;
				if (m.state === "idle") {
					// The authoritative end of a turn: nothing queued is still owed.
					this.turnsOwed = 0;
					this.interrupting = false;
					if (this.pending.size === 0) this.setStatus("idle");
				} else if (m.state === "running" && this.pending.size === 0) this.setStatus("running");
				else if (m.state === "requires_action") this.setStatus("waiting");
				break;
			case "compact_boundary":
				this.push({ kind: "notice", id: m.uuid, tone: "info", text: "Context compacted" });
				break;
			case "local_command_output":
				this.push({ kind: "notice", id: m.uuid, tone: "info", text: m.content });
				break;
			case "api_retry":
				this.push({
					kind: "notice",
					id: m.uuid,
					tone: "warn",
					text: `API ${m.error_status ?? "error"}, retrying (${m.attempt}/${m.max_retries})`,
				});
				break;
		}
	}

	private push(item: Item) {
		this.items.push(item);
		this.emit({ type: "item", item });
		this.touch();
	}

	private resetDraft() {
		if (this.draftTimer) clearTimeout(this.draftTimer);
		this.draftTimer = null;
		this.draftBuffer = "";
		if (this.draft) {
			this.draft = "";
			this.emit({ type: "draft-reset" });
		}
	}

	private flushDraft() {
		if (this.draftTimer) clearTimeout(this.draftTimer);
		this.draftTimer = null;
		if (!this.draftBuffer) return;
		this.draft += this.draftBuffer;
		this.emit({ type: "draft-delta", text: this.draftBuffer });
		this.draftBuffer = "";
		this.touch();
	}

	private updateMeta(patch: Partial<RunMeta>) {
		this.meta = { ...this.meta, ...patch };
		this.emit({ type: "meta", meta: this.meta });
	}

	private setStatus(status: RunStatus) {
		this.touch();
		if (this.status === status) return;
		if (this.status === "closed" || this.status === "error") return;
		this.status = status;
		this.emit({ type: "status", status, error: this.error });
	}

	private touch() {
		this.lastActivity = Date.now();
	}
}
