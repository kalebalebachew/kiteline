import { CodexClient, type CodexItem, type CodexModel, type CodexThread } from "./codex-client";
import { toolResultOf, trimInput } from "./normalize";
import { EFFORT_LEVELS, type EffortInfo, type EffortLevel, type Item, type SessionInfo } from "./types";

export function codexInfo(thread: CodexThread): SessionInfo {
	return {
		provider: "codex",
		sessionId: thread.id,
		title: thread.name || thread.preview || "Untitled session",
		firstPrompt: thread.preview || null,
		cwd: thread.cwd,
		gitBranch: thread.gitInfo?.branch ?? null,
		lastModified: thread.updatedAt * 1000,
		createdAt: thread.createdAt * 1000,
		sizeBytes: null,
	};
}

/** Both saved and live items use Codex's item ids, so reconnects don't duplicate the transcript. */
export function codexItem(item: CodexItem, completed = true): Item | null {
	const base = { id: item.id, parent: null };
	switch (item.type) {
		case "userMessage":
			return {
				kind: "user",
				id: item.id,
				text: (item.content ?? [])
					.filter((part) => part.type === "text")
					.map((part) => part.text ?? "")
					.join("\n"),
				images: (item.content ?? []).filter((part) => part.type === "image" || part.type === "localImage")
					.length,
			};
		case "agentMessage":
		case "plan":
			return { ...base, kind: "text", text: item.text ?? "" };
		case "reasoning":
			return { ...base, kind: "thinking", text: (item.summary ?? []).join("\n") };
		case "commandExecution":
			return {
				...base,
				kind: "tool",
				name: "Bash",
				input: { command: item.command ?? "", cwd: item.cwd },
				...(completed
					? {
							result: toolResultOf({
								content: item.aggregatedOutput ?? "",
								is_error: item.status === "failed" || (item.exitCode != null && item.exitCode !== 0),
							}),
						}
					: {}),
			};
		case "fileChange":
			return {
				...base,
				kind: "tool",
				name: "CodexFileChange",
				input: trimInput({ changes: item.changes ?? [] }) as Record<string, unknown>,
				...(completed
					? {
							result: toolResultOf({
								content: item.status ?? "completed",
								is_error: item.status === "failed" || item.status === "declined",
							}),
						}
					: {}),
			};
		case "mcpToolCall":
			return {
				...base,
				kind: "tool",
				name: `mcp__${item.server}__${item.tool}`,
				input: trimInput(item.arguments ?? {}) as Record<string, unknown>,
				...(completed
					? {
							result: toolResultOf({
								content: JSON.stringify(item.error ?? item.result ?? ""),
								is_error: !!item.error,
							}),
						}
					: {}),
			};
		default:
			return null;
	}
}

export function codexLevel(value: string | null | undefined): EffortLevel | null {
	return EFFORT_LEVELS.includes(value as EffortLevel) ? (value as EffortLevel) : null;
}

export function codexEffort(models: CodexModel[], model: string | null): EffortInfo {
	const entry = model
		? models.find((entry) => entry.model === model)
		: models.find((entry) => entry.isDefault);
	const level = codexLevel(entry?.defaultReasoningEffort);
	return {
		model: model ?? entry?.model ?? null,
		levels: entry
			? entry.supportedReasoningEfforts.flatMap((option) => {
					const effort = codexLevel(option.reasoningEffort);
					return effort ? [effort] : [];
				})
			: null,
		effort: level,
		modelDefault: level,
	};
}

export async function codexItems(client: CodexClient, sessionId: string): Promise<Item[]> {
	const { thread: metadata } = await client.call<{ thread: CodexThread }>("thread/read", {
		threadId: sessionId,
	});
	if (metadata.historyMode !== "paginated") {
		const { thread } = await client.call<{ thread: CodexThread }>("thread/read", {
			threadId: sessionId,
			includeTurns: true,
		});
		return thread.turns.flatMap((turn) =>
			turn.items.flatMap((raw) => {
				const item = codexItem(raw);
				return item ? [item] : [];
			}),
		);
	}
	const items: Item[] = [];
	let cursor: string | null = null;
	do {
		const page: { data: { item: CodexItem }[]; nextCursor: string | null } = await client.call(
			"thread/items/list",
			{
				threadId: sessionId,
				cursor,
				limit: 100,
				sortDirection: "asc",
			},
		);
		for (const entry of page.data) {
			const item = codexItem(entry.item);
			if (item) items.push(item);
		}
		cursor = page.nextCursor;
	} while (cursor);
	return items;
}

/** Discovery stays lazy: Claude-only installations don't need the Codex executable. */
export class CodexHistory {
	private connection: CodexClient | null = null;

	constructor(private readonly path: string | null) {}

	client() {
		this.connection ??= new CodexClient(this.path, undefined, () => {
			this.connection = null;
		});
		return this.connection;
	}

	async list(options: { limit: number; cwd?: string }) {
		const sessions: SessionInfo[] = [];
		let cursor: string | null = null;
		do {
			const page: { data: CodexThread[]; nextCursor: string | null } = await this.client().call(
				"thread/list",
				{
					limit: Math.min(100, options.limit - sessions.length),
					cursor,
					sortKey: "updated_at",
					modelProviders: [],
					...(options.cwd ? { cwd: options.cwd } : {}),
				},
			);
			sessions.push(...page.data.map(codexInfo));
			cursor = page.nextCursor;
		} while (cursor && sessions.length < options.limit);
		return sessions;
	}

	async read(sessionId: string, includeTurns = false) {
		const result = await this.client().call<{ thread: CodexThread }>("thread/read", {
			threadId: sessionId,
			includeTurns,
		});
		return result.thread;
	}

	items(sessionId: string): Promise<Item[]> {
		return codexItems(this.client(), sessionId);
	}

	async startingPoint(cwd: string | null, model: string | null): Promise<EffortInfo> {
		const [models, { config }] = await Promise.all([
			this.models(),
			this.client().call<{ config: { model: string | null; model_reasoning_effort: string | null } }>(
				"config/read",
				{ cwd },
			),
		]);
		const info = codexEffort(models, model ?? config.model);
		return { ...info, effort: codexLevel(config.model_reasoning_effort) ?? info.effort };
	}

	async models() {
		const models: CodexModel[] = [];
		let cursor: string | null = null;
		do {
			const page: { data: CodexModel[]; nextCursor: string | null } = await this.client().call("model/list", {
				cursor,
			});
			models.push(...page.data.filter((entry) => !entry.hidden));
			cursor = page.nextCursor;
		} while (cursor);
		return models;
	}

	close() {
		this.connection?.close();
		this.connection = null;
	}
}
