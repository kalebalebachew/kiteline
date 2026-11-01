import type { Item, ToolResult } from "./types";

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
const RESULT_HEAD = 6000;
const RESULT_TAIL = 1500;
const INPUT_STRING_LIMIT = 16000;

type Block = { type?: string; [key: string]: unknown };

function blocksOf(content: unknown): Block[] {
	if (typeof content === "string") return [{ type: "text", text: content }];
	if (Array.isArray(content)) return content.filter((b): b is Block => !!b && typeof b === "object");
	return [];
}

function stripAnsi(text: string) {
	return text.replace(ANSI, "");
}

function tag(text: string, name: string): string | null {
	const match = text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
	return match ? (match[1] ?? "") : null;
}

/** Keeps the head and tail of long output, which is where errors and summaries live. */
function clip(text: string): { text: string; truncated: boolean } {
	if (text.length <= RESULT_HEAD + RESULT_TAIL) return { text, truncated: false };
	const hidden = text.length - RESULT_HEAD - RESULT_TAIL;
	return {
		text: `${text.slice(0, RESULT_HEAD)}\n\n… ${hidden.toLocaleString("en")} characters hidden …\n\n${text.slice(-RESULT_TAIL)}`,
		truncated: true,
	};
}

/** Shrinks huge string fields (a Write of a whole file) so the phone gets a preview, not the file. */
export function trimInput(value: unknown, depth = 0): unknown {
	if (typeof value === "string") {
		return value.length > INPUT_STRING_LIMIT
			? `${value.slice(0, INPUT_STRING_LIMIT)}\n… (${(value.length - INPUT_STRING_LIMIT).toLocaleString("en")} more characters)`
			: value;
	}
	if (depth > 6 || value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.slice(0, 200).map((v) => trimInput(v, depth + 1));
	const out: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(value)) out[key] = trimInput(v, depth + 1);
	return out;
}

export function toolResultOf(block: Block): ToolResult {
	const parts = blocksOf(block.content);
	let images = 0;
	const texts: string[] = [];
	for (const part of parts) {
		if (part.type === "image") images++;
		else if (typeof part.text === "string") texts.push(part.text);
	}
	const { text, truncated } = clip(stripAnsi(texts.join("\n")));
	return { text, truncated, images, isError: block.is_error === true };
}

export function assistantItems(uuid: string, message: unknown, parent: string | null): Item[] {
	const msg = (message ?? {}) as { content?: unknown; model?: string };
	const items: Item[] = [];
	const synthetic = msg.model === "<synthetic>";
	blocksOf(msg.content).forEach((block, index) => {
		const id = `${uuid}:${index}`;
		if (block.type === "text" && typeof block.text === "string") {
			const text = block.text.trim();
			if (!text || text === "(no content)") return;
			if (synthetic) items.push({ kind: "notice", id, tone: "error", text });
			else items.push({ kind: "text", id, text: block.text, parent });
		} else if (block.type === "thinking" && typeof block.thinking === "string") {
			if (block.thinking.trim()) items.push({ kind: "thinking", id, text: block.thinking, parent });
		} else if (block.type === "tool_use" && typeof block.id === "string") {
			items.push({
				kind: "tool",
				id: block.id,
				name: String(block.name ?? "tool"),
				input: (trimInput(block.input ?? {}) ?? {}) as Record<string, unknown>,
				parent,
			});
		}
	});
	return items;
}

export type UserParts = {
	items: Item[];
	results: { toolUseId: string; result: ToolResult }[];
};

/** Splits a user turn into what the person typed, tool results, and command output. */
export function userParts(uuid: string, message: unknown): UserParts {
	const msg = (message ?? {}) as { content?: unknown };
	const parts: UserParts = { items: [], results: [] };
	const texts: string[] = [];
	let images = 0;

	blocksOf(msg.content).forEach((block) => {
		if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
			parts.results.push({ toolUseId: block.tool_use_id, result: toolResultOf(block) });
		} else if (block.type === "image") {
			images++;
		} else if (block.type === "text" && typeof block.text === "string") {
			texts.push(block.text);
		}
	});

	const raw = texts
		.join("\n")
		.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
		.trim();
	if (!raw && !images) return parts;

	if (raw.startsWith("[Request interrupted by user")) {
		parts.items.push({ kind: "notice", id: uuid, tone: "warn", text: "Interrupted" });
		return parts;
	}
	if (raw.includes("<local-command-caveat>")) return parts;

	const stdout = tag(raw, "local-command-stdout") ?? tag(raw, "bash-stdout");
	const stderr = tag(raw, "bash-stderr");
	if (stdout !== null || stderr !== null) {
		const text = stripAnsi([stdout, stderr].filter(Boolean).join("\n")).trim();
		if (text) parts.items.push({ kind: "notice", id: uuid, tone: "info", text: clip(text).text });
		return parts;
	}

	const command = tag(raw, "command-name");
	if (command !== null) {
		const args = tag(raw, "command-args")?.trim() ?? "";
		const name = command.trim().startsWith("/") ? command.trim() : `/${command.trim()}`;
		parts.items.push({ kind: "user", id: uuid, text: `${name} ${args}`.trim(), images, command: name });
		return parts;
	}

	const bash = tag(raw, "bash-input");
	if (bash !== null) {
		parts.items.push({ kind: "user", id: uuid, text: `!${bash}`, images, command: "!" });
		return parts;
	}

	if (raw.startsWith("<task-notification>")) {
		const summary = tag(raw, "summary") ?? tag(raw, "status") ?? "Background task update";
		parts.items.push({ kind: "notice", id: uuid, tone: "info", text: summary.trim() });
		return parts;
	}

	parts.items.push({ kind: "user", id: uuid, text: raw, images });
	return parts;
}

type TranscriptMessage = {
	type: "user" | "assistant" | "system";
	uuid: string;
	message: unknown;
	parent_tool_use_id: string | null;
};

/** Flattens a saved transcript into items, with each tool result folded into its call. */
export function transcriptToItems(messages: TranscriptMessage[]): Item[] {
	const items: Item[] = [];
	const tools = new Map<string, Extract<Item, { kind: "tool" }>>();
	for (const m of messages) {
		if (m.type === "assistant") {
			for (const item of assistantItems(m.uuid, m.message, m.parent_tool_use_id)) {
				if (item.kind === "tool") tools.set(item.id, item);
				items.push(item);
			}
		} else if (m.type === "user") {
			const parts = userParts(m.uuid, m.message);
			for (const { toolUseId, result } of parts.results) {
				const tool = tools.get(toolUseId);
				if (tool) tool.result = result;
			}
			items.push(...parts.items);
		}
	}
	return items;
}
