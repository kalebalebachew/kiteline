import type { ToolResult } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import { Check, Circle, CircleDot, ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { relativeTo } from "@/lib/format";
import { grammarForPath } from "@/lib/highlight";

import { CodeBlock } from "../code-block";
import { CopyButton } from "../copy-button";
import { DiffView } from "../diff-view";
import { Markdown } from "../markdown";
import { editPairs, type Tool } from "./describe";

const str = (value: unknown) => (typeof value === "string" ? value : "");

function Section({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
	return (
		<div className="border-border bg-surface overflow-hidden rounded-xl border">
			<div className="border-border bg-surface-2/50 flex h-7 items-center justify-between border-b pr-1 pl-3">
				<span className="text-faint text-[0.68rem] font-medium tracking-wide uppercase">{label}</span>
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
				<p className="text-faint px-3 py-2 text-xs">{result.images ? "" : "No output"}</p>
			) : (
				<pre
					className={cn(
						"max-h-80 overflow-auto px-3 py-2.5 font-mono text-[0.74rem] leading-relaxed break-words whitespace-pre-wrap",
						result.isError ? "text-destructive" : "text-muted-foreground",
					)}
				>
					{result.text}
				</pre>
			)}
			{result.images ? (
				<p className="border-border text-faint flex items-center gap-1.5 border-t px-3 py-1.5 text-xs">
					<ImageIcon className="size-3.5" />
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
		<div className="border-border bg-surface rounded-2xl border p-3.5">
			<div className="mb-2.5 flex items-center justify-between">
				<span className="text-[0.8125rem] font-medium">Plan</span>
				<span className="text-faint text-xs tabular-nums">
					{done}/{todos.length} done
				</span>
			</div>
			<div className="bg-surface-3 mb-3 h-1 overflow-hidden rounded-full">
				<div
					className="aurora h-full rounded-full transition-[width] duration-500 ease-out"
					style={{ width: `${todos.length ? (done / todos.length) * 100 : 0}%` }}
				/>
			</div>
			<ul className="space-y-1.5">
				{todos.map((todo, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: todo text can repeat; order is the identity.
					<li key={`${i}-${todo.content}`} className="flex items-start gap-2.5 text-[0.8125rem] leading-snug">
						{todo.status === "completed" ? (
							<span className="bg-success/15 text-success mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full">
								<Check className="size-3" strokeWidth={3} />
							</span>
						) : todo.status === "in_progress" ? (
							<CircleDot className="text-aurora-1 mt-0.5 size-4 shrink-0" />
						) : (
							<Circle className="text-faint mt-0.5 size-4 shrink-0" />
						)}
						<span
							className={cn(
								todo.status === "completed" && "text-faint decoration-faint/50 line-through",
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
							<DiffView before={pair.before} after={pair.after} />
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
							<p className="text-muted-foreground max-h-48 overflow-auto px-3 py-2.5 text-[0.8125rem] leading-relaxed whitespace-pre-wrap">
								{str(input.prompt)}
							</p>
						</Section>
					) : null}
					{children}
					{result ? (
						<Section label="Report">
							<Markdown text={result.text} className="px-3 py-2.5 text-[0.875rem]" />
						</Section>
					) : null}
				</div>
			);
		case "ExitPlanMode":
			return (
				<Section label="Plan">
					<Markdown text={str(input.plan) || result?.text || ""} className="px-3.5 py-3 text-[0.875rem]" />
				</Section>
			);
		case "WebFetch":
			return (
				<div className="space-y-2">
					<Section label="URL" action={<CopyButton text={str(input.url)} label="Copy URL" />}>
						<a
							href={str(input.url)}
							target="_blank"
							rel="noreferrer noopener"
							className="text-aurora-1 block truncate px-3 py-2 font-mono text-xs"
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
	return <p className="text-faint px-1 text-xs">Waiting for a result…</p>;
}
