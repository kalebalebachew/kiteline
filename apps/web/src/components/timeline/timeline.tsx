import type { Item } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import {
	BrainIcon,
	CaretRightIcon,
	ImageSquareIcon,
	InfoIcon,
	ShieldWarningIcon,
	WarningCircleIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { memo, type ReactNode, useMemo, useRef, useState } from "react";

import { formatDuration } from "@/lib/format";

import { KiteMark } from "../brand";
import { Markdown } from "../markdown";
import { describeTool, type Tool } from "../tools/describe";
import { TodoList, ToolBody } from "../tools/tool-body";

export type TimelineContext = {
	cwd: string | null;
	/** True while the run is executing: tools without results show as in progress. */
	working: boolean;
	pendingIds: Set<string>;
	/** Items from the live process. Only these can still be running; older result-less ones were cut off. */
	liveIds: Set<string>;
	toolProgress: Record<string, number>;
	onOpenPermission: (id: string) => void;
};

type Step = Tool | Extract<Item, { kind: "thinking" }>;
type Block =
	| { kind: "item"; item: Item }
	| { kind: "steps"; id: string; steps: Step[] }
	| { kind: "todo"; tool: Tool };

function toBlocks(items: Item[]): Block[] {
	const blocks: Block[] = [];
	for (const item of items) {
		if (item.kind === "tool" && item.name === "TodoWrite") {
			blocks.push({ kind: "todo", tool: item });
		} else if (item.kind === "tool" || item.kind === "thinking") {
			const last = blocks[blocks.length - 1];
			if (last?.kind === "steps") last.steps.push(item);
			else blocks.push({ kind: "steps", id: item.id, steps: [item] });
		} else {
			blocks.push({ kind: "item", item });
		}
	}
	return blocks;
}

function UserBubble({ item }: { item: Extract<Item, { kind: "user" }> }) {
	return (
		<div className="flex justify-end pl-12">
			<div
				className={cn(
					"bg-surface-2 max-w-full rounded-[18px] rounded-br-[6px] px-3.5 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap",
					item.command && "font-mono text-[13px]",
				)}
			>
				{item.images ? (
					<span className="text-muted-foreground mb-1.5 flex items-center gap-1.5 font-sans text-[13px]">
						<ImageSquareIcon weight="fill" className="text-icon size-3.5" />
						{item.images} {item.images === 1 ? "image" : "images"}
					</span>
				) : null}
				{item.text}
			</div>
		</div>
	);
}

function Notice({ item }: { item: Extract<Item, { kind: "notice" }> }) {
	const [open, setOpen] = useState(false);
	const Icon = item.tone === "error" ? WarningCircleIcon : item.tone === "warn" ? WarningIcon : InfoIcon;
	const tone =
		item.tone === "error" ? "text-destructive" : item.tone === "warn" ? "text-warning" : "text-icon";
	const long = item.text.length > 140 || item.text.includes("\n");
	if (long) {
		return (
			<div className="bg-surface-2 rounded-xl">
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					className="text-muted-foreground flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px]"
				>
					<Icon weight="fill" className={cn("size-3.5 flex-none", tone)} />
					<span className="truncate">{item.text.split("\n")[0]}</span>
					<CaretRightIcon
						weight="bold"
						className={cn("text-faint ml-auto size-3 flex-none transition-transform", open && "rotate-90")}
					/>
				</button>
				{open ? (
					<pre className="text-muted-foreground max-h-72 overflow-auto px-3.5 pb-3 font-mono text-[12px] whitespace-pre-wrap">
						{item.text}
					</pre>
				) : null}
			</div>
		);
	}
	return (
		<div className="flex justify-center">
			<span
				className={cn(
					"text-faint inline-flex max-w-full items-center gap-1.5 text-[13px]",
					item.tone === "error" && "bg-destructive-soft text-destructive rounded-full px-3 py-1",
					item.tone === "warn" && "text-warning",
				)}
			>
				<Icon weight="fill" className={cn("size-3.5 flex-none", tone)} />
				<span className="truncate">{item.text}</span>
			</span>
		</div>
	);
}

function StepIcon({ tool, ctx }: { tool: Tool; ctx: TimelineContext }) {
	const Icon = describeTool(tool, ctx.cwd).icon;
	const pending = ctx.pendingIds.has(tool.id);
	const running = !tool.result && ctx.working && !pending && ctx.liveIds.has(tool.id);
	const failed = tool.result?.isError;
	return (
		<span
			className={cn(
				"bg-surface-2 text-icon ring-background relative z-1 inline-flex size-6 flex-none items-center justify-center rounded-full ring-4",
				failed && "bg-destructive-soft text-destructive",
				pending && "bg-warning-soft text-warning",
			)}
		>
			{running ? (
				<span className="border-t-brand absolute inset-0 animate-spin rounded-full border-[1.5px] border-transparent [animation-duration:0.8s]" />
			) : null}
			{pending ? (
				<ShieldWarningIcon weight="fill" className="size-3.5" />
			) : (
				<Icon weight="fill" className="size-3.5" />
			)}
		</span>
	);
}

const ToolStep = memo(function ToolStep({
	tool,
	ctx,
	nested,
}: {
	tool: Tool;
	ctx: TimelineContext;
	nested?: Item[];
}) {
	const [open, setOpen] = useState(false);
	const summary = describeTool(tool, ctx.cwd);
	const pending = ctx.pendingIds.has(tool.id);
	const seconds = ctx.toolProgress[tool.id];

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => (pending ? ctx.onOpenPermission(tool.id) : setOpen((v) => !v))}
				aria-expanded={open}
				className="group/step flex min-h-10 w-full items-center gap-3 py-1.5 text-left"
			>
				<StepIcon tool={tool} ctx={ctx} />
				<span className="text-muted-foreground min-w-0 flex-1 truncate text-[14px]">
					{summary.verb ? <span className="text-foreground">{summary.verb} </span> : null}
					<span className={cn(summary.mono && "font-mono text-[12.5px]", !summary.verb && "text-foreground")}>
						{summary.target}
					</span>
				</span>
				{pending ? (
					<span className="bg-warning-soft text-warning flex-none rounded-full px-2 py-0.5 text-[12px] font-medium">
						Review
					</span>
				) : null}
				{!pending && seconds && !tool.result ? (
					<span className="text-faint flex-none text-[12px] tabular-nums">
						{formatDuration(seconds * 1000)}
					</span>
				) : null}
				{summary.meta?.map((meta) => (
					<span
						key={meta.text}
						className={cn(
							"flex-none text-[12px] tabular-nums",
							meta.tone === "add" && "text-success",
							meta.tone === "del" && "text-destructive",
							meta.tone === "muted" && "text-faint",
						)}
					>
						{meta.text}
					</span>
				))}
				{nested?.length ? (
					<span className="text-faint flex-none text-[12px] tabular-nums">{nested.length} steps</span>
				) : null}
				<CaretRightIcon
					weight="bold"
					className={cn(
						"text-faint size-3 flex-none transition-transform duration-150",
						open && "rotate-90",
						pending && "hidden",
					)}
				/>
			</button>
			{open ? (
				<div className="animate-in fade-in-0 slide-in-from-top-1 pt-0.5 pb-3 pl-9 duration-200">
					<ToolBody tool={tool} cwd={ctx.cwd}>
						{nested?.length ? <NestedActivity items={nested} ctx={ctx} /> : null}
					</ToolBody>
				</div>
			) : null}
		</div>
	);
});

