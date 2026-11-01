import type { PermissionModeId } from "@kiteline/api/agent/types";
import { cn } from "@kiteline/ui/lib/utils";
import { ArrowUp, ChevronDown, Cpu, ImagePlus, Square, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { type Attachment, toAttachment } from "@/lib/images";
import { MODELS, MODES, modeInfo, modelLabel } from "@/lib/modes";
import { usePrefs } from "@/lib/prefs";

import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "./menu";

const FALLBACK_COMMANDS = ["compact", "clear", "context", "cost", "init", "review", "memory", "model"];

export type ComposerSubmit = { text: string; images: Attachment[] };

type ComposerProps = {
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
	autoFocus?: boolean;
};

export function Composer({
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
	autoFocus,
}: ComposerProps) {
	const prefs = usePrefs();
	const [text, setText] = useState("");
	const [images, setImages] = useState<Attachment[]>([]);
	const [focused, setFocused] = useState(false);
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
		const all = (slashCommands?.length ? slashCommands : FALLBACK_COMMANDS).map((c) => c.replace(/^\//, ""));
		return [...new Set(all)].filter((c) => c.toLowerCase().includes(commandQuery.toLowerCase())).slice(0, 7);
	}, [commandQuery, slashCommands]);

	const canSend = (text.trim().length > 0 || images.length > 0) && !disabled && !sending;
	const showStop = running && !canSend && !!onStop;

	async function submit() {
		if (!canSend) return;
		const ok = await onSubmit({ text: text.trim(), images });
		if (ok) {
			setText("");
			for (const image of images) URL.revokeObjectURL(image.previewUrl);
			setImages([]);
		}
	}

	function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
			if (commands.length && commandQuery !== undefined) {
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
		const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, 6 - images.length);
		try {
			const next = await Promise.all(picked.map(toAttachment));
			setImages((current) => [...current, ...next]);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't add that image.");
		}
	}

	const modeMeta = modeInfo(mode);
	const ModeIcon = modeMeta.icon;

	return (
		<div className="relative">
			{commands.length ? (
				<div className="elevated border-border-strong bg-popover animate-in fade-in-0 slide-in-from-bottom-1 absolute right-0 bottom-full left-0 mb-2 overflow-hidden rounded-2xl border p-1.5 duration-150">
					{commands.map((command) => (
						<button
							key={command}
							type="button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => {
								setText(`/${command} `);
								textarea.current?.focus();
							}}
							className="hover:bg-surface-2 flex h-10 w-full items-center rounded-xl px-3 text-left font-mono text-[0.8125rem]"
						>
							<span className="text-faint">/</span>
							{command}
						</button>
					))}
				</div>
			) : null}

			<div
				className={cn(
					"elevated bg-surface rounded-[1.6rem] border transition-[border-color,box-shadow] duration-200",
					focused ? "border-border-strong" : "border-border",
				)}
			>
				{images.length ? (
					<div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pt-3">
						{images.map((image) => (
							<div
								key={image.id}
								className="border-border relative size-16 shrink-0 overflow-hidden rounded-xl border"
							>
								<img src={image.previewUrl} alt="" className="size-full object-cover" />
								<button
									type="button"
									aria-label="Remove image"
									onClick={() => {
										URL.revokeObjectURL(image.previewUrl);
										setImages((current) => current.filter((i) => i.id !== image.id));
									}}
									className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
								>
									<X className="size-3" />
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
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					onPaste={(e) => {
						if (e.clipboardData.files.length) {
							e.preventDefault();
							void addFiles(e.clipboardData.files);
						}
					}}
					rows={1}
					placeholder={placeholder}
					disabled={disabled}
					aria-label="Message"
					enterKeyHint={prefs.enterToSend ? "send" : "enter"}
					className="placeholder:text-faint block max-h-[38dvh] min-h-12 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[1rem] leading-relaxed outline-none disabled:opacity-50"
				/>

				<div className="flex items-center gap-1 px-2 pt-1 pb-2">
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
						className="text-muted-foreground hover:bg-surface-2 hover:text-foreground inline-flex size-9 items-center justify-center rounded-full transition-colors"
					>
						<ImagePlus className="size-[1.15rem]" />
					</button>

					<Menu>
						<MenuTrigger
							className={cn(
								"border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground data-popup-open:bg-surface-2 inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
								mode === "bypassPermissions" && "border-destructive/30 text-destructive",
								mode === "plan" && "border-aurora-2/30 text-aurora-2",
							)}
						>
							<ModeIcon className="size-3.5" />
							{modeMeta.short}
							<ChevronDown className="size-3 opacity-60" />
						</MenuTrigger>
						<MenuContent className="w-72">
							<MenuRadioGroup value={mode} onValueChange={onModeChange} label="Permissions">
								{MODES.filter((m) => allowBypass || m.id !== "bypassPermissions").map((m) => (
									<MenuRadioItem
										key={m.id}
										value={m.id}
										title={m.title}
										description={m.description}
										icon={<m.icon className="size-4" />}
										tone={m.id === "bypassPermissions" ? "danger" : undefined}
									/>
								))}
							</MenuRadioGroup>
						</MenuContent>
					</Menu>

					<Menu>
						<MenuTrigger className="border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground data-popup-open:bg-surface-2 inline-flex h-8 max-w-[9rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors">
							<Cpu className="size-3.5 shrink-0" />
							<span className="truncate">{modelLabel(modelInUse ?? model)}</span>
							<ChevronDown className="size-3 shrink-0 opacity-60" />
						</MenuTrigger>
						<MenuContent className="w-64">
							<MenuRadioGroup
								value={model ?? "__default"}
								onValueChange={(v) => onModelChange(v === "__default" ? null : v)}
								label="Model"
							>
								{MODELS.map((m) => (
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

					<div className="ml-auto">
						{showStop ? (
							<button
								type="button"
								aria-label="Stop"
								onClick={onStop}
								className="bg-foreground text-background inline-flex size-9 items-center justify-center rounded-full transition-transform active:scale-95"
							>
								<Square className="size-3.5 fill-current" />
							</button>
						) : (
							<button
								type="button"
								aria-label="Send"
								disabled={!canSend}
								onClick={() => void submit()}
								className={cn(
									"inline-flex size-9 items-center justify-center rounded-full transition-[transform,opacity,background-color] duration-150 active:scale-95",
									canSend
										? "aurora text-[oklch(0.16_0.02_268)] shadow-[0_4px_16px_-4px_color-mix(in_oklch,var(--aurora-2)_70%,transparent)]"
										: "bg-surface-3 text-faint",
								)}
							>
								{sending ? (
									<span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
								) : (
									<ArrowUp className="size-[1.1rem]" strokeWidth={2.5} />
								)}
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
