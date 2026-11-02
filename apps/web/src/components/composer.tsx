import type { AgentProvider, PermissionModeId } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import { ArrowUpIcon, ImageSquareIcon, StopIcon, XIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { EffortLevel } from "@/lib/effort";
import { type Attachment, toAttachment } from "@/lib/images";
import { MODELS, MODES, modeInfo, modelLabel } from "@/lib/modes";
import { orpc } from "@/lib/orpc";
import { usePrefs } from "@/lib/prefs";

import { EffortGlyph } from "./effort-sheet";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "./menu";

const FALLBACK_COMMANDS = ["compact", "clear", "context", "cost", "init", "review", "memory", "model"];
/** Commands Kiteline answers itself, so they're offered whatever Claude Code lists. */
const LOCAL_COMMANDS = ["effort"];
const MAX_IMAGES = 6;

/** Unsent text, kept per conversation on this device so leaving the page or a reload doesn't lose it. */
function readDraft(key: string | undefined) {
	if (!key) return "";
	try {
		return localStorage.getItem(`kiteline:draft:${key}`) ?? "";
	} catch {
		return "";
	}
}
function writeDraft(key: string | undefined, text: string) {
	if (!key) return;
	try {
		if (text) localStorage.setItem(`kiteline:draft:${key}`, text);
		else localStorage.removeItem(`kiteline:draft:${key}`);
	} catch {}
}

export type ComposerSubmit = { text: string; images: Attachment[] };

type ComposerProps = {
	provider?: AgentProvider;
	onSubmit: (value: ComposerSubmit) => Promise<boolean> | boolean;
	onStop?: () => void;
	running?: boolean;
	sending?: boolean;
	disabled?: boolean;
	placeholder?: string;
	slashCommands?: string[];
	mode: PermissionModeId;
	onModeChange: (mode: PermissionModeId) => void;
	allowBypass?: boolean;
	model: string | null;
	modelInUse?: string | null;
	onModelChange: (model: string | null) => void;
	/** The effort chip: the level and the levels the model offers. Tapping it opens the effort sheet. */
	effort?: { level: EffortLevel | null; levels: EffortLevel[] | null; onOpen: () => void };
	/** Commands Kiteline answers itself, like /effort. True means it was handled here, not sent. */
	onLocalCommand?: (name: string, args: string) => boolean;
	autoFocus?: boolean;
	/** Where to keep the unsent draft, e.g. the session id. */
	draftKey?: string;
};

export function Composer({
	provider = "claude",
	onSubmit,
	onStop,
	running,
	sending,
	disabled,
	placeholder = "Ask Claude Code…",
	slashCommands,
	mode,
	onModeChange,
	allowBypass = true,
	model,
	modelInUse,
	onModelChange,
	effort,
	onLocalCommand,
	autoFocus,
	draftKey,
}: ComposerProps) {
	const prefs = usePrefs();
	const catalog = useQuery(
		orpc.runs.models.queryOptions({
			input: { provider },
			enabled: provider === "codex",
			staleTime: 60_000,
		}),
	);
	const models =
		provider === "codex"
			? [{ id: null, title: "Default", description: "Your Codex settings" }, ...(catalog.data ?? [])]
			: MODELS;
	const modes =
		provider === "codex"
			? MODES.filter((entry) => ["default", "acceptEdits", "bypassPermissions"].includes(entry.id)).map(
					(entry) => ({
						...entry,
						description:
							entry.id === "default"
								? "Read-only sandbox. Codex asks to run outside it."
								: entry.id === "acceptEdits"
									? "Writes in this project. Asks for access outside the sandbox."
									: entry.description,
					}),
				)
			: MODES;
	const [text, setText] = useState(() => readDraft(draftKey));
	useEffect(() => writeDraft(draftKey, text), [draftKey, text]);
	const [images, setImages] = useState<Attachment[]>([]);
	const textarea = useRef<HTMLTextAreaElement>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the text changes.
	useLayoutEffect(() => {
		const el = textarea.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.38))}px`;
	}, [text]);

	useEffect(() => {
		if (autoFocus && !window.matchMedia("(pointer: coarse)").matches) textarea.current?.focus();
	}, [autoFocus]);

	const commandQuery = /^\/([\w:-]*)$/.exec(text)?.[1];
	const commands = useMemo(() => {
		if (commandQuery === undefined) return [];
		const all = [
			...(provider === "codex" ? [] : slashCommands?.length ? slashCommands : FALLBACK_COMMANDS),
			...LOCAL_COMMANDS,
		].map((c) => c.replace(/^\//, ""));
		return [...new Set(all)].filter((c) => c.toLowerCase().includes(commandQuery.toLowerCase())).slice(0, 7);
	}, [commandQuery, slashCommands, provider]);

	const empty = !text.trim() && !images.length;
	const canSend = !empty && !disabled && !sending;
	// Stop only with nothing to send and nothing sending, so a second tap on Send never lands on Stop.
	const showStop = running && !!onStop && empty && !sending;

	async function submit() {
		if (!canSend) return;
		// /effort and friends open here instead of going to Claude Code.
		const command = images.length ? null : /^\/([\w:-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
		if (command?.[1] && onLocalCommand?.(command[1], command[2]?.trim() ?? "")) {
			setText("");
			return;
		}
		const sent = { text: text.trim(), images };
		const ok = await onSubmit(sent);
		if (ok) {
			// Keep anything typed or added while it was sending.
			setText((current) => (current.trim() === sent.text ? "" : current));
			for (const image of sent.images) URL.revokeObjectURL(image.previewUrl);
			setImages((current) => current.filter((image) => !sent.images.includes(image)));
		}
	}

	function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		// Enter that confirms a candidate in a Chinese, Japanese or Korean keyboard isn't a send; Safari
		// reports it with keyCode 229 rather than isComposing.
		if (event.nativeEvent.isComposing || event.keyCode === 229) return;
		if (event.key === "Enter" && !event.shiftKey) {
			// Enter completes a command; once it's typed in full, Enter runs it, as in the terminal.
			if (commands.length && commandQuery !== undefined && !commands.includes(commandQuery)) {
				event.preventDefault();
				setText(`/${commands[0]} `);
				return;
			}
			if (prefs.enterToSend || event.metaKey || event.ctrlKey) {
				event.preventDefault();
				void submit();
			}
		}
	}

	async function addFiles(files: FileList | null) {
		if (!files?.length) return;
		const all = [...files].filter((f) => f.type.startsWith("image/"));
		const picked = all.slice(0, Math.max(0, MAX_IMAGES - images.length));
		if (picked.length < all.length) toast(`You can send up to ${MAX_IMAGES} images at a time.`);
		try {
			const next = await Promise.all(picked.map(toAttachment));
			// Two quick picks can both count on the same free room; keep the limit either way.
			setImages((current) => {
				const kept = [...current, ...next].slice(0, MAX_IMAGES);
				for (const image of next) if (!kept.includes(image)) URL.revokeObjectURL(image.previewUrl);
				return kept;
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't add that image.");
		}
	}

	const modeMeta = modeInfo(mode);
	const ModeIcon = modeMeta.icon;

	return (
		<div className="relative">
			{commands.length ? (
				<div className="bg-raised shadow-float animate-in fade-in-0 slide-in-from-bottom-1 absolute right-0 bottom-full left-0 mb-2 overflow-hidden rounded-xl p-1 duration-150">
					{commands.map((command) => (
						<button
							key={command}
							type="button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => {
								setText(`/${command} `);
								textarea.current?.focus();
							}}
							className="hover:bg-surface-2 flex h-9 w-full items-center rounded-lg px-2.5 text-left font-mono text-[13px]"
						>
							<span className="text-faint">/</span>
							{command}
						</button>
					))}
				</div>
			) : null}

			<div className="bg-surface shadow-float rounded-[22px]">
				{images.length ? (
					<div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pt-3">
						{images.map((image) => (
							<div
								key={image.id}
								className="bg-surface-2 relative size-16 flex-none overflow-hidden rounded-xl"
							>
								<img src={image.previewUrl} alt="" className="size-full object-cover" />
								<button
									type="button"
									aria-label="Remove image"
									onClick={() => {
										URL.revokeObjectURL(image.previewUrl);
										setImages((current) => current.filter((i) => i.id !== image.id));
									}}
									className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
								>
									<XIcon weight="bold" className="size-3" />
								</button>
							</div>
						))}
					</div>
				) : null}

				<textarea
					ref={textarea}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={onKeyDown}
					onPaste={(e) => {
						// Rich text often carries a picture of itself too; then the text is what was meant.
						if (e.clipboardData.files.length && !e.clipboardData.getData("text/plain")) {
							e.preventDefault();
							void addFiles(e.clipboardData.files);
						}
					}}
					rows={1}
					placeholder={placeholder}
					disabled={disabled}
					aria-label="Message"
					enterKeyHint={prefs.enterToSend ? "send" : "enter"}
					className="placeholder:text-faint block max-h-[38dvh] min-h-12 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[16px] leading-relaxed outline-none focus-visible:outline-none disabled:opacity-50"
				/>

				<div className="@container flex items-center gap-1 px-2.5 pt-1 pb-2.5">
					<input
						ref={fileInput}
						type="file"
						accept="image/*"
						multiple
						hidden
						onChange={(e) => {
							void addFiles(e.target.files);
							e.target.value = "";
						}}
					/>
					<button
						type="button"
						aria-label="Attach images"
						onClick={() => fileInput.current?.click()}
						className="text-icon hover:bg-surface-2 hover:text-foreground inline-flex size-8 flex-none items-center justify-center rounded-full transition-colors"
					>
						<ImageSquareIcon className="size-[18px]" />
					</button>

					<Menu>
						<MenuTrigger
							className={cn(
								"bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground data-popup-open:bg-surface-3 inline-flex h-8 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
								mode === "bypassPermissions" && "bg-destructive-soft text-destructive",
								mode === "plan" && "bg-brand-soft text-brand-text",
							)}
						>
							<ModeIcon weight="fill" className="size-3.5" />
							<span className="trim">{modeMeta.short}</span>
						</MenuTrigger>
						<MenuContent className="w-72">
							<MenuRadioGroup value={mode} onValueChange={onModeChange} label="Permissions">
								{modes
									.filter((m) => allowBypass || m.id !== "bypassPermissions")
									.map((m) => (
										<MenuRadioItem
											key={m.id}
											value={m.id}
											title={m.title}
											description={m.description}
											icon={<m.icon weight="fill" className="size-4" />}
											tone={m.id === "bypassPermissions" ? "danger" : undefined}
										/>
									))}
							</MenuRadioGroup>
						</MenuContent>
					</Menu>

					<Menu>
						<MenuTrigger className="bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground data-popup-open:bg-surface-3 inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors">
							<span className="trim overflow-x-clip text-ellipsis whitespace-nowrap">
								{modelLabel(modelInUse ?? model)}
							</span>
						</MenuTrigger>
						<MenuContent className="w-64">
							<MenuRadioGroup
								value={model ?? "__default"}
								onValueChange={(v) => onModelChange(v === "__default" ? null : v)}
								label="Model"
							>
								{models.map((m) => (
									<MenuRadioItem
										key={m.title}
										value={m.id ?? "__default"}
										title={m.title}
										description={m.description}
									/>
								))}
							</MenuRadioGroup>
						</MenuContent>
					</Menu>

					{effort && effort.levels?.length !== 0 ? (
						<button
							type="button"
							onClick={effort.onOpen}
							aria-label={`Effort: ${effort.level ?? "auto"}. Change it`}
							className="bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground inline-flex h-8 flex-none items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors @[21rem]:pr-3"
						>
							<EffortGlyph level={effort.level} className="size-3.5 flex-none" />
							{/* On the narrowest phones the bars say it alone, so the model keeps its name. */}
							<span className="trim hidden @[21rem]:inline">{effort.level ?? "auto"}</span>
						</button>
					) : null}

					<div className="ml-auto flex-none">
						{showStop ? (
							<button
								type="button"
								aria-label="Stop"
								onClick={onStop}
								className="bg-foreground text-background inline-flex size-9 items-center justify-center rounded-full transition-transform active:scale-95"
							>
								<StopIcon weight="fill" className="size-3.5" />
							</button>
						) : (
							<button
								type="button"
								aria-label="Send"
								disabled={!canSend}
								onClick={() => void submit()}
								className={cn(
									"inline-flex size-9 items-center justify-center rounded-full transition-[transform,background-color,color] duration-150 active:scale-95",
									canSend ? "bg-foreground text-background" : "bg-surface-2 text-faint",
								)}
							>
								{sending ? (
									<span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
								) : (
									<ArrowUpIcon weight="bold" className="size-4" />
								)}
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