function ThinkingStep({ item }: { item: Extract<Item, { kind: "thinking" }> }) {
	const [open, setOpen] = useState(false);
	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex min-h-10 w-full items-center gap-3 py-1.5 text-left"
			>
				<span className="bg-surface-2 text-icon ring-background relative z-1 inline-flex size-6 flex-none items-center justify-center rounded-full ring-4">
					<BrainIcon weight="fill" className="size-3.5" />
				</span>
				<span className="text-faint min-w-0 flex-1 truncate text-[14px]">{item.text.split("\n")[0]}</span>
			</button>
			{open ? <Markdown text={item.text} className="text-muted-foreground pb-3 pl-9 text-[14px]" /> : null}
		</div>
	);
}

function NestedActivity({ items, ctx }: { items: Item[]; ctx: TimelineContext }) {
	return (
		<div className="bg-surface-2 rounded-xl px-3 py-1">
			{items.map((item) =>
				item.kind === "tool" ? (
					<ToolStep key={item.id} tool={item} ctx={ctx} />
				) : item.kind === "text" ? (
					<p key={item.id} className="text-muted-foreground py-1.5 pl-9 text-[13px] leading-relaxed">
						{item.text.length > 400 ? `${item.text.slice(0, 400)}…` : item.text}
					</p>
				) : null,
			)}
		</div>
	);
}

