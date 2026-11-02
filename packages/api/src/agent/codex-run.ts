import { randomUUID } from "node:crypto";

import {
	CodexClient,
	type CodexItem,
	type CodexMessage,
	type CodexModel,
	type CodexThread,
} from "./codex-client";
import { codexEffort, codexInfo, codexItem, codexItems, codexLevel } from "./codex-history";
import { trimInput } from "./normalize";
import type { ImageInput } from "./run";
import type {
	EffortChoice,
	Item,
	PermissionDecision,
	PermissionModeId,
	PermissionRequest,
	RunEvent,
	RunMeta,
	RunSnapshot,
	RunStatus,
	SessionInfo,
} from "./types";

export function codexPolicy(mode: PermissionModeId) {
	if (mode === "auto" || mode === "plan")
		throw new Error("Codex supports Ask, Edits, and Bypass modes in Kiteline.");
	return {
		approvalPolicy: mode === "bypassPermissions" ? "never" : "on-request",
		sandbox:
			mode === "bypassPermissions"
				? "danger-full-access"
				: mode === "acceptEdits"
					? "workspace-write"
					: "read-only",
	};
}

type Pending = {
	rpcId: number | string;
	method: string;
	params: Record<string, unknown>;
	request: PermissionRequest;
};
type Input = { id: string; text: string; images: ImageInput[] };

export class CodexRun {
	sessionId = "";
	readonly startedAt = Date.now();
	lastActivity = Date.now();
	title = "";
	status: RunStatus = "starting";
	error: string | null = null;
	meta: RunMeta;
	private items: Item[] = [];
	private session: SessionInfo | null = null;
	private hasHistory = false;
	private readonly pending = new Map<string, Pending>();
	private readonly queue: Input[] = [];
	private readonly client: CodexClient;
	private models: CodexModel[] = [];
	private defaultModel: string | null = null;
	/** Preserve runtime effort values that the shared UI does not offer, such as minimal. */
	private reasoningEffort: string | null = null;
	private activeTurn: string | null = null;
	private currentInput: string | null = null;
	private dispatching: Promise<void> | null = null;
	private interrupting = false;
	private draft = "";

	constructor(
		readonly cwd: string,
		path: string | null,
		mode: PermissionModeId,
		model: string | null,
		private readonly allowBypass: boolean,
		private readonly emit: (event: RunEvent) => void,
		private readonly onEnd: () => void,
	) {
		this.meta = {
			provider: "codex",
			model,
			permissionMode: mode,
			slashCommands: [],
			claudeCodeVersion: null,
			apiKeySource: null,
			compacting: false,
			effort: null,
			effortLevels: null,
		};
		this.client = new CodexClient(
			path,
			(message) => this.receive(message),
			(error) => this.fail(error),
		);
	}

	async initialize(sessionId?: string, effort?: EffortChoice) {
		try {
			const policy = codexPolicy(this.meta.permissionMode ?? "default");
			const response = await this.client.call<{
				thread: CodexThread;
				model: string;
				reasoningEffort: string | null;
			}>(sessionId ? "thread/resume" : "thread/start", {
				...(sessionId ? { threadId: sessionId } : {}),
				cwd: this.cwd,
				...policy,
				// Approvals must come back to the phone, regardless of local reviewer defaults.
				approvalsReviewer: "user",
				...(this.meta.model ? { model: this.meta.model } : {}),
			});
			this.sessionId = response.thread.id;
			this.session = codexInfo(response.thread);
			this.hasHistory = !!sessionId;
			this.title = response.thread.name || response.thread.preview || "";
			const { config } = await this.client.call<{ config: { model: string | null } }>("config/read", {
				cwd: this.cwd,
			});
			this.defaultModel = config.model;
			this.meta.model = response.model;
			this.reasoningEffort = response.reasoningEffort;
			this.meta.effort = codexLevel(response.reasoningEffort);
			this.models = await this.client.call<{ data: CodexModel[] }>("model/list", {}).then((r) => r.data);
			this.defaultModel ??= this.models.find((entry) => entry.isDefault)?.model ?? response.model;
			this.meta.effortLevels = codexEffort(this.models, response.model).levels;
			if (effort) await this.setEffort(effort);
			this.setStatus("idle");
		} catch (error) {
			this.close();
			throw error;
		}
	}

	info(): SessionInfo | null {
		if (!this.session) return null;
		return { ...this.session, title: this.title || this.session.title, lastModified: this.lastActivity };
	}

	history() {
		// New threads use an in-memory store until their first turn is persisted.
		if (!this.hasHistory) return Promise.resolve([]);
		return codexItems(this.client, this.sessionId);
	}

	async rename(title: string) {
		await this.client.call("thread/name/set", { threadId: this.sessionId, name: title });
		this.title = title;
	}

	get isLive() {
		return this.status !== "closed" && this.status !== "error";
	}
	get pendingCount() {
		return this.pending.size;
	}

