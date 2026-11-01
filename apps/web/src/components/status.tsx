import type { RunStatus } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";

export type DisplayStatus = RunStatus | "asleep";

const LABEL: Record<DisplayStatus, string> = {
	starting: "Starting",
	running: "Working",
	waiting: "Needs you",
	idle: "Ready",
	closed: "Asleep",
	asleep: "Asleep",
	error: "Stopped",
};

const DOT: Record<DisplayStatus, string> = {
	starting: "bg-brand",
	running: "bg-brand",
	waiting: "bg-warning",
	idle: "bg-success",
	closed: "bg-faint",
	asleep: "bg-faint",
	error: "bg-destructive",
};

export function statusLabel(status: DisplayStatus) {
	return LABEL[status];
}

export function StatusDot({ status, className }: { status: DisplayStatus; className?: string }) {
	const live = status === "running" || status === "starting" || status === "waiting";
	return (
		<span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden="true">
			{live ? (
				<span className={cn("absolute inset-0 animate-ping rounded-full opacity-40", DOT[status])} />
			) : null}
			<span className={cn("relative inline-flex size-2 rounded-full", DOT[status])} />
		</span>
	);
}

export function StatusPill({ status, className }: { status: DisplayStatus; className?: string }) {
	return (
		<span
			className={cn(
				"bg-surface-2 text-muted-foreground inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium",
				status === "waiting" && "bg-warning-soft text-warning",
				className,
			)}
		>
			<StatusDot status={status} />
			<span className="trim">{LABEL[status]}</span>
		</span>
	);
}
