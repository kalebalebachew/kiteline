import type { PermissionDecision, PermissionRequest } from "@kiteline/api/agent/types";
import { Button } from "@kiteline/ui/components/button";
import { Sheet } from "@kiteline/ui/components/sheet";
import { cn } from "@kiteline/ui/lib/utils";
import { Check, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

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

export function PermissionSheet({ request, queued, cwd, open, onOpenChange, onDecide }: Props) {
	const [busy, setBusy] = useState<string | null>(null);
	const [feedback, setFeedback] = useState("");
	const [showFeedback, setShowFeedback] = useState(false);
	const [answers, setAnswers] = useState<Record<string, string[]>>({});
	const [other, setOther] = useState<Record<string, string>>({});

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset per request
	useEffect(() => {
		setBusy(null);
		setFeedback("");
		setShowFeedback(false);
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
	const Icon = summary.icon;
	const counter = queued > 1 ? `1 of ${queued}` : null;

	const eyebrow = (
		<div className="flex items-center gap-2">
			<span className="border-warning/30 bg-warning/10 text-warning inline-flex size-8 items-center justify-center rounded-xl border">
				<Icon className="size-4" />
			</span>
			<span className="text-warning text-xs font-medium">
				{request.fromSubagent ? "A sub-agent needs you" : "Claude Code needs you"}
			</span>
			{counter ? <span className="text-faint ml-auto text-xs tabular-nums">{counter}</span> : null}
		</div>
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
				title={questions.length > 1 ? "A few questions" : (questions[0]?.question ?? "A question")}
				footer={
					<div className="flex gap-2">
						<Button
							variant="outline"
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
							variant="aurora"
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
							Send answer{questions.length > 1 ? "s" : ""}
						</Button>
					</div>
				}
			>
				<div className="space-y-5">
					{questions.map((q) => (
						<fieldset key={q.question} className="space-y-2">
							{questions.length > 1 ? (
								<legend className="mb-2 text-sm font-medium">
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
											"flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
											selected
												? "border-aurora-1/60 bg-aurora-1/8"
												: "border-border bg-surface hover:bg-surface-2",
										)}
									>
										<span
											className={cn(
												"mt-0.5 inline-flex size-5 shrink-0 items-center justify-center border",
												q.multiSelect ? "rounded-md" : "rounded-full",
												selected
													? "aurora border-transparent text-[oklch(0.16_0.02_268)]"
													: "border-border-strong",
											)}
										>
											{selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
										</span>
										<span className="min-w-0">
											<span className="block text-[0.9375rem] font-medium">{option.label}</span>
											{option.description ? (
												<span className="text-muted-foreground mt-0.5 block text-[0.8125rem] leading-snug">
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
								className="border-border bg-surface placeholder:text-faint focus:border-border-strong h-12 w-full rounded-2xl border px-3.5 text-[0.9375rem] outline-none"
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
	const description = said && said !== title ? said : undefined;

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			eyebrow={eyebrow}
			title={title}
			description={description}
			footer={
				<div className="space-y-2.5">
					{showFeedback ? (
						<textarea
							value={feedback}
							onChange={(e) => setFeedback(e.target.value)}
							rows={2}
							placeholder={
								isPlan ? "What should change in the plan?" : "Tell Claude what to do instead (optional)"
							}
							className="border-border bg-surface placeholder:text-faint focus:border-border-strong block w-full resize-none rounded-2xl border px-3.5 py-3 text-[0.9375rem] outline-none"
						/>
					) : null}
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="lg"
							className="flex-1"
							disabled={!!busy}
							onClick={() => {
								if (!showFeedback && !feedback) {
									setShowFeedback(true);
									return;
								}
								void decide("deny", { behavior: "deny", message: feedback || undefined });
							}}
						>
							{busy === "deny"
								? "…"
								: showFeedback
									? isPlan
										? "Send feedback"
										: "Deny"
									: isPlan
										? "Keep planning"
										: "Deny"}
						</Button>
						<Button
							variant="aurora"
							size="lg"
							className="flex-[1.6]"
							disabled={!!busy}
							onClick={() => decide("allow", { behavior: "allow" })}
						>
							{busy === "allow" ? "…" : isPlan ? "Approve plan" : "Allow"}
						</Button>
					</div>
					{request.canAlwaysAllow && !isPlan ? (
						<button
							type="button"
							disabled={!!busy}
							onClick={() => decide("always", { behavior: "allowAlways" })}
							className="text-muted-foreground hover:text-foreground w-full py-1 text-center text-[0.8125rem] font-medium"
						>
							Allow, and don't ask again for this
						</button>
					) : null}
				</div>
			}
		>
			{request.blockedPath ? (
				<p className="border-warning/25 bg-warning/8 text-warning mb-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[0.8125rem]">
					<ShieldAlert className="mt-0.5 size-4 shrink-0" />
					Outside the project: <span className="font-mono break-all">{request.blockedPath}</span>
				</p>
			) : null}
			<ToolBody tool={tool} cwd={cwd} />
		</Sheet>
	);
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