function Steps({
	steps,
	ctx,
	nestedBy,
	defaultOpen,
}: {
	steps: Step[];
	ctx: TimelineContext;
	nestedBy: Map<string, Item[]>;
	defaultOpen: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const tools = steps.filter((s): s is Tool => s.kind === "tool");
	const needsYou = tools.some((t) => ctx.pendingIds.has(t.id));
	const failed = tools.filter((t) => t.result?.isError).length;

	if (!open && !needsYou) {
		const icons = [...new Map(tools.map((t) => [describeTool(t, ctx.cwd).icon, t.id])).entries()].slice(0, 4);
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="text-muted-foreground flex min-h-10 w-full items-center gap-3 py-1.5 text-left text-[14px]"
			>
				<span className="flex -space-x-1.5">
					{icons.map(([Icon, id]) => (
						<span
							key={id}
							className="bg-surface-2 text-icon ring-background inline-flex size-6 items-center justify-center rounded-full ring-2"
						>
							<Icon weight="fill" className="size-3.5" />
						</span>
					))}
				</span>
				<span>
					{tools.length} {tools.length === 1 ? "step" : "steps"}
					{failed ? <span className="text-destructive"> · {failed} failed</span> : null}
				</span>
				<CaretRightIcon weight="bold" className="text-faint size-3" />
			</button>
		);
	}

	return (
		<div className="before:bg-border-strong relative before:absolute before:top-5 before:bottom-5 before:left-[11.5px] before:w-px">
			{steps.map((step) =>
				step.kind === "tool" ? (
					<ToolStep key={step.id} tool={step} ctx={ctx} nested={nestedBy.get(step.id)} />
				) : (
					<ThinkingStep key={step.id} item={step} />
				),
			)}
		</div>
	);
}

export function WorkingLine({ label = "Thinking" }: { label?: string }) {
	return (
		<div className="flex items-center gap-3 py-1">
			<KiteMark live className="text-icon size-6" />
			<span className="shimmer-text text-[14px] font-medium">{label}…</span>
		</div>
	);
}

export function Timeline({
	items,
	draft,
	ctx,
	footer,
}: {
	items: Item[];
	draft: string;
	ctx: TimelineContext;
	footer?: ReactNode;
}) {
	const { blocks, nestedBy } = useMemo(() => {
		const nestedBy = new Map<string, Item[]>();
		const top: Item[] = [];
		for (const item of items) {
			const parent = "parent" in item ? item.parent : null;
			if (parent) {
				const list = nestedBy.get(parent) ?? [];
				list.push(item);
				nestedBy.set(parent, list);
			} else top.push(item);
		}
		return { blocks: toBlocks(top), nestedBy };
	}, [items]);

	// Only what arrives after the first paint animates in.
	const seen = useRef<Set<string> | null>(null);
	if (seen.current === null && blocks.length) seen.current = new Set(blocks.map(blockKey));

	return (
		<div className="flex flex-col gap-5">
			{blocks.map((block, index) => {
				const key = blockKey(block);
				const fresh = seen.current && !seen.current.has(key);
				const isLast = index === blocks.length - 1;
				return (
					<div
						key={key}
						className={cn(
							"min-w-0 [contain-intrinsic-size:auto_64px] [content-visibility:auto]",
							fresh && "animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out",
						)}
					>
						{block.kind === "todo" ? (
							<TodoList tool={block.tool} />
						) : block.kind === "steps" ? (
							<Steps
								steps={block.steps}
								ctx={ctx}
								nestedBy={nestedBy}
								defaultOpen={(isLast && ctx.working) || block.steps.length <= 3}
							/>
						) : block.item.kind === "user" ? (
							<UserBubble item={block.item} />
						) : block.item.kind === "text" ? (
							<Markdown text={block.item.text} />
						) : block.item.kind === "notice" ? (
							<Notice item={block.item} />
						) : null}
					</div>
				);
			})}
			{draft ? (
				<div className="min-w-0">
					<Markdown text={draft} />
					<span className="animate-caret bg-brand mt-1 inline-block h-4 w-[2px] rounded-full align-middle" />
				</div>
			) : null}
			{footer}
		</div>
	);
}

function blockKey(block: Block) {
	return block.kind === "item" ? block.item.id : block.kind === "todo" ? block.tool.id : `steps:${block.id}`;
}
