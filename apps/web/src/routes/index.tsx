import type { RunSummary, SessionInfo } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, FolderClosed, GitBranch, Plus, Search, Settings2, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Wordmark } from "@/components/brand";
import { StatusDot, StatusPill } from "@/components/status";
import { baseName, dayBucket, greeting, relativeTime, tildify } from "@/lib/format";
import { useLiveRuns } from "@/lib/live";
import { orpc } from "@/lib/orpc";

export const Route = createFileRoute("/")({
	component: Home,
});

function useScrolled() {
	const [scrolled, setScrolled] = useState(false);
	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 8);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);
	return scrolled;
}

function Home() {
	const system = useQuery(orpc.system.info.queryOptions({ staleTime: 5 * 60_000 }));
	const sessions = useQuery(orpc.sessions.list.queryOptions({ input: { limit: 200 }, staleTime: 15_000 }));
	const { runs, connected } = useLiveRuns();
	const [query, setQuery] = useState("");
	const [project, setProject] = useState<string | null>(null);
	const scrolled = useScrolled();

	const liveById = useMemo(() => new Map((runs ?? []).map((r) => [r.sessionId, r])), [runs]);

	const projects = useMemo(() => {
		const seen = new Map<string, number>();
		for (const s of sessions.data ?? []) if (s.cwd && !seen.has(s.cwd)) seen.set(s.cwd, s.lastModified);
		return [...seen.keys()].slice(0, 10);
	}, [sessions.data]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (sessions.data ?? []).filter((s) => {
			if (project && s.cwd !== project) return false;
			if (!q) return true;
			return [s.title, s.firstPrompt, s.cwd, s.gitBranch].some((v) => v?.toLowerCase().includes(q));
		});
	}, [sessions.data, query, project]);

	const groups = useMemo(() => {
		const out = new Map<string, SessionInfo[]>();
		for (const s of filtered) {
			const label = dayBucket(s.lastModified);
			out.set(label, [...(out.get(label) ?? []), s]);
		}
		return [...out];
	}, [filtered]);

	const live = runs ?? [];
	const needsYou = live.reduce((n, r) => n + r.pendingPermissions, 0);
	const host = system.data?.hostname ?? "your computer";

	return (
		<div className="relative min-h-dvh">
			<div className="halo pointer-events-none absolute inset-x-0 top-0 h-80" />
			<header
				className={cn(
					"pt-safe sticky top-0 z-30 border-b transition-colors duration-200",
					scrolled ? "glass border-border" : "border-transparent",
				)}
			>
				<div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
					<Wordmark />
					<div className="flex items-center gap-1">
						<span className="border-border bg-surface/60 text-muted-foreground inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs">
							<StatusDot status={connected ? "idle" : "closed"} />
							<span className="max-w-[8rem] truncate">{host}</span>
						</span>
						<Link
							to="/settings"
							aria-label="Settings"
							className="text-muted-foreground hover:bg-surface-2 hover:text-foreground inline-flex size-9 items-center justify-center rounded-full"
						>
							<Settings2 className="size-[1.15rem]" />
						</Link>
					</div>
				</div>
			</header>

			<main className="relative mx-auto max-w-2xl px-4 pb-36">
				<section className="pt-7 pb-6">
					<h1 className="font-display text-[2.7rem] leading-[1.02] tracking-tight">{greeting()}.</h1>
					<p className="text-muted-foreground mt-2 text-[0.9375rem]">
						{needsYou ? (
							<span className="text-warning">
								{needsYou} {needsYou === 1 ? "request is" : "requests are"} waiting for you.
							</span>
						) : live.length ? (
							`${live.length} ${live.length === 1 ? "session is" : "sessions are"} live on ${host}.`
						) : (
							`Pick up where you left off on ${host}, or start something new.`
						)}
					</p>
				</section>

				{live.length ? (
					<section className="mb-7">
						<SectionLabel>Live now</SectionLabel>
						<div className="grid gap-2.5">
							{live.map((run) => (
								<LiveCard key={run.sessionId} run={run} title={titleFor(run, sessions.data)} />
							))}
						</div>
					</section>
				) : null}

				<div className="from-background via-background to-background/0 sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 -mx-4 bg-gradient-to-b px-4 pt-1 pb-3">
					<label className="relative block">
						<Search className="text-faint pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search sessions"
							className="border-border bg-surface placeholder:text-faint focus:border-border-strong h-11 w-full rounded-2xl border pr-10 pl-10 text-[0.9375rem] outline-none"
						/>
						{query ? (
							<button
								type="button"
								aria-label="Clear search"
								onClick={() => setQuery("")}
								className="text-faint hover:bg-surface-2 absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full"
							>
								<X className="size-4" />
							</button>
						) : null}
					</label>
					{projects.length > 1 ? (
						<div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4">
							<Chip active={!project} onClick={() => setProject(null)}>
								All
							</Chip>
							{projects.map((p) => (
								<Chip key={p} active={project === p} onClick={() => setProject(project === p ? null : p)}>
									{baseName(p)}
								</Chip>
							))}
						</div>
					) : null}
				</div>

				{sessions.isLoading ? (
					<SkeletonList />
				) : groups.length === 0 ? (
					<EmptyState searching={!!query || !!project} />
				) : (
					groups.map(([label, list]) => (
						<section key={label} className="mt-5">
							<SectionLabel>{label}</SectionLabel>
							<div className="border-border bg-surface overflow-hidden rounded-2xl border">
								{list.map((s, i) => (
									<SessionRow
										key={s.sessionId}
										session={s}
										live={liveById.get(s.sessionId)}
										first={i === 0}
									/>
								))}
							</div>
						</section>
					))
				)}
			</main>

			<div className="from-background via-background/80 pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t to-transparent pt-10 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
				<div className="mx-auto flex max-w-2xl justify-center px-4">
					<Link
						to="/new"
						className="aurora pointer-events-auto inline-flex h-13 items-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold text-[oklch(0.16_0.02_268)] shadow-[0_10px_30px_-8px_color-mix(in_oklch,var(--aurora-2)_70%,transparent)] transition-transform active:scale-[0.97]"
					>
						<Plus className="size-5" strokeWidth={2.5} />
						New session
					</Link>
				</div>
			</div>
		</div>
	);
}

