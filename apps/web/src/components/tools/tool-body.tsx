import type { ToolResult } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import { CheckCircleIcon, CircleDashedIcon, CircleIcon, ImageSquareIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { relativeTo } from "@/lib/format";
import { grammarForPath } from "@/lib/highlight";

import { CodeBlock } from "../code-block";
import { CopyButton } from "../copy-button";
import { DiffView } from "../diff-view";
import { Markdown } from "../markdown";
import { editPairs, type Tool } from "./describe";

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** A quiet well: a fill, not a bordered box inside a bordered box. */
function Section({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
	return (
		<div className="bg-surface-2 overflow-hidden rounded-xl">
			<div className="flex h-8 items-center justify-between pr-1 pl-3.5">
				<span className="text-faint truncate text-[12px]">{label}</span>
				{action}
			</div>
			{children}
		</div>
	);
}

export function Output({ result, label = "Output" }: { result: ToolResult; label?: string }) {
	const empty = !result.text.trim();
	return (
		<Section
			label={result.isError ? "Error" : label}
			action={empty ? undefined : <CopyButton text={result.text} label="Copy output" />}
		>
			{empty ? (
				<p className="text-faint px-3.5 pb-3 text-[13px]">{result.images ? "" : "No output"}</p>
			) : (
				<pre
					className={cn(
						"max-h-80 overflow-auto px-3.5 pt-0.5 pb-3 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap",
						result.isError ? "text-destructive" : "text-muted-foreground",
					)}
				>
					{result.text}
				</pre>
			)}
			{result.images ? (
				<p className="text-faint flex items-center gap-1.5 px-3.5 pb-3 text-[13px]">
					<ImageSquareIcon weight="fill" className="size-3.5" />
					{result.images} {result.images === 1 ? "image" : "images"}
				</p>
			) : null}
		</Section>
	);
}

export function TodoList({ tool }: { tool: Tool }) {
	const todos = Array.isArray(tool.input.todos)
		? (tool.input.todos as { content?: string; status?: string; activeForm?: string }[])
		: [];
	const done = todos.filter((t) => t.status === "completed").length;
	return (
		<div className="bg-surface shadow-card rounded-2xl p-4">
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<span className="text-[14px] font-semibold">Plan</span>
				<span className="text-faint text-[13px] tabular-nums">
					{done} of {todos.length}
				</span>
			</div>
			<ul className="space-y-2">
				{todos.map((todo, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: todo text can repeat; order is the identity.
					<li key={`${i}-${todo.content}`} className="flex items-start gap-2.5 text-[14px] leading-snug">
						{todo.status === "completed" ? (
							<CheckCircleIcon weight="fill" className="text-success mt-px size-4 flex-none" />
						) : todo.status === "in_progress" ? (
							<CircleDashedIcon
								weight="bold"
								className="text-brand mt-px size-4 flex-none animate-spin [animation-duration:3s]"
							/>
						) : (
							<CircleIcon className="text-faint mt-px size-4 flex-none" />
						)}
						<span
							className={cn(
								todo.status === "completed" && "text-faint decoration-faint/60 line-through",
								todo.status === "in_progress" && "font-medium",
							)}
						>
							{todo.status === "in_progress" ? todo.activeForm || todo.content : todo.content}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

/** The expanded view of a tool call. `children` slots in nested sub-agent activity. */
export function ToolBody({ tool, cwd, children }: { tool: Tool; cwd: string | null; children?: ReactNode }) {
	const input = tool.input;
	const result = tool.result;
	const path = str(input.file_path);

	switch (tool.name) {
		case "Bash":
		case "PowerShell":
			return (
				<div className="space-y-2">
					<Section label="Command" action={<CopyButton text={str(input.command)} label="Copy command" />}>
						<CodeBlock code={str(input.command)} lang="bash" bare maxHeight="14rem" />
					</Section>
					{result ? <Output result={result} /> : null}
				</div>
			);
		case "Edit":
		case "MultiEdit":
			return (
				<div className="space-y-2">
					{editPairs(tool).map((pair, i) => (
						<Section
							// biome-ignore lint/suspicious/noArrayIndexKey: edits are a fixed, ordered list.
							key={`${i}-${pair.before.length}`}
							label={i === 0 ? relativeTo(path, cwd) : `Edit ${i + 1}`}
						>
							<DiffView before={pair.before} after={pair.after} className="pb-2" />
						</Section>
					))}
					{result?.isError ? <Output result={result} /> : null}
				</div>
			);
		case "Write":
			return (
				<div className="space-y-2">
					<CodeBlock
						code={str(input.content)}
						lang={grammarForPath(path)}
						label={relativeTo(path, cwd)}
						maxHeight="22rem"
					/>
					{result?.isError ? <Output result={result} /> : null}
				</div>
			);
		case "Task":
		case "Agent":
			return (
				<div className="space-y-2">
					{str(input.prompt) ? (
						<Section label="Brief">
							<p className="text-muted-foreground max-h-48 overflow-auto px-3.5 pb-3 text-[13px] leading-relaxed whitespace-pre-wrap">
								{str(input.prompt)}
							</p>
						</Section>
					) : null}
					{children}
					{result ? (
						<Section label="Report">
							<Markdown text={result.text} className="px-3.5 pb-3 text-[14px]" />
						</Section>
					) : null}
				</div>
			);
		case "ExitPlanMode":
			return (
				<div className="bg-surface-2 rounded-xl px-4 py-3.5">
					<Markdown text={str(input.plan) || result?.text || ""} className="text-[14px]" />
				</div>
			);
		case "WebFetch":
			return (
				<div className="space-y-2">
					<Section label="Link" action={<CopyButton text={str(input.url)} label="Copy link" />}>
						<a
							href={str(input.url)}
							target="_blank"
							rel="noreferrer noopener"
							className="text-brand-text block truncate px-3.5 pb-3 text-[13px]"
						>
							{str(input.url)}
						</a>
					</Section>
					{result ? <Output result={result} label="Answer" /> : null}
				</div>
			);
		case "Read":
		case "Grep":
		case "Glob":
		case "WebSearch":
			return result ? <Output result={result} label="Result" /> : <PendingNote />;
	}

	return (
		<div className="space-y-2">
			<Section label="Input">
				<CodeBlock code={JSON.stringify(input, null, 2)} lang="json" bare maxHeight="16rem" />
			</Section>
			{result ? <Output result={result} label="Result" /> : null}
		</div>
	);
}

function PendingNote() {
	return <p className="text-faint text-[13px]">Waiting for a result…</p>;
}
