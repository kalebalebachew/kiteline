import type { PermissionModeId } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Check, ChevronLeft, FolderClosed, FolderOpen, FolderSearch } from "lucide-react";
import { useMemo, useState } from "react";

import { Composer, type ComposerSubmit } from "@/components/composer";
import { FolderPicker } from "@/components/folder-picker";
import { baseName, relativeTime, tildify } from "@/lib/format";
import { client, orpc } from "@/lib/orpc";
import { rememberProject, setPrefs, usePrefs } from "@/lib/prefs";

export const Route = createFileRoute("/new")({
	component: NewSession,
});

function NewSession() {
	const router = useRouter();
	const navigate = useNavigate();
	const prefs = usePrefs();
	const system = useQuery(orpc.system.info.queryOptions({ staleTime: 5 * 60_000 }));
	const sessions = useQuery(orpc.sessions.list.queryOptions({ input: { limit: 200 }, staleTime: 15_000 }));

	const projects = useMemo(() => {
		const latest = new Map<string, number>();
		for (const s of sessions.data ?? []) {
			if (s.cwd && !latest.has(s.cwd)) latest.set(s.cwd, s.lastModified);
		}
		const ordered = [...prefs.recentProjects, ...latest.keys()];
		return [...new Set(ordered)].slice(0, 8).map((cwd) => ({ cwd, lastModified: latest.get(cwd) ?? null }));
	}, [sessions.data, prefs.recentProjects]);

	const [cwd, setCwd] = useState<string | null>(null);
	const selected = cwd ?? projects[0]?.cwd ?? null;
	const [picking, setPicking] = useState(false);
	const [mode, setMode] = useState<PermissionModeId>(prefs.permissionMode);
	const [model, setModel] = useState<string | null>(prefs.model);

	const start = useMutation({
		mutationFn: (value: ComposerSubmit) => {
			if (!selected) throw new Error("Pick a folder first.");
			return client.runs.send({
				cwd: selected,
				text: value.text,
				images: value.images.map(({ mediaType, data }) => ({ mediaType, data })),
				permissionMode: mode,
				model,
			});
		},
		onSuccess: ({ sessionId }) => {
			if (selected) rememberProject(selected);
			void navigate({ to: "/s/$sessionId", params: { sessionId }, replace: true });
		},
	});

	return (
		<div className="relative flex min-h-dvh flex-col">
			<div className="halo pointer-events-none absolute inset-x-0 top-0 h-72" />
			<header className="pt-safe sticky top-0 z-30">
				<div className="mx-auto flex h-14 max-w-2xl items-center px-2">
					<button
						type="button"
						aria-label="Back"
						onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/" }))}
						className="text-muted-foreground hover:bg-surface-2 hover:text-foreground inline-flex size-10 items-center justify-center rounded-full"
					>
						<ChevronLeft className="size-5" />
					</button>
				</div>
			</header>

			<main className="relative mx-auto w-full max-w-2xl flex-1 px-4 pb-6">
				<h1 className="font-display text-[2.5rem] leading-[1.04] tracking-tight">
					What are we
					<br />
					<span className="italic">building?</span>
				</h1>
				<p className="text-muted-foreground mt-2 text-[0.9375rem]">
					Pick a project on {system.data?.hostname ?? "your computer"}, then say what you need.
				</p>

				<h2 className="text-faint mt-8 mb-2 px-1 text-[0.72rem] font-medium tracking-[0.08em] uppercase">
					Project
				</h2>
				<div className="border-border bg-surface overflow-hidden rounded-2xl border">
					{projects.map((project, i) => {
						const active = project.cwd === selected;
						return (
							<button
								key={project.cwd}
								type="button"
								onClick={() => setCwd(project.cwd)}
								className={cn(
									"flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
									i && "border-border border-t",
									active ? "bg-aurora-1/8" : "active:bg-surface-2",
								)}
							>
								<span
									className={cn(
										"inline-flex size-9 shrink-0 items-center justify-center rounded-xl border",
										active
											? "aurora border-transparent text-[oklch(0.16_0.02_268)]"
											: "border-border text-faint",
									)}
								>
									<FolderClosed className="size-4" />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-[0.9375rem] font-medium">{baseName(project.cwd)}</span>
									<span className="text-muted-foreground block truncate text-xs">
										{tildify(project.cwd)}
										{project.lastModified ? ` · ${relativeTime(project.lastModified)}` : ""}
									</span>
								</span>
								{active ? <Check className="text-aurora-1 size-4 shrink-0" /> : null}
							</button>
						);
					})}
					{cwd && !projects.some((p) => p.cwd === cwd) ? (
						<div className="border-border bg-aurora-1/8 flex items-center gap-3 border-t px-4 py-3">
							<span className="aurora inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-[oklch(0.16_0.02_268)]">
								<FolderOpen className="size-4" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-[0.9375rem] font-medium">{baseName(cwd)}</span>
								<span className="text-muted-foreground block truncate text-xs">{tildify(cwd)}</span>
							</span>
							<Check className="text-aurora-1 size-4 shrink-0" />
						</div>
					) : null}
					<button
						type="button"
						onClick={() => setPicking(true)}
						className={cn(
							"text-muted-foreground active:bg-surface-2 flex w-full items-center gap-3 px-4 py-3 text-left text-[0.9375rem] font-medium",
							(projects.length > 0 || cwd) && "border-border border-t",
						)}
					>
						<span className="border-border-strong inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-dashed">
							<FolderSearch className="size-4" />
						</span>
						Browse folders…
					</button>
				</div>
			</main>

			<div className="from-background via-background to-background/0 sticky bottom-0 z-20 bg-gradient-to-t pt-6">
				<div className="mx-auto w-full max-w-2xl px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
					<Composer
						autoFocus
						onSubmit={async (value) => {
							try {
								await start.mutateAsync(value);
								return true;
							} catch {
								return false;
							}
						}}
						sending={start.isPending}
						disabled={!selected}
						placeholder={
							selected ? `What should Claude Code do in ${baseName(selected)}?` : "Pick a folder first"
						}
						mode={mode}
						onModeChange={(m) => {
							setMode(m);
							setPrefs({ permissionMode: m });
						}}
						allowBypass={system.data?.allowBypass ?? true}
						model={model}
						onModelChange={(m) => {
							setModel(m);
							setPrefs({ model: m });
						}}
					/>
				</div>
			</div>

			<FolderPicker open={picking} onOpenChange={setPicking} start={selected} onPick={setCwd} />
		</div>
	);
}