	snapshot(): RunSnapshot {
		return {
			sessionId: this.sessionId,
			cwd: this.cwd,
			status: this.status,
			items: this.items,
			draft: this.draft,
			meta: this.meta,
			usage: null,
			error: this.error,
			permissions: [...this.pending.values()].map((entry) => entry.request),
			toolProgress: {},
			startedAt: this.startedAt,
		};
	}

	send(text: string, images: ImageInput[] = []) {
		if (!this.isLive) throw new Error("This session has stopped.");
		const input = { id: randomUUID(), text, images };
		this.queue.push(input);
		this.push({ kind: "user", id: input.id, text, images: images.length });
		if (!this.title && text) this.title = text.slice(0, 120);
		this.setStatus(this.pending.size ? "waiting" : "running");
		this.pump();
	}

	private pump() {
		if (!this.isLive || this.activeTurn !== null || this.dispatching || this.interrupting) return;
		const next = this.queue.shift();
		if (!next) {
			this.setStatus("idle");
			return;
		}
		this.currentInput = next.id;
		if (this.status !== "running") this.setStatus("running");
		this.activeTurn = "";
		const mode = this.meta.permissionMode ?? "default";
		const policy = codexPolicy(mode);
		this.dispatching = this.client
			.call<{ turn: { id: string } }>("turn/start", {
				threadId: this.sessionId,
				clientUserMessageId: next.id,
				input: [
					...(next.text ? [{ type: "text", text: next.text, text_elements: [] }] : []),
					...next.images.map((image) => ({
						type: "image",
						url: `data:${image.mediaType};base64,${image.data}`,
					})),
				],
				model: this.meta.model,
				effort: this.reasoningEffort,
				approvalPolicy: policy.approvalPolicy,
				approvalsReviewer: "user",
				sandboxPolicy:
					mode === "bypassPermissions"
						? { type: "dangerFullAccess" }
						: mode === "acceptEdits"
							? {
									type: "workspaceWrite",
									writableRoots: [this.cwd],
									networkAccess: false,
									excludeTmpdirEnvVar: false,
									excludeSlashTmp: false,
								}
							: { type: "readOnly", networkAccess: false },
			})
			.then(({ turn }) => {
				if (this.activeTurn !== null) this.activeTurn = turn.id;
			})
			.catch((error: unknown) => this.fail(error))
			.finally(() => {
				this.dispatching = null;
				this.pump();
			});
	}

	async interrupt() {
		this.interrupting = true;
		try {
			for (const input of this.queue.splice(0)) {
				const item = this.items.find((item) => item.id === input.id);
				if (item?.kind === "user") this.push({ ...item, cancelled: true });
			}
			await this.dispatching;
			if (this.activeTurn)
				await this.client.call("turn/interrupt", { threadId: this.sessionId, turnId: this.activeTurn });
		} finally {
			this.interrupting = false;
			this.pump();
		}
	}

	async setPermissionMode(mode: PermissionModeId) {
		codexPolicy(mode);
		if (mode === "bypassPermissions" && !this.allowBypass)
			throw new Error("Bypass mode is turned off on this server.");
		// Turn overrides apply to the next turn; never resolve an existing approval implicitly.
		this.meta.permissionMode = mode;
		this.emit({ type: "meta", meta: this.meta });
	}

	async setModel(model: string | null) {
		const next = model ?? this.defaultModel;
		if (!this.models.some((entry) => entry.model === next))
			throw new Error("That model isn't in Codex's model catalog.");
		this.meta.model = next;
		const effort = codexEffort(this.models, next);
		this.meta.effortLevels = effort.levels;
		this.reasoningEffort = this.models.find((entry) => entry.model === next)?.defaultReasoningEffort ?? null;
		this.meta.effort = effort.effort;
		this.emit({ type: "meta", meta: this.meta });
	}

	async setEffort(choice: EffortChoice) {
		if (choice.persist) throw new Error("Codex effort changes in Kiteline apply to this session only.");
		const info = codexEffort(this.models, this.meta.model);
		if (choice.level && !info.levels?.includes(choice.level))
			throw new Error("This Codex model doesn't offer that effort level.");
		this.reasoningEffort =
			choice.level ??
			this.models.find((entry) => entry.model === this.meta.model)?.defaultReasoningEffort ??
			null;
		this.meta.effort = codexLevel(this.reasoningEffort);
		this.emit({ type: "meta", meta: this.meta });
	}

	respond(id: string, decision: PermissionDecision) {
		const pending = this.pending.get(id);
		if (!pending) throw new Error("That request is no longer waiting.");
		if (pending.method === "item/tool/requestUserInput") {
			if (decision.behavior !== "answer" && decision.behavior !== "deny")
				throw new Error("Answer or skip the question.");
			const questions = pending.params.questions as { id: string; question: string }[];
			const answers = Object.fromEntries(
				questions.map((question) => [
					question.id,
					{
						answers: decision.behavior === "answer" ? [decision.answers[question.question] ?? ""] : [],
					},
				]),
			);
			this.client.respond(pending.rpcId, { answers });
		} else {
			if (decision.behavior === "answer") throw new Error("This request needs an approval decision.");
			if (decision.behavior === "allowAlways")
				throw new Error("Always allow isn't supported for this Codex request.");
			this.client.respond(pending.rpcId, {
				decision: decision.behavior === "allow" ? "accept" : decision.interrupt ? "cancel" : "decline",
			});
		}
		this.resolve(id);
	}

