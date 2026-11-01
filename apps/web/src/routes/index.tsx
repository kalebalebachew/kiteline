import type { RunSummary, SessionInfo } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import {
	CaretRightIcon,
	FolderSimpleIcon,
	GearSixIcon,
	GitBranchIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	ShieldWarningIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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
		const onScroll = () => setScrolled(window.scrollY > 4);
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
		const seen = new Set<string>();
		for (const s of sessions.data ?? []) if (s.cwd) seen.add(s.cwd);
		return [...seen].slice(0, 10);
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
		<div className="min-h-dvh">
			<header
				className={cn(
					"pt-safe sticky top-0 z-30 transition-[background-color,box-shadow] duration-200",
					scrolled && "glass shadow-[0_1px_0_var(--border)]",
				)}
			>
				<div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
					<Wordmark />
					<div className="flex min-w-0 items-center gap-1">
						<span className="bg-surface-2 text-muted-foreground inline-flex h-8 min-w-0 items-center gap-2 rounded-full px-3 text-[13px]">
							<StatusDot status={connected ? "idle" : "closed"} />
							<span className="truncate">{host}</span>
						</span>
						<Link
							to="/settings"
							aria-label="Settings"
							className="text-icon hover:bg-surface-2 hover:text-foreground inline-flex size-9 flex-none items-center justify-center rounded-full transition-colors"
						>
							<GearSixIcon weight="fill" className="size-[18px]" />
						</Link>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-2xl px-4 pb-36">
				<section className="pt-5 pb-6">
					<h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em]">{greeting()}</h1>
					<p className="text-muted-foreground mt-1 text-[15px]">
						{needsYou ? (
							<span className="text-warning font-medium">
								{needsYou} {needsYou === 1 ? "request is" : "requests are"} waiting for you
							</span>
						) : live.length ? (
							`${live.length} ${live.length === 1 ? "session is" : "sessions are"} running on ${host}`
						) : (
							`Pick up a session on ${host}, or start a new one`
						)}
					</p>
				</section>

				{live.length ? (
					<section className="mb-7">
						<SectionLabel>Live now</SectionLabel>
						<div className="grid gap-2">
							{live.map((run) => (
								<LiveCard key={run.sessionId} run={run} title={titleFor(run, sessions.data)} />
							))}
						</div>
					</section>
				) : null}

				<div className="bg-background sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 -mx-4 px-4 pt-1 pb-3">
					<label className="relative block">
						<MagnifyingGlassIcon
							weight="bold"
							className="text-faint pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
						/>
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search sessions"
							className="bg-surface-2 placeholder:text-faint focus-visible:bg-surface-3 h-11 w-full rounded-xl pr-10 pl-10 text-[16px] outline-none focus-visible:outline-none"
						/>
						{query ? (
							<button
								type="button"
								aria-label="Clear search"
								onClick={() => setQuery("")}
								className="text-faint hover:text-foreground absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full"
							>
								<XCircleIcon weight="fill" className="size-[18px]" />
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
						<section key={label} className="mt-4">
							<SectionLabel>{label}</SectionLabel>
							<div className="bg-surface shadow-card overflow-hidden rounded-2xl">
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

			<div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
				<Link
					to="/new"
					className="bg-foreground text-background shadow-float pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full pr-5 pl-4 text-[15px] font-semibold transition-transform active:scale-[0.97]"
				>
					<PlusIcon weight="bold" className="size-4" />
					New session
				</Link>
			</div>
		</div>
	);
}

function titleFor(run: RunSummary, sessions: SessionInfo[] | undefined) {
	return run.title || sessions?.find((s) => s.sessionId === run.sessionId)?.title || "New session";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <h2 className="text-muted-foreground mb-2 px-1 text-[13px] font-medium">{children}</h2>;
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
				"inline-flex h-8 max-w-[13rem] flex-none items-center rounded-full px-3 text-[13px] font-medium transition-colors",
				active ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground",
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
			className="bg-surface shadow-card block rounded-2xl p-4 transition-transform active:scale-[0.99]"
		>
			<div className="flex items-center justify-between gap-3">
				<StatusPill status={run.status} />
				<span className="text-faint text-[13px]">{relativeTime(run.lastActivity)}</span>
			</div>
			<p className="mt-3 line-clamp-2 text-[16px] leading-snug font-medium">{title}</p>
			<div className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-[13px]">
				<FolderSimpleIcon weight="fill" className="text-icon size-3.5 flex-none" />
				<span className="truncate">{tildify(run.cwd)}</span>
			</div>
			{waiting ? (
				<div className="bg-warning-soft text-warning mt-3.5 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium">
					<ShieldWarningIcon weight="fill" className="size-4" />
					{run.pendingPermissions === 1 ? "Approval needed" : `${run.pendingPermissions} approvals needed`}
					<CaretRightIcon weight="bold" className="ml-auto size-3.5" />
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
			className="group active:bg-surface-2 [@media(hover:hover)]:hover:bg-surface-2/70 flex items-center gap-3 pl-4 transition-colors"
		>
			<div
				className={cn("flex min-w-0 flex-1 items-center gap-3 py-3 pr-4", !first && "border-border border-t")}
			>
				<div className="min-w-0 flex-1">
					<p className="truncate text-[15px] leading-snug font-medium">{session.title}</p>
					<div className="text-muted-foreground mt-1 flex min-w-0 items-center gap-3 text-[13px]">
						<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
							{session.cwd ? (
								<span className="flex max-w-[60%] min-w-0 flex-none items-center gap-1.5">
									<FolderSimpleIcon weight="fill" className="text-icon size-3.5 flex-none" />
									<span className="truncate">{baseName(session.cwd)}</span>
								</span>
							) : null}
							{session.gitBranch && session.gitBranch !== "HEAD" ? (
								<span className="ml-1.5 flex min-w-0 items-center gap-1.5">
									<GitBranchIcon weight="fill" className="text-icon size-3.5 flex-none" />
									<span className="truncate">{session.gitBranch}</span>
								</span>
							) : null}
						</div>
						<span className="text-faint flex-none">{relativeTime(session.lastModified)}</span>
					</div>
				</div>
				{live ? <StatusDot status={live.status} /> : null}
				<CaretRightIcon weight="bold" className="text-faint size-3 flex-none" />
			</div>
		</Link>
	);
}

function SkeletonList() {
	return (
		<div className="bg-surface shadow-card mt-4 overflow-hidden rounded-2xl">
			{[62, 48, 70, 55, 66, 44].map((w, i) => (
				<div key={w} className={cn("ml-4 py-4 pr-4", i && "border-border border-t")}>
					<div className="bg-surface-3 h-3 animate-pulse rounded-full" style={{ width: `${w}%` }} />
					<div className="bg-surface-2 mt-2.5 h-2.5 w-1/3 animate-pulse rounded-full" />
				</div>
			))}
		</div>
	);
}

function EmptyState({ searching }: { searching: boolean }) {
	return (
		<div className="mt-10 px-6 py-12 text-center">
			<p className="text-[17px] font-semibold tracking-[-0.012em]">
				{searching ? "Nothing matches" : "No sessions yet"}
			</p>
			<p className="text-muted-foreground mt-1.5 text-[14px]">
				{searching
					? "Try another word, or clear the project filter."
					: "Sessions you run in Claude Code on this computer show up here."}
			</p>
		</div>
	);
}
