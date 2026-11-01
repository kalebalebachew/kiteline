import type { PermissionDecision, PermissionRequest } from "@kiteline/api/agent/types";
import { Button } from "@kiteline/ui/components/button";
import { Sheet } from "@kiteline/ui/components/sheet";
import { cn } from "@kiteline/ui/lib/utils";
import {
	ArrowLeftIcon,
	CheckIcon,
	type Icon,
	ShieldCheckIcon,
	ShieldWarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { baseName } from "@/lib/format";

import { describeTool, type Tool } from "./tools/describe";
import { ToolBody } from "./tools/tool-body";

type Question = {
	question: string;
	header?: string;
	multiSelect?: boolean;
	options: { label: string; description?: string; preview?: string }[];
};

type Props = {
	request: PermissionRequest | null;
	queued: number;
	cwd: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDecide: (id: string, decision: PermissionDecision) => Promise<void>;
};

function asTool(request: PermissionRequest): Tool {
	return { kind: "tool", id: request.id, name: request.toolName, input: request.input, parent: null };
}

/** Who is asking, about which project, and how many more are waiting. */
function Asker({
	icon: ToolIcon,
	label,
	cwd,
	queued,
}: {
	icon: Icon;
	label: string;
	cwd: string | null;
	queued: number;
}) {
	return (
		<div className="flex items-center gap-3">
			<span className="bg-warning-soft text-warning inline-flex size-10 flex-none items-center justify-center rounded-xl">
				<ToolIcon weight="fill" className="size-5" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="text-warning block text-[13px] leading-tight font-medium">{label}</span>
				{cwd ? (
					<span className="text-faint mt-0.5 block truncate text-[13px] leading-tight">
						in {baseName(cwd)}
					</span>
				) : null}
			</span>
			{queued > 1 ? (
				<span className="bg-surface-2 text-muted-foreground flex-none rounded-full px-2.5 py-1 text-[12px] font-medium tabular-nums">
					1 of {queued}
				</span>
			) : null}
		</div>
	);
}

/** Sets the `backticked` parts of a sentence as code: "Don't ask again for `pnpm test` commands". */
function WithCode({ text }: { text: string }) {
	return text.split(/`([^`]+)`/).map((part, i) =>
		i % 2 ? (
			<code key={part} className="text-foreground font-mono text-[12.5px]">
				{part}
			</code>
		) : (
			part
		),
	);
}

/** Stands in for a button's label while its decision is on its way. */
function Sending() {
	return <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

const fieldClass =
	"w-full rounded-xl bg-surface-2 px-3.5 text-[16px] outline-none placeholder:text-faint focus-visible:bg-surface-3 focus-visible:outline-none";

export function PermissionSheet({ request, queued, cwd, open, onOpenChange, onDecide }: Props) {
	const [busy, setBusy] = useState<string | null>(null);
	const [feedback, setFeedback] = useState("");
	const [denying, setDenying] = useState(false);
	const [answers, setAnswers] = useState<Record<string, string[]>>({});
	const [other, setOther] = useState<Record<string, string>>({});

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset per request
	useEffect(() => {
		setBusy(null);
		setFeedback("");
		setDenying(false);
		setAnswers({});
		setOther({});
	}, [request?.id]);

	if (!request) return null;

	const decide = async (key: string, decision: PermissionDecision) => {
		setBusy(key);
		try {
			await onDecide(request.id, decision);
		} finally {
			setBusy(null);
		}
	};

	const tool = asTool(request);
	const summary = describeTool(tool, cwd);
	const eyebrow = (
		<Asker
			icon={summary.icon}
			label={request.fromSubagent ? "A sub-agent needs you" : "Claude Code needs you"}
			cwd={cwd}
			queued={queued}
		/>
	);

	if (request.toolName === "AskUserQuestion") {
		const questions = (Array.isArray(request.input.questions) ? request.input.questions : []) as Question[];
		const answered = questions.every(
			(q) => (answers[q.question]?.length ?? 0) > 0 || other[q.question]?.trim(),
		);
		const toggle = (q: Question, label: string) =>
			setAnswers((current) => {
				const picked = current[q.question] ?? [];
				const next = q.multiSelect
					? picked.includes(label)
						? picked.filter((l) => l !== label)
						: [...picked, label]
					: [label];
				return { ...current, [q.question]: next };
			});
		return (
			<Sheet
				open={open}
				onOpenChange={onOpenChange}
				eyebrow={eyebrow}
				titleClassName="mt-1 text-[20px] leading-tight tracking-[-0.02em]"
				title={questions.length > 1 ? "A few questions" : (questions[0]?.question ?? "A question")}
				footer={
					<div className="flex gap-2">
						<Button
							variant="secondary"
							size="lg"
							className="flex-1"
							disabled={!!busy}
							onClick={() =>
								decide("skip", {
									behavior: "deny",
									message: "The user skipped the question. Use your best judgement.",
								})
							}
						>
							Skip
						</Button>
						<Button
							size="lg"
							className="flex-[2]"
							disabled={!answered || !!busy}
							onClick={() =>
								decide("answer", {
									behavior: "answer",
									answers: Object.fromEntries(
										questions.map((q) => {
											const custom = other[q.question]?.trim();
											const picked = answers[q.question] ?? [];
											return [q.question, [...picked, ...(custom ? [custom] : [])].join(", ")];
										}),
									),
								})
							}
						>
							{busy === "answer" ? <Sending /> : `Send answer${questions.length > 1 ? "s" : ""}`}
						</Button>
					</div>
				}
			>
				<div className="space-y-5">
					{questions.map((q) => (
						<fieldset key={q.question} className="space-y-2">
							{questions.length > 1 ? (
								<legend className="mb-2 text-[14px] font-medium">
									{q.header ? <span className="text-faint mr-1.5">{q.header} ·</span> : null}
									{q.question}
								</legend>
							) : null}
							{q.options.map((option) => {
								const selected = answers[q.question]?.includes(option.label);
								return (
									<button
										key={option.label}
										type="button"
										onClick={() => toggle(q, option.label)}
										className={cn(
											"flex w-full items-start gap-3 rounded-xl p-3.5 text-left transition-[background-color,box-shadow]",
											selected
												? "bg-brand-soft shadow-[inset_0_0_0_1.5px_var(--brand)]"
												: "bg-surface-2 hover:bg-surface-3",
										)}
									>
										<span
											className={cn(
												"mt-px inline-flex size-5 flex-none items-center justify-center",
												q.multiSelect ? "rounded-md" : "rounded-full",
												selected ? "bg-brand text-white" : "shadow-[inset_0_0_0_1.5px_var(--border-strong)]",
											)}
										>
											{selected ? <CheckIcon weight="bold" className="size-3" /> : null}
										</span>
										<span className="min-w-0">
											<span className="block text-[15px] leading-snug font-medium">{option.label}</span>
											{option.description ? (
												<span className="text-muted-foreground mt-0.5 block text-[13px] leading-snug">
													{option.description}
												</span>
											) : null}
										</span>
									</button>
								);
							})}
							<input
								value={other[q.question] ?? ""}
								onChange={(e) => setOther((current) => ({ ...current, [q.question]: e.target.value }))}
								placeholder="Something else…"
								className={cn(fieldClass, "h-12")}
							/>
						</fieldset>
					))}
				</div>
			</Sheet>
		);
	}

	const isPlan = request.toolName === "ExitPlanMode";
	const title = isPlan ? "Review the plan" : request.title || askFor(tool, summary.target);
	const said = request.description || request.decisionReason || stringField(request.input.description);
	const description = said && !title.includes(said) ? said : undefined;

	const allowFooter = (
		<div className="space-y-2">
			<div className="flex gap-2">
				<Button
					variant="secondary"
					size="lg"
					className="flex-1"
					disabled={!!busy}
					onClick={() => setDenying(true)}
				>
					{isPlan ? "Keep planning" : "Deny"}
				</Button>
				<Button
					size="lg"
					className="flex-[1.6]"
					disabled={!!busy}
					onClick={() => decide("allow", { behavior: "allow" })}
				>
					{busy === "allow" ? <Sending /> : isPlan ? "Approve plan" : "Allow"}
				</Button>
			</div>
			{request.canAlwaysAllow && !isPlan ? (
				<button
					type="button"
					disabled={!!busy}
					onClick={() => decide("always", { behavior: "allowAlways" })}
					className="bg-surface-2 hover:bg-surface-3 flex min-h-14 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.99] disabled:opacity-40"
				>
					<ShieldCheckIcon weight="fill" className="text-success size-[18px] flex-none" />
					<span className="min-w-0 flex-1">
						<span className="block text-[14px] leading-snug font-medium">Always allow</span>
						<span className="text-muted-foreground block text-[13px] leading-snug">
							<WithCode text={request.alwaysAllow ?? "Don't ask again for this"} />
						</span>
					</span>
					{busy === "always" ? <Sending /> : null}
				</button>
			) : null}
		</div>
	);

	// Saying no is its own step: room to tell Claude what to do instead, then a clear second press.
	const denyFooter = (
		<div className="space-y-2">
			<textarea
				value={feedback}
				onChange={(e) => setFeedback(e.target.value)}
				rows={2}
				placeholder={isPlan ? "What should change in the plan?" : "Tell Claude what to do instead (optional)"}
				className={cn(fieldClass, "block resize-none py-3")}
			/>
			<div className="flex gap-2">
				<Button
					variant="secondary"
					size="lg"
					className="flex-1"
					disabled={!!busy}
					onClick={() => setDenying(false)}
				>
					<ArrowLeftIcon weight="bold" />
					Back
				</Button>
				<Button
					variant={isPlan ? "default" : "destructive"}
					size="lg"
					className="flex-[1.6]"
					disabled={!!busy}
					onClick={() => decide("deny", { behavior: "deny", message: feedback.trim() || undefined })}
				>
					{busy === "deny" ? (
						<Sending />
					) : isPlan ? (
						feedback.trim() ? (
							"Send feedback"
						) : (
							"Keep planning"
						)
					) : feedback.trim() ? (
						"Deny and send"
					) : (
						"Deny"
					)}
				</Button>
			</div>
		</div>
	);

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			eyebrow={eyebrow}
			titleClassName="mt-1 text-[20px] leading-tight tracking-[-0.02em]"
			title={title}
			description={description}
			footer={denying ? denyFooter : allowFooter}
		>
			{outsideProject(request.blockedPath, cwd) ? (
				<p className="bg-warning-soft text-warning mb-3 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px]">
					<ShieldWarningIcon weight="fill" className="mt-px size-4 flex-none" />
					<span>
						Outside the project: <span className="font-mono break-all">{request.blockedPath}</span>
					</span>
				</p>
			) : null}
			<ToolBody tool={tool} cwd={cwd} />
		</Sheet>
	);
}

/**
 * Claude Code names the path behind a request; it's only worth a warning when that path lies outside
 * the session's project.
 */
function outsideProject(path: string | null, cwd: string | null): path is string {
	if (!path) return false;
	if (!cwd) return true;
	const root = cwd.replace(/\/+$/, "");
	return path !== root && !path.startsWith(`${root}/`);
}

function stringField(value: unknown) {
	return typeof value === "string" ? value : "";
}

/** The question the sheet asks, phrased for what the tool is about to do. */
function askFor(tool: Tool, target: string) {
	switch (tool.name) {
		case "Bash":
		case "PowerShell":
			return "Run this command?";
		case "Edit":
		case "MultiEdit":
		case "NotebookEdit":
			return `Edit ${target}?`;
		case "Write":
			return `Write ${target}?`;
		case "Read":
			return `Read ${target}?`;
		case "WebFetch":
			return `Fetch ${target}?`;
		case "WebSearch":
			return "Search the web?";
		default:
			return target ? `${tool.name}: ${target}?` : `Use ${tool.name}?`;
	}
}
