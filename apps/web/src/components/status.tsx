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

const TONE: Record<DisplayStatus, string> = {
	starting: "bg-aurora-1",
	running: "bg-aurora-1",
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
	const pulsing = status === "running" || status === "starting" || status === "waiting";
	return (
		<span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden="true">
			{pulsing ? (
				<span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", TONE[status])} />
			) : null}
			<span className={cn("relative inline-flex size-2 rounded-full", TONE[status])} />
		</span>
	);
}

export function StatusPill({ status, className }: { status: DisplayStatus; className?: string }) {
	return (
		<span
			className={cn(
				"border-border bg-surface-2/70 text-muted-foreground inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
				status === "waiting" && "border-warning/30 bg-warning/10 text-warning",
				className,
			)}
		>
			<StatusDot status={status} />
			{LABEL[status]}
		</span>
	);
}