function titleFor(run: RunSummary, sessions: SessionInfo[] | undefined) {
	return run.title || sessions?.find((s) => s.sessionId === run.sessionId)?.title || "New session";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="text-faint mb-2 px-1 text-[0.72rem] font-medium tracking-[0.08em] uppercase">
			{children}
		</h2>
	);
}

function Chip({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex h-8 max-w-[13rem] shrink-0 items-center rounded-full border px-3 text-[0.8125rem] font-medium transition-colors",
				active
					? "bg-foreground text-background border-transparent"
					: "border-border bg-surface text-muted-foreground hover:text-foreground",
			)}
		>
			<span className="truncate">{children}</span>
		</button>
	);
}

function LiveCard({ run, title }: { run: RunSummary; title: string }) {
	const waiting = run.pendingPermissions > 0;
	return (
		<Link
			to="/s/$sessionId"
			params={{ sessionId: run.sessionId }}
			className={cn(
				"group bg-surface relative block overflow-hidden rounded-2xl border p-4 transition-transform active:scale-[0.99]",
				waiting ? "border-warning/40" : "border-border-strong",
			)}
		>
			<div
				className={cn(
					"pointer-events-none absolute -top-16 -right-10 size-40 rounded-full opacity-25 blur-3xl",
					waiting ? "bg-warning" : "aurora",
				)}
			/>
			<div className="relative flex items-center justify-between gap-3">
				<StatusPill status={run.status} />
				<span className="text-faint text-xs">{relativeTime(run.lastActivity)}</span>
			</div>
			<p className="relative mt-3 line-clamp-2 text-[1rem] leading-snug font-medium">{title}</p>
			<div className="text-muted-foreground relative mt-2 flex items-center gap-1.5 text-xs">
				<FolderClosed className="size-3.5" />
				<span className="truncate">{tildify(run.cwd)}</span>
			</div>
			{waiting ? (
				<div className="bg-warning/10 text-warning relative mt-3.5 flex items-center gap-2 rounded-xl px-3 py-2 text-[0.8125rem] font-medium">
					<ShieldAlert className="size-4" />
					{run.pendingPermissions === 1 ? "Approval needed" : `${run.pendingPermissions} approvals needed`}
					<ChevronRight className="ml-auto size-4" />
				</div>
			) : null}
		</Link>
	);
}

function SessionRow({ session, live, first }: { session: SessionInfo; live?: RunSummary; first: boolean }) {
	return (
		<Link
			to="/s/$sessionId"
			params={{ sessionId: session.sessionId }}
			className={cn(
				"active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2/60 flex items-center gap-3 px-4 py-3.5 transition-colors",
				!first && "border-border border-t",
			)}
		>
			<div className="min-w-0 flex-1">
				<p className="truncate text-[0.9375rem] font-medium">{session.title}</p>
				<div className="text-muted-foreground mt-1 flex min-w-0 items-center gap-3 text-xs">
					<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
						{session.cwd ? (
							<span className="flex max-w-[60%] min-w-0 shrink-0 items-center gap-1.5">
								<FolderClosed className="text-faint size-3.5 shrink-0" />
								<span className="truncate">{baseName(session.cwd)}</span>
							</span>
						) : null}
						{session.gitBranch && session.gitBranch !== "HEAD" ? (
							<span className="ml-1 flex min-w-0 items-center gap-1.5">
								<GitBranch className="text-faint size-3.5 shrink-0" />
								<span className="truncate font-mono text-[0.7rem]">{session.gitBranch}</span>
							</span>
						) : null}
					</div>
					<span className="text-faint shrink-0">{relativeTime(session.lastModified)}</span>
				</div>
			</div>
			{live ? <StatusDot status={live.status} /> : null}
			<ChevronRight className="text-faint size-4 shrink-0" />
		</Link>
	);
}

function SkeletonList() {
	return (
		<div className="border-border bg-surface mt-5 overflow-hidden rounded-2xl border">
			{Array.from({ length: 6 }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows.
				<div key={i} className={cn("px-4 py-4", i && "border-border border-t")}>
					<div className="bg-surface-3 h-3.5 w-2/3 animate-pulse rounded-full" />
					<div className="bg-surface-2 mt-2.5 h-2.5 w-1/3 animate-pulse rounded-full" />
				</div>
			))}
		</div>
	);
}

function EmptyState({ searching }: { searching: boolean }) {
	return (
		<div className="border-border-strong mt-10 rounded-3xl border border-dashed px-6 py-12 text-center">
			<p className="font-display text-2xl tracking-tight">
				{searching ? "Nothing matches" : "No sessions yet"}
			</p>
			<p className="text-muted-foreground mt-2 text-sm">
				{searching
					? "Try another word, or clear the project filter."
					: "Sessions you run in Claude Code on this computer show up here."}
			</p>
		</div>
	);
}
