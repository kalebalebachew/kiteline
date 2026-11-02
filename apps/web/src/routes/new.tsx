import type { AgentProvider, EffortChoice, PermissionModeId } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import {
	CaretLeftIcon,
	CheckIcon,
	FolderOpenIcon,
	FolderSimpleIcon,
	MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Composer, type ComposerSubmit } from "@/components/composer";
import { EffortSheet } from "@/components/effort-sheet";
import { FolderPicker } from "@/components/folder-picker";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/menu";
import { describeChoice, isEffortLevel } from "@/lib/effort";
import { baseName, relativeTime, tildify } from "@/lib/format";
import { modelLabel } from "@/lib/modes";
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

	const [provider, setProvider] = useState<AgentProvider>("claude");
	const [cwd, setCwd] = useState<string | null>(null);
	const selected = cwd ?? projects[0]?.cwd ?? null;
	const [picking, setPicking] = useState(false);
	const [mode, setMode] = useState<PermissionModeId>(prefs.permissionMode);
	const [model, setModel] = useState<string | null>(prefs.model);

	// A level picked here starts the session at it; until then, it's where Claude Code would start.
	const [effortOpen, setEffortOpen] = useState(false);
	const [pendingEffort, setPendingEffort] = useState<EffortChoice | null>(null);
	const startingEffort = useQuery(
		orpc.runs.effortFor.queryOptions({
			input: { cwd: selected, model, provider },
			enabled: !!selected,
			staleTime: 30_000,
		}),
	);
	const effortLevel = pendingEffort
		? (pendingEffort.level ?? startingEffort.data?.modelDefault ?? null)
		: (startingEffort.data?.effort ?? null);
	const effortLevels = startingEffort.data?.levels ?? null;
	const effortModel = modelLabel(startingEffort.data?.model ?? model);

	const chooseEffort = async (choice: EffortChoice) => {
		const selectedChoice = { ...choice, persist: provider === "claude" && choice.persist };
		setPendingEffort(selectedChoice);
		const { title, description } = describeChoice(selectedChoice, {
			levels: effortLevels,
			modelName: effortModel,
			modelDefault: startingEffort.data?.modelDefault,
			later: true,
		});
		toast.success(title, description ? { description } : undefined);
	};

	const onLocalCommand = (name: string, args: string) => {
		if (name !== "effort") return false;
		const word = args.toLowerCase();
		if (!word) setEffortOpen(true);
		else if (word === "auto" || word === "unset") void chooseEffort({ level: null, persist: false });
		else if (isEffortLevel(word)) void chooseEffort({ level: word, persist: true });
		else return false;
		return true;
	};

	const left = useRef(false);
	useEffect(
		() => () => {
			left.current = true;
		},
		[],
	);

	const start = useMutation({
		mutationFn: (value: ComposerSubmit) => {
			if (!selected) throw new Error("Pick a folder first.");
			return client.runs.send({
				cwd: selected,
				provider,
				text: value.text,
				images: value.images.map(({ mediaType, data }) => ({ mediaType, data })),
				permissionMode: mode,
				model,
				effort: pendingEffort ?? undefined,
			});
		},
		onSuccess: ({ sessionId }) => {
			if (selected) rememberProject(selected);
			// If you've already left this page, don't pull you into the session.
			if (!left.current) void navigate({ to: "/s/$sessionId", params: { sessionId }, replace: true });
		},
	});

	const rows = [
		...projects,
		...(cwd && !projects.some((p) => p.cwd === cwd) ? [{ cwd, lastModified: null as number | null }] : []),
	];

	return (
		<div className="flex min-h-dvh flex-col">
			<header className="pt-safe sticky top-0 z-30">
				<div className="mx-auto flex h-14 max-w-2xl items-center px-2">
					<button
						type="button"
						aria-label="Back"
						onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/" }))}
						className="text-icon hover:bg-surface-2 hover:text-foreground inline-flex size-10 items-center justify-center rounded-full transition-colors"
					>
						<CaretLeftIcon weight="bold" className="size-[18px]" />
					</button>
				</div>
			</header>

			<main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-6">
				<h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em]">New session</h1>
				<p className="text-muted-foreground mt-1 text-[15px]">
					Pick a project on {system.data?.hostname ?? "your computer"}, then say what you need.
				</p>

				<div className="mt-6">
					<Menu>
						<MenuTrigger className="bg-surface-2 text-foreground rounded-full px-4 py-2 text-[14px] font-medium">
							Agent: {provider === "codex" ? "Codex" : "Claude Code"}
						</MenuTrigger>
						<MenuContent className="w-64">
							<MenuRadioGroup
								value={provider}
								label="Agent"
								onValueChange={(next: AgentProvider) => {
									setProvider(next);
									setModel(null);
									setMode("default");
									setPendingEffort(null);
								}}
							>
								<MenuRadioItem value="claude" title="Claude Code" description="Uses your Claude Code login" />
								<MenuRadioItem value="codex" title="Codex" description="Uses your local Codex CLI login" />
							</MenuRadioGroup>
						</MenuContent>
					</Menu>
				</div>

				{provider === "codex" && startingEffort.error ? (
					<p role="alert" className="text-destructive mt-3 text-[13px]">
						{startingEffort.error.message}
					</p>
				) : null}
				<h2 className="text-muted-foreground mt-7 mb-2 px-1 text-[13px] font-medium">Project</h2>
				<div className="bg-surface shadow-card overflow-hidden rounded-2xl">
					{rows.map((project, i) => {
						const active = project.cwd === selected;
						return (
							<button
								key={project.cwd}
								type="button"
								onClick={() => setCwd(project.cwd)}
								className="active:bg-surface-2 flex w-full items-center gap-3 pl-4 text-left transition-colors"
							>
								<FolderSimpleIcon
									weight="fill"
									className={cn("size-[18px] flex-none", active ? "text-brand" : "text-icon")}
								/>
								<span
									className={cn(
										"flex min-w-0 flex-1 items-center gap-3 py-3 pr-4",
										i && "border-border border-t",
									)}
								>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-[15px] leading-snug font-medium">
											{baseName(project.cwd)}
										</span>
										<span className="text-muted-foreground mt-0.5 block truncate text-[13px]">
											{tildify(project.cwd)}
											{project.lastModified ? ` · ${relativeTime(project.lastModified)}` : ""}
										</span>
									</span>
									{active ? <CheckIcon weight="bold" className="text-brand size-4 flex-none" /> : null}
								</span>
							</button>
						);
					})}
					<button
						type="button"
						onClick={() => setPicking(true)}
						className="active:bg-surface-2 flex w-full items-center gap-3 pl-4 text-left transition-colors"
					>
						{rows.length ? (
							<FolderOpenIcon weight="fill" className="text-icon size-[18px] flex-none" />
						) : (
							<MagnifyingGlassIcon weight="bold" className="text-icon size-[18px] flex-none" />
						)}
						<span
							className={cn(
								"text-muted-foreground flex-1 py-3.5 pr-4 text-[15px] font-medium",
								rows.length > 0 && "border-border border-t",
							)}
						>
							Browse folders…
						</span>
					</button>
				</div>
			</main>

			<div className="from-background via-background to-background/0 sticky bottom-0 z-20 bg-gradient-to-t via-70% pt-8">
				<div className="mx-auto w-full max-w-2xl px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
					<Composer
						provider={provider}
						autoFocus
						draftKey="new"
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
							selected
								? `What should ${provider === "codex" ? "Codex" : "Claude Code"} do?`
								: "Pick a folder first"
						}
						mode={mode}
						onModeChange={(m) => {
							setMode(m);
							if (provider === "claude") setPrefs({ permissionMode: m });
						}}
						allowBypass={system.data?.allowBypass ?? true}
						model={model}
						effort={{ level: effortLevel, levels: effortLevels, onOpen: () => setEffortOpen(true) }}
						onLocalCommand={onLocalCommand}
						onModelChange={(m) => {
							setModel(m);
							if (provider === "claude") setPrefs({ model: m });
						}}
					/>
				</div>
			</div>

			<EffortSheet
				persistDefault={provider === "claude"}
				open={effortOpen}
				onOpenChange={setEffortOpen}
				current={effortLevel}
				levels={effortLevels}
				modelName={effortModel}
				onChoose={chooseEffort}
			/>
			<FolderPicker open={picking} onOpenChange={setPicking} start={selected} onPick={setCwd} />
		</div>
	);
}