	close() {
		if (!this.isLive) return;
		this.client.close();
		this.queue.length = 0;
		for (const id of this.pending.keys()) this.resolve(id);
		this.setStatus("closed");
	}

	private receive(message: CodexMessage) {
		const p = message.params ?? {};
		if (message.id !== undefined && message.method) {
			if (
				p.threadId !== this.sessionId ||
				![
					"item/commandExecution/requestApproval",
					"item/fileChange/requestApproval",
					"item/tool/requestUserInput",
				].includes(message.method)
			) {
				this.client.reject(message.id, `Kiteline doesn't support ${message.method}.`);
				return;
			}
			const id = `codex:${message.id}`;
			const question = message.method === "item/tool/requestUserInput";
			const toolName = question
				? "AskUserQuestion"
				: message.method.includes("commandExecution")
					? "Bash"
					: "CodexFileChange";
			const existing = this.items.find((item) => item.id === p.itemId);
			const input = question
				? {
						questions: (p.questions as Record<string, unknown>[]).map((q) => ({
							...q,
							options: q.options ?? [],
						})),
					}
				: toolName === "Bash"
					? { command: p.command, cwd: p.cwd }
					: existing?.kind === "tool"
						? existing.input
						: { path: p.grantRoot };
			const request: PermissionRequest = {
				id,
				toolUseId: typeof p.itemId === "string" ? p.itemId : undefined,
				toolName,
				input: trimInput(input) as Record<string, unknown>,
				title: null,
				description: typeof p.reason === "string" ? p.reason : null,
				displayName: null,
				decisionReason: null,
				blockedPath: typeof p.grantRoot === "string" ? p.grantRoot : null,
				canAlwaysAllow: false,
				alwaysAllow: null,
				defaultToNo: true,
				fromSubagent: false,
				createdAt: Date.now(),
			};
			this.pending.set(id, { rpcId: message.id, method: message.method, params: p, request });
			this.emit({ type: "permission", request });
			this.setStatus("waiting");
			return;
		}
		if (p.threadId !== this.sessionId) return;
		switch (message.method) {
			case "item/agentMessage/delta":
				this.draft += String(p.delta ?? "");
				this.emit({ type: "draft-delta", text: String(p.delta ?? "") });
				break;
			case "item/started":
			case "item/completed": {
				const raw = p.item as CodexItem;
				const item = codexItem(raw, message.method === "item/completed");
				if (!item) break;
				if (raw.type === "userMessage" && this.currentInput) {
					this.items = this.items.filter((item) => item.id !== this.currentInput);
					this.currentInput = null;
					this.emit({ type: "snapshot", run: this.snapshot() });
				}
				if (raw.type === "agentMessage" && message.method === "item/completed") this.resetDraft();
				this.push(item);
				break;
			}
			case "serverRequest/resolved":
				this.resolve(`codex:${p.requestId}`);
				break;
			case "turn/completed": {
				this.hasHistory = true;
				const turn = p.turn as { status: string; error?: { message: string } | null };
				this.activeTurn = null;
				this.resetDraft();
				for (const id of this.pending.keys()) this.resolve(id);
				if (turn.status === "failed")
					this.push({
						kind: "notice",
						id: randomUUID(),
						tone: "error",
						text: turn.error?.message ?? "Codex couldn't complete this turn.",
					});
				if (turn.status === "interrupted")
					this.push({ kind: "notice", id: randomUUID(), tone: "warn", text: "Interrupted" });
				this.pump();
				break;
			}
		}
	}

	private resolve(id: string) {
		if (!this.pending.delete(id)) return;
		this.emit({ type: "permission-resolved", id });
		if (!this.pending.size && this.isLive) this.setStatus(this.activeTurn !== null ? "running" : "idle");
	}

	private resetDraft() {
		this.draft = "";
		this.emit({ type: "draft-reset" });
	}

	private push(item: Item) {
		const index = this.items.findIndex((entry) => entry.id === item.id);
		if (index < 0) this.items.push(item);
		else this.items[index] = item;
		this.lastActivity = Date.now();
		this.emit({ type: "item", item });
	}

	private setStatus(status: RunStatus) {
		this.status = status;
		this.lastActivity = Date.now();
		this.emit({ type: "status", status, error: this.error });
		this.onEnd();
	}

	private fail(error: unknown) {
		if (!this.isLive) return;
		this.error = error instanceof Error ? error.message : String(error);
		this.client.close();
		this.queue.length = 0;
		for (const id of this.pending.keys()) this.resolve(id);
		this.setStatus("error");
	}
}
