import type { Item } from "@kiteline/api/agent/types";
import {
	BookOpenText,
	Bot,
	ClipboardList,
	FilePen,
	FilePlus2,
	FileText,
	FolderSearch,
	Globe,
	ListChecks,
	type LucideIcon,
	MessageCircleQuestion,
	NotebookPen,
	Plug,
	Search,
	Sparkles,
	SquareTerminal,
	Wrench,
} from "lucide-react";

import { baseName, relativeTo } from "@/lib/format";

import { diffStats } from "../diff-view";

export type Tool = Extract<Item, { kind: "tool" }>;

export type ToolSummary = {
	icon: LucideIcon;
	/** Short verb-ish label: "Ran", "Edited", "Read". */
	verb: string;
	/** The object of the action: a path, a command, a query. */
	target: string;
	/** Right-aligned detail like "+12 −3" or "42 lines". */
	meta?: { text: string; tone?: "add" | "del" | "muted" }[];
	mono?: boolean;
};

const str = (value: unknown) => (typeof value === "string" ? value : "");

function firstLine(text: string, max = 120) {
	const line = text.split("\n").find((l) => l.trim()) ?? "";
	return line.length > max ? `${line.slice(0, max)}…` : line;
}

function lineCount(text: string) {
	return text ? text.replace(/\n$/, "").split("\n").length : 0;
}

export function editPairs(tool: Tool): { before: string; after: string }[] {
	const input = tool.input;
	if (tool.name === "Edit") return [{ before: str(input.old_string), after: str(input.new_string) }];
	if (tool.name === "MultiEdit" && Array.isArray(input.edits)) {
		return input.edits.map((e: { old_string?: unknown; new_string?: unknown }) => ({
			before: str(e.old_string),
			after: str(e.new_string),
		}));
	}
	return [];
}

export function describeTool(tool: Tool, cwd: string | null): ToolSummary {
	const input = tool.input;
	const path = str(input.file_path) || str(input.notebook_path) || str(input.path);
	const rel = path ? relativeTo(path, cwd) : "";

	switch (tool.name) {
		case "Bash":
		case "PowerShell": {
			const command = str(input.command);
			return {
				icon: SquareTerminal,
				verb: str(input.description) ? "" : "Ran",
				target: str(input.description) || firstLine(command),
				mono: !str(input.description),
				meta: input.run_in_background ? [{ text: "background", tone: "muted" }] : undefined,
			};
		}
		case "Read": {
			const offset = typeof input.offset === "number" ? input.offset : null;
			const limit = typeof input.limit === "number" ? input.limit : null;
			const range = offset || limit ? `lines ${offset ?? 1}–${(offset ?? 1) + (limit ?? 0)}` : null;
			return {
				icon: FileText,
				verb: "Read",
				target: rel,
				mono: true,
				meta: range ? [{ text: range, tone: "muted" }] : undefined,
			};
		}
		case "Edit":
		case "MultiEdit": {
			let added = 0;
			let removed = 0;
			for (const pair of editPairs(tool)) {
				const stats = diffStats(pair.before, pair.after);
				added += stats.added;
				removed += stats.removed;
			}
			return {
				icon: FilePen,
				verb: "Edited",
				target: rel,
				mono: true,
				meta: [
					{ text: `+${added}`, tone: "add" },
					{ text: `−${removed}`, tone: "del" },
				],
			};
		}
		case "Write":
			return {
				icon: FilePlus2,
				verb: "Wrote",
				target: rel,
				mono: true,
				meta: [{ text: `+${lineCount(str(input.content))}`, tone: "add" }],
			};
		case "NotebookEdit":
			return { icon: NotebookPen, verb: "Edited notebook", target: rel, mono: true };
		case "Grep":
			return {
				icon: Search,
				verb: "Searched",
				target: `“${str(input.pattern)}”${rel ? ` in ${rel}` : ""}`,
				meta:
					tool.result && !tool.result.isError
						? [{ text: countLabel(tool.result.text), tone: "muted" }]
						: undefined,
			};
		case "Glob":
			return {
				icon: FolderSearch,
				verb: "Found",
				target: str(input.pattern),
				mono: true,
				meta:
					tool.result && !tool.result.isError
						? [{ text: countLabel(tool.result.text), tone: "muted" }]
						: undefined,
			};
		case "WebFetch": {
			let host = str(input.url);
			try {
				host = new URL(host).host;
			} catch {
				// Keep the raw value.
			}
			return { icon: Globe, verb: "Fetched", target: host };
		}
		case "WebSearch":
			return { icon: Globe, verb: "Searched the web for", target: `“${str(input.query)}”` };
		case "TodoWrite":
			return { icon: ListChecks, verb: "Updated", target: "the plan" };
		case "Task":
		case "Agent":
			return {
				icon: Bot,
				verb: str(input.subagent_type) ? `${str(input.subagent_type)} agent` : "Agent",
				target: str(input.description) || firstLine(str(input.prompt), 80),
			};
		case "AskUserQuestion": {
			const questions = Array.isArray(input.questions) ? (input.questions as { question?: string }[]) : [];
			return { icon: MessageCircleQuestion, verb: "Asked", target: questions[0]?.question ?? "a question" };
		}
		case "ExitPlanMode":
			return { icon: ClipboardList, verb: "Proposed", target: "a plan" };
		case "Skill":
			return { icon: Sparkles, verb: "Used skill", target: str(input.skill) || str(input.command) };
		case "ToolSearch":
			return { icon: BookOpenText, verb: "Looked up", target: "tools" };
		case "TaskCreate":
			return { icon: ListChecks, verb: "Added task", target: str(input.subject) };
		case "TaskUpdate": {
			const status = str(input.status).replace("_", " ");
			return {
				icon: ListChecks,
				verb: status === "completed" ? "Finished task" : status ? `Marked task ${status}` : "Updated task",
				target: str(input.subject) || `#${str(input.taskId)}`,
			};
		}
		case "TaskList":
		case "TaskGet":
			return { icon: ListChecks, verb: "Checked", target: "tasks" };
	}

	if (tool.name.startsWith("mcp__")) {
		const [, server = "", name = ""] = tool.name.split("__");
		return { icon: Plug, verb: server.replaceAll("_", " "), target: name.replaceAll("_", " ") };
	}
	return { icon: Wrench, verb: tool.name, target: path ? baseName(path) : "" };
}

function countLabel(text: string) {
	const n = text.trim() ? text.trim().split("\n").length : 0;
	return n === 0 ? "no matches" : `${n} ${n === 1 ? "result" : "results"}`;
}
