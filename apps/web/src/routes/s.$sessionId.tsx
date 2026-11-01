import type { PermissionDecision, PermissionModeId } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import {
	ArrowDownIcon,
	CaretLeftIcon,
	CopyIcon,
	DotsThreeIcon,
	FolderSimpleIcon,
	GitBranchIcon,
	PencilSimpleIcon,
	PowerIcon,
	ShieldWarningIcon,
	TerminalWindowIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { client, errorMessage, orpc } from "@/lib/orpc";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { mergeTimeline, useHistory, useRunStream } from "@/lib/session";
import { useStickToBottom } from "@/lib/use-stick-to-bottom";

export const Route = createFileRoute("/s/$sessionId")({
	component: SessionPage,
	// Another session is another page: start its state fresh rather than carrying this one's over.
	remountDeps: ({ params }) => params,
});

const NO_PROGRESS: Record<string, number> = {};

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
		() => mergeTimeline(history.items, retired, run?.items ?? [], history.hasEarlier),
		[history.items, retired, run?.items, history.hasEarlier],
	);

	// Mode and model: the live process is the source of truth; otherwise the next send uses these.
	const [mode, setMode] = useState<PermissionModeId>(prefs.permissionMode);
	const [model, setModel] = useState<string | null>(prefs.model);
	const liveMode = live ? (run.meta.permissionMode ?? mode) : mode;

	const permissions = run?.permissions ?? [];
	const pendingIds = useMemo(() => new Set(permissions.map((p) => p.id)), [permissions]);
	const [sheetFor, setSheetFor] = useState<string | null>(null);
	const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
	// The sheet shows the request you opened, or the first one you haven't swiped away; once every
	// waiting request is dismissed, the bar above the composer offers the first one back.
	const showing =
		permissions.find((p) => p.id === sheetFor) ?? permissions.find((p) => !dismissed.has(p.id)) ?? null;
	const sheetOpen = !!showing;
	const current = showing ?? permissions[0] ?? null;

	// Nudge when Claude Code needs you and you're looking elsewhere.
	const firstPending = permissions[0]?.id;
	useEffect(() => {
		if (!firstPending) {
			document.title = "Kiteline";
			return;
		}
		document.title = `(${permissions.length}) Needs you · Kiteline`;
		if (document.visibilityState === "hidden") navigator.vibrate?.([60, 40, 60]);
		return () => {
			document.title = "Kiteline";
		};
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
		try {
			await client.runs.respond({ sessionId, permissionId: id, decision });
			setSheetFor(null);
		} catch (error) {
			// The sheet stays open, so you can try again.
			toast.error(errorMessage(error));
		}
	};

	const stopTurn = () => void client.runs.interrupt({ sessionId }).catch((e) => toast.error(errorMessage(e)));

	const openPermission = useCallback((id: string) => {
		setSheetFor(id);
		setDismissed((d) => new Set([...d].filter((x) => x !== id)));
	}, []);
	// Ids from this visit's live process: only those can still be running.
	const liveIds = useMemo(() => new Set((run?.items ?? []).map((i) => i.id)), [run?.items]);
	const toolProgress = run?.toolProgress ?? NO_PROGRESS;
	const ctx = useMemo(
		() => ({ cwd, working, pendingIds, liveIds, toolProgress, onOpenPermission: openPermission }),
		[cwd, working, pendingIds, liveIds, toolProgress, openPermission],
	);

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
			<header className="pt-safe glass sticky top-0 z-30 shadow-[0_1px_0_var(--border)]">
				<div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-2">
					<button
						type="button"
						aria-label="Back"
						onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/" }))}
						className="text-icon hover:bg-surface-2 hover:text-foreground inline-flex size-10 flex-none items-center justify-center rounded-full transition-colors"
					>
						<CaretLeftIcon weight="bold" className="size-[18px]" />
					</button>
					<div className="min-w-0 flex-1 px-1">
						<p className="truncate text-[15px] leading-tight font-semibold tracking-[-0.01em]">
							{title || "Session"}
						</p>
						<div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px]">
							{cwd ? (
								<span className="flex min-w-0 flex-none items-center gap-1">
									<FolderSimpleIcon weight="fill" className="text-icon size-3 flex-none" />
									<span className="max-w-[9rem] truncate">{baseName(cwd)}</span>
								</span>
							) : null}
							{info.data?.gitBranch && info.data.gitBranch !== "HEAD" ? (
								<span className="ml-1 flex min-w-0 items-center gap-1">
									<GitBranchIcon weight="fill" className="text-icon size-3 flex-none" />
									<span className="truncate">{info.data.gitBranch}</span>
								</span>
							) : null}
						</div>
					</div>
					<StatusPill status={connected || !live ? status : "starting"} className="flex-none" />
					<Menu>
						<MenuTrigger
							aria-label="Session menu"
							className="text-icon hover:bg-surface-2 hover:text-foreground data-popup-open:bg-surface-2 inline-flex size-10 flex-none items-center justify-center rounded-full transition-colors"
						>
							<DotsThreeIcon weight="bold" className="size-5" />
						</MenuTrigger>
						<MenuContent side="bottom" align="end" className="w-64">
							<MenuItem onClick={() => setRenaming(true)}>
								<PencilSimpleIcon weight="fill" className="text-icon size-4" />
								Rename
							</MenuItem>
							<MenuItem
								onClick={async () => {
									const command = `cd ${JSON.stringify(cwd ?? ".")} && claude --resume ${sessionId}`;
									if (await copyText(command)) toast.success("Resume command copied");
								}}
							>
								<TerminalWindowIcon weight="fill" className="text-icon size-4" />
								Copy terminal resume command
							</MenuItem>
							<MenuItem
								onClick={async () => {
									if (await copyText(sessionId)) toast.success("Session ID copied");
								}}
							>
								<CopyIcon weight="fill" className="text-icon size-4" />
								Copy session ID
							</MenuItem>
							{live ? (
								<>
									<MenuSeparator />
									<MenuItem
										className="text-destructive"
										onClick={() =>
											void client.runs
												.stop({ sessionId })
												.then(() => toast("Session put to sleep"))
												.catch((e) => toast.error(errorMessage(e)))
										}
									>
										<PowerIcon weight="bold" className="size-4" />
										Stop the Claude Code process
									</MenuItem>
								</>
							) : null}
						</MenuContent>
					</Menu>
				</div>
			</header>

			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-6">
				<div ref={content}>
					{history.hasEarlier ? (
						<div className="mb-6 flex justify-center">
							<button
								type="button"
								onClick={() => void history.loadEarlier()}
								disabled={history.loadingEarlier}
								className="bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground h-8 rounded-full px-3.5 text-[13px] font-medium"
							>
								{history.loadingEarlier ? "Loading…" : "Load earlier messages"}
							</button>
						</div>
					) : null}

					{history.isLoading ? (
						<TimelineSkeleton />
					) : items.length === 0 && !run ? (
						<p className="text-muted-foreground py-16 text-center text-[14px]">
							This session has no messages yet.
						</p>
					) : (
						<Timeline
							items={items}
							draft={run?.draft ?? ""}
							ctx={ctx}
							footer={
								<>
									{working && !run.draft ? (
										<WorkingLine label={run.meta.compacting ? "Compacting" : "Thinking"} />
									) : null}
									{run?.usage && !working ? (
										<p className="text-faint text-center text-[12px] tabular-nums">
											{run.usage.numTurns} {run.usage.numTurns === 1 ? "turn" : "turns"} ·{" "}
											{formatCost(run.usage.costUsd)} this visit
										</p>
									) : null}
									{run?.status === "error" && run.error ? (
										<p className="bg-destructive-soft text-destructive rounded-xl px-3.5 py-2.5 text-[13px]">
											The Claude Code process stopped: {run.error}
										</p>
									) : null}
								</>
							}
						/>
					)}
				</div>
			</main>

			<div className="from-background via-background to-background/0 sticky bottom-0 z-20 bg-gradient-to-t via-70% pt-8">
				<div className="relative mx-auto w-full max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
					{away ? (
						<div className="pointer-events-none absolute -top-9 right-0 left-0 flex justify-center">
							<button
								type="button"
								aria-label="Jump to latest"
								onClick={() => scrollToBottom("smooth")}
								className="bg-raised text-icon shadow-float pointer-events-auto inline-flex size-9 items-center justify-center rounded-full"
							>
								<ArrowDownIcon weight="bold" className="size-4" />
							</button>
						</div>
					) : null}

					{current && !sheetOpen ? (
						<button
							type="button"
							onClick={() => setSheetFor(current.id)}
							className="bg-warning-soft text-warning animate-in fade-in-0 slide-in-from-bottom-2 mb-2 flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-left text-[14px] font-medium"
						>
							<ShieldWarningIcon weight="fill" className="size-4 flex-none" />
							<span className="flex-1">
								{permissions.length === 1
									? "Claude Code is waiting for you"
									: `${permissions.length} requests waiting`}
							</span>
							<span className="text-[13px] opacity-80">Review</span>
						</button>
					) : null}

					{recentlyActive ? (
						<p className="text-faint mb-2 px-3 text-center text-[12px] leading-snug">
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
						onStop={live ? stopTurn : undefined}
						draftKey={`session:${sessionId}`}
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
					// Swiping it away puts every waiting request behind the bar, not just this one.
					if (!open) {
						setDismissed((d) => new Set([...d, ...permissions.map((p) => p.id)]));
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
