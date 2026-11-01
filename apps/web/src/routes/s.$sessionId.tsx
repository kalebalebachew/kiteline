import type { PermissionDecision, PermissionModeId } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
	ArrowDown,
	ChevronLeft,
	Copy,
	Ellipsis,
	FolderClosed,
	GitBranch,
	Pencil,
	Power,
	ShieldAlert,
	TerminalSquare,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { ComposerSubmit } from "@/components/composer";
import { Composer } from "@/components/composer";
import { copyText } from "@/components/copy-button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/menu";
import { PermissionSheet } from "@/components/permission-sheet";
import { RenameSheet } from "@/components/rename-sheet";
import { type DisplayStatus, StatusPill } from "@/components/status";
import { Timeline, WorkingLine } from "@/components/timeline/timeline";
import { baseName, formatCost, relativeTime } from "@/lib/format";
import { client, orpc } from "@/lib/orpc";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { mergeTimeline, useHistory, useRunStream } from "@/lib/session";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";

export const Route = createFileRoute("/s/$sessionId")({
	component: SessionPage,
});

function SessionPage() {
	const { sessionId } = Route.useParams();
	const router = useRouter();
	const queryClient = useQueryClient();
	const prefs = usePrefs();

	const info = useQuery(orpc.sessions.get.queryOptions({ input: { sessionId }, staleTime: 30_000 }));
	const system = useQuery(orpc.system.info.queryOptions({ staleTime: 5 * 60_000 }));
	const history = useHistory(sessionId);
	const { run, retired, connected } = useRunStream(sessionId);

	const live = !!run && run.status !== "closed" && run.status !== "error";
	const working = live && (run.status === "running" || run.status === "starting");
	const status: DisplayStatus = run && live ? run.status : run?.status === "error" ? "error" : "asleep";
	const cwd = run?.cwd ?? info.data?.cwd ?? null;
	const title =
		info.data?.title ?? (run?.items.find((i) => i.kind === "user") as { text?: string } | undefined)?.text;

	const items = useMemo(
		() => mergeTimeline(history.items, retired, run?.items ?? []),
		[history.items, retired, run?.items],
	);

	// Mode and model: the live process is the source of truth; otherwise the next send uses these.
	const [mode, setMode] = useState<PermissionModeId>(prefs.permissionMode);
	const [model, setModel] = useState<string | null>(prefs.model);
	const liveMode = live ? (run.meta.permissionMode ?? mode) : mode;

	const permissions = run?.permissions ?? [];
	const pendingIds = useMemo(() => new Set(permissions.map((p) => p.id)), [permissions]);
	const [sheetFor, setSheetFor] = useState<string | null>(null);
	const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
	const current =
		permissions.find((p) => p.id === sheetFor) ?? permissions.find((p) => !dismissed.has(p.id)) ?? null;
	const sheetOpen = !!current && (sheetFor === current.id || !dismissed.has(current.id));

	// Nudge when Claude Code needs you and you're looking elsewhere.
	const firstPending = permissions[0]?.id;
	useEffect(() => {
		if (!firstPending) {
			document.title = "Kiteline";
			return;
		}
		document.title = `(${permissions.length}) Needs you · Kiteline`;
		if (document.visibilityState === "hidden") navigator.vibrate?.([60, 40, 60]);
	}, [firstPending, permissions.length]);

	const content = useRef<HTMLDivElement>(null);
	const { away, scrollToBottom } = useStickToBottom(content, !history.isLoading);

	const send = useMutation({
		mutationFn: (value: ComposerSubmit) =>
			client.runs.send({
				sessionId,
				text: value.text,
				images: value.images.map(({ mediaType, data }) => ({ mediaType, data })),
				permissionMode: liveMode,
				model,
			}),
		onSuccess: () => scrollToBottom("smooth"),
	});

	const decide = async (id: string, decision: PermissionDecision) => {
		await client.runs.respond({ sessionId, permissionId: id, decision });
		setSheetFor(null);
	};

	const changeMode = async (next: PermissionModeId) => {
		setMode(next);
		setPrefs({ permissionMode: next });
		if (live)
			await client.runs
				.setPermissionMode({ sessionId, mode: next })
				.catch((e: Error) => toast.error(e.message));
	};

	const changeModel = async (next: string | null) => {
		setModel(next);
		setPrefs({ model: next });
		if (live)
			await client.runs.setModel({ sessionId, model: next }).catch((e: Error) => toast.error(e.message));
	};

	const [renaming, setRenaming] = useState(false);
	const lastModified = info.data?.lastModified ?? 0;
	// Only for sessions Kiteline hasn't driven during this visit: a terminal may still hold them.
	const recentlyActive = !run && Date.now() - lastModified < 3 * 60_000;

	return (
		<div className="flex min-h-dvh flex-col">
			<header className="pt-safe glass border-border sticky top-0 z-30 border-b">
				<div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-2">
					<button
						type="button"
						aria-label="Back"
						onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/" }))}
						className="text-muted-foreground hover:bg-surface-2 hover:text-foreground inline-flex size-10 shrink-0 items-center justify-center rounded-full"
					>
						<ChevronLeft className="size-5" />
					</button>
					<div className="min-w-0 flex-1 px-1">
						<p className="truncate text-[0.9375rem] leading-tight font-semibold">{title || "Session"}</p>
						<div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.72rem]">
							{cwd ? (
								<>
									<FolderClosed className="size-3 shrink-0" />
									<span className="truncate">{baseName(cwd)}</span>
								</>
							) : null}
							{info.data?.gitBranch && info.data.gitBranch !== "HEAD" ? (
								<>
									<GitBranch className="ml-1 size-3 shrink-0" />
									<span className="max-w-[7rem] truncate font-mono">{info.data.gitBranch}</span>
								</>
							) : null}
						</div>
					</div>
					<StatusPill status={connected || !live ? status : "starting"} className="shrink-0" />
					<Menu>
						<MenuTrigger
							aria-label="Session menu"
							className="text-muted-foreground hover:bg-surface-2 hover:text-foreground data-popup-open:bg-surface-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full"
						>
							<Ellipsis className="size-5" />
						</MenuTrigger>
						<MenuContent side="bottom" align="end" className="w-64">
							<MenuItem onClick={() => setRenaming(true)}>
								<Pencil className="text-muted-foreground size-4" />
								Rename
							</MenuItem>
							<MenuItem
								onClick={async () => {
									const command = `cd ${JSON.stringify(cwd ?? ".")} && claude --resume ${sessionId}`;
									if (await copyText(command)) toast.success("Resume command copied");
								}}
							>
								<TerminalSquare className="text-muted-foreground size-4" />
								Copy terminal resume command
							</MenuItem>
							<MenuItem
								onClick={async () => {
									if (await copyText(sessionId)) toast.success("Session ID copied");
								}}
							>
								<Copy className="text-muted-foreground size-4" />
								Copy session ID
							</MenuItem>
							{live ? (
								<>
									<MenuSeparator />
									<MenuItem
										className="text-destructive"
										onClick={() =>
											void client.runs.stop({ sessionId }).then(() => toast("Session put to sleep"))
										}
									>
										<Power className="size-4" />
										Stop the Claude Code process
									</MenuItem>
								</>
							) : null}
						</MenuContent>
					</Menu>
				</div>
			</header>

			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-6">
				<div ref={content}>
					{history.hasEarlier ? (
						<div className="mb-5 flex justify-center">
							<button
								type="button"
								onClick={() => void history.loadEarlier()}
								disabled={history.loadingEarlier}
								className="border-border text-muted-foreground hover:bg-surface-2 h-8 rounded-full border px-3.5 text-xs font-medium"
							>
								{history.loadingEarlier ? "Loading…" : "Load earlier messages"}
							</button>
						</div>
					) : null}

					{history.isLoading ? (
						<TimelineSkeleton />
					) : items.length === 0 && !run ? (
						<p className="text-muted-foreground py-16 text-center text-sm">
							This session has no messages yet.
						</p>
					) : (
						<Timeline
							items={items}
							draft={run?.draft ?? ""}
							ctx={{
								cwd,
								working,
								pendingIds,
								toolProgress: run?.toolProgress ?? {},
								onOpenPermission: (id) => {
									setSheetFor(id);
									setDismissed((d) => new Set([...d].filter((x) => x !== id)));
								},
							}}
							footer={
								<>
									{working && !run.draft ? (
										<WorkingLine label={run.meta.compacting ? "Compacting" : "Thinking"} />
									) : null}
									{run?.usage && !working ? (
										<p className="text-faint text-center text-[0.7rem] tabular-nums">
											{run.usage.numTurns} {run.usage.numTurns === 1 ? "turn" : "turns"} ·{" "}
											{formatCost(run.usage.costUsd)} this visit
										</p>
									) : null}
									{run?.status === "error" && run.error ? (
										<p className="border-destructive/25 bg-destructive/8 text-destructive rounded-xl border px-3.5 py-2.5 text-[0.8125rem]">
											The Claude Code process stopped: {run.error}
										</p>
									) : null}
								</>
							}
						/>
					)}
				</div>
			</main>

			<div className="from-background via-background to-background/0 sticky bottom-0 z-20 bg-gradient-to-t pt-6">
				<div className="mx-auto w-full max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
					{away ? (
						<div className="pointer-events-none absolute -top-8 right-0 left-0 flex justify-center">
							<button
								type="button"
								aria-label="Jump to latest"
								onClick={() => scrollToBottom("smooth")}
								className="elevated border-border-strong bg-popover text-muted-foreground pointer-events-auto inline-flex size-9 items-center justify-center rounded-full border"
							>
								<ArrowDown className="size-4" />
							</button>
						</div>
					) : null}

					{current && !sheetOpen ? (
						<button
							type="button"
							onClick={() => setSheetFor(current.id)}
							className="border-warning/35 bg-warning/10 text-warning animate-in fade-in-0 slide-in-from-bottom-2 mb-2 flex w-full items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-sm font-medium"
						>
							<ShieldAlert className="size-4 shrink-0" />
							<span className="flex-1">
								{permissions.length === 1
									? "Claude Code is waiting for you"
									: `${permissions.length} requests waiting`}
							</span>
							<span className="text-xs opacity-80">Review</span>
						</button>
					) : null}

					{recentlyActive ? (
						<p className="text-faint mb-2 px-2 text-center text-[0.72rem] leading-snug">
							Active {relativeTime(lastModified)}. If it's still open in a terminal, close it there before
							replying here.
						</p>
					) : null}

					<Composer
						onSubmit={async (value) => {
							try {
								await send.mutateAsync(value);
								return true;
							} catch {
								return false;
							}
						}}
						onStop={live ? () => void client.runs.interrupt({ sessionId }) : undefined}
						running={working || run?.status === "waiting"}
						sending={send.isPending}
						placeholder={live ? "Reply…" : "Continue this session…"}
						slashCommands={run?.meta.slashCommands}
						mode={liveMode}
						onModeChange={(m) => void changeMode(m)}
						allowBypass={system.data?.allowBypass ?? true}
						model={model}
						modelInUse={live ? run.meta.model : null}
						onModelChange={(m) => void changeModel(m)}
					/>
				</div>
			</div>

			<PermissionSheet
				request={current}
				queued={permissions.length}
				cwd={cwd}
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open && current) {
						setDismissed((d) => new Set(d).add(current.id));
						setSheetFor(null);
					}
				}}
				onDecide={decide}
			/>

			<RenameSheet
				open={renaming}
				onOpenChange={setRenaming}
				initial={info.data?.title ?? ""}
				onSave={async (next) => {
					await client.sessions.rename({ sessionId, title: next });
					await queryClient.invalidateQueries({ queryKey: orpc.sessions.key() });
				}}
			/>
		</div>
	);
}

function TimelineSkeleton() {
	return (
		<div className="space-y-6">
			{[0.55, 0.9, 0.4, 0.75].map((w, i) => (
				<div key={w} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
					<div className="bg-surface-2 h-11 animate-pulse rounded-2xl" style={{ width: `${w * 100}%` }} />
				</div>
			))}
		</div>
	);
}
