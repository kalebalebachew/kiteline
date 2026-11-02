import type { EffortChoice } from "@kiteline/api/agent/types";
import { Button } from "@kiteline/ui/components/button";
import { Sheet } from "@kiteline/ui/components/sheet";
import { cn } from "@kiteline/ui/lib/utils";
import { CpuIcon, WarningIcon } from "@phosphor-icons/react";
import { type CSSProperties, type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { EFFORT, EFFORT_LEVELS, type EffortLevel, fitLevel, MAX_WARNING } from "@/lib/effort";
import { errorMessage } from "@/lib/orpc";

type Props = {
	persistDefault?: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The level the session runs at now, or will start at. */
	current: EffortLevel | null;
	/** The levels the model offers; null while unknown, which shows all five. */
	levels: EffortLevel[] | null;
	/** The model as a person reads it: "Opus 5.5". */
	modelName: string | null;
	onChoose: (choice: EffortChoice) => Promise<void>;
};

/** Where the slider rests when the sheet opens: the current level, or high when that's unknown. */
function startIndex(current: EffortLevel | null, offered: readonly EffortLevel[]) {
	const at = offered.indexOf(fitLevel(current ?? "high", offered));
	return at === -1 ? Math.max(0, offered.indexOf("high")) : at;
}

/** Stands in for a button's label while the choice is on its way. */
function Sending() {
	return <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

/**
 * `/effort` on a phone: Claude Code's slider from Faster to Smarter. Set is the terminal's Enter: this
 * session, and the default for new sessions on the model too. Max is only ever for this session.
 */
export function EffortSheet({
	open,
	onOpenChange,
	current,
	levels,
	modelName,
	onChoose,
	persistDefault = true,
}: Props) {
	const offered = levels ?? EFFORT_LEVELS;
	const [index, setIndex] = useState(() => startIndex(current, offered));
	const [busy, setBusy] = useState<"set" | "session" | null>(null);
	const slider = useRef<HTMLDivElement>(null);

	// Every opening starts from where the session is now.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only on opening, not while it's open.
	useEffect(() => {
		if (!open) return;
		setIndex(startIndex(current, offered));
		setBusy(null);
		// With a keyboard, arrows work straight away, as in the terminal.
		if (!window.matchMedia("(pointer: coarse)").matches) requestAnimationFrame(() => slider.current?.focus());
	}, [open]);

	const level = offered[Math.min(index, offered.length - 1)] ?? "high";
	const takesNone = levels !== null && levels.length === 0;

	const choose = async (persist: boolean) => {
		if (busy) return;
		setBusy(persist ? "set" : "session");
		try {
			await onChoose({ level, persist });
			onOpenChange(false);
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setBusy(null);
		}
	};

	const footer = takesNone ? (
		<Button variant="secondary" size="lg" className="w-full" onClick={() => onOpenChange(false)}>
			Close
		</Button>
	) : (
		<div className="space-y-2.5">
			<div className="flex gap-2">
				{persistDefault && level !== "max" ? (
					<Button
						variant="secondary"
						size="lg"
						className="flex-1"
						disabled={!!busy}
						onClick={() => void choose(false)}
					>
						{busy === "session" ? <Sending /> : "This session only"}
					</Button>
				) : null}
				<Button
					size="lg"
					className="flex-[1.3]"
					disabled={!!busy}
					onClick={() => void choose(persistDefault)}
				>
					{busy ? <Sending /> : `Set to ${level}`}
				</Button>
			</div>
			<p className="text-faint text-center text-[12px] leading-snug">
				{!persistDefault
					? "Applies from the next turn in this session."
					: level === "max"
						? "Max lasts for this session only."
						: `Set also makes ${level} your default for new ${modelName ? `${modelName} ` : ""}sessions.`}
			</p>
		</div>
	);

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={
				<span className="flex items-center justify-between gap-3">
					<span>Effort</span>
					{modelName ? (
						<span className="bg-surface-2 text-muted-foreground inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium tracking-normal">
							<CpuIcon weight="fill" className="size-3.5" />
							{modelName}
						</span>
					) : null}
				</span>
			}
			footer={footer}
		>
			{takesNone ? (
				<p className="text-muted-foreground bg-surface-2 rounded-xl px-3.5 py-3 text-[14px] leading-snug">
					{modelName ?? "This model"} doesn't take an effort level. Switch to another model to choose one.
				</p>
			) : (
				<>
					{/* Above the slider: the sheet grows upward from its foot, so max's longer note never
					    moves the slider out from under a finger. */}
					<div className="bg-surface-2 mb-6 min-h-[5.25rem] rounded-xl px-3.5 py-3">
						<div className="flex items-center gap-2">
							<span className={cn("text-[14px] leading-tight font-semibold", EFFORT[level].text)}>
								{level}
							</span>
							{level === current ? (
								<span className="bg-surface-3 text-muted-foreground rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium">
									Current
								</span>
							) : null}
						</div>
						<p className="text-muted-foreground mt-1 text-[13.5px] leading-snug">
							{EFFORT[level].description}
						</p>
						{level === "max" ? (
							<p className="text-warning mt-1.5 flex gap-1.5 text-[13px] leading-snug">
								<WarningIcon weight="fill" className="mt-px size-3.5 flex-none" />
								{MAX_WARNING}
							</p>
						) : null}
					</div>
					<EffortSlider
						ref={slider}
						levels={offered}
						index={index}
						onIndex={setIndex}
						onConfirm={() => void choose(true)}
						onSessionOnly={() => level !== "max" && void choose(false)}
					/>
				</>
			)}
		</Sheet>
	);
}

const EDGE = 22;

/** The track's x for stop `i` of `count`, inset so the end labels fit under their stops. */
function stopLeft(i: number, count: number) {
	const frac = count > 1 ? i / (count - 1) : 0;
	return `calc(${EDGE}px + (100% - ${EDGE * 2}px) * ${frac})`;
}

function EffortSlider({
	ref,
	levels,
	index,
	onIndex,
	onConfirm,
	onSessionOnly,
}: {
	ref: React.Ref<HTMLDivElement>;
	levels: readonly EffortLevel[];
	index: number;
	onIndex: (index: number) => void;
	onConfirm: () => void;
	onSessionOnly: () => void;
}) {
	const area = useRef<HTMLDivElement>(null);
	const dragging = useRef(false);
	const last = levels.length - 1;
	const level = levels[index] ?? "high";
	const fill = stopLeft(index, levels.length);

	const pick = (clientX: number) => {
		const box = area.current?.getBoundingClientRect();
		if (!box) return;
		const frac = (clientX - box.left - EDGE) / Math.max(1, box.width - EDGE * 2);
		const next = Math.round(Math.min(1, Math.max(0, frac)) * last);
		if (next !== index) {
			onIndex(next);
			// A detent you can feel, where the phone allows it.
			if (dragging.current) navigator.vibrate?.(4);
		}
	};

	return (
		<div className="pt-1">
			<div className="text-faint mb-2 flex justify-between px-2.5 text-[12px] font-medium">
				<span>Faster</span>
				<span>Smarter</span>
			</div>
			<div
				ref={(node) => {
					area.current = node;
					if (typeof ref === "function") ref(node);
					else if (ref) ref.current = node;
				}}
				role="slider"
				tabIndex={0}
				aria-label="Effort"
				aria-valuemin={0}
				aria-valuemax={last}
				aria-valuenow={index}
				aria-valuetext={level}
				onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
					dragging.current = true;
					e.currentTarget.setPointerCapture(e.pointerId);
					pick(e.clientX);
				}}
				onPointerMove={(e) => dragging.current && pick(e.clientX)}
				onPointerUp={() => {
					dragging.current = false;
				}}
				onPointerCancel={() => {
					dragging.current = false;
				}}
				onKeyDown={(e) => {
					const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
					if (step) onIndex(Math.min(last, Math.max(0, index + step)));
					else if (e.key === "Home") onIndex(0);
					else if (e.key === "End") onIndex(last);
					else if (e.key === "Enter") onConfirm();
					else if (e.key === "s") onSessionOnly();
					else return;
					e.preventDefault();
				}}
				className="focus-visible:ring-ring/50 relative cursor-pointer touch-none rounded-xl outline-none select-none focus-visible:ring-2"
			>
				<div className="relative h-8">
					<span
						className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-black/[0.08] dark:bg-white/[0.12]"
						style={{ left: EDGE, right: EDGE }}
					/>
					<span
						className={cn(
							"absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-[width,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
							level === "max" && "effort-rainbow-fill",
						)}
						style={{
							left: EDGE,
							width: `calc(${fill} - ${EDGE}px)`,
							...(level === "max" ? {} : { backgroundColor: fillColor(level) }),
						}}
					/>
					{levels.map((stop, i) => (
						<span
							key={stop}
							className={cn(
								"absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-300",
								i <= index ? "bg-white/85" : "bg-black/20 dark:bg-white/25",
							)}
							style={{ left: stopLeft(i, levels.length) }}
						/>
					))}
					<span
						className="absolute top-1/2 inline-flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.18),0_1px_1px_rgba(0,0,0,0.06)] transition-[left] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
						style={{ left: fill }}
					>
						<span
							className={cn(
								"size-2.5 rounded-full transition-colors duration-300",
								level === "max" && "effort-rainbow-fill",
							)}
							style={level === "max" ? undefined : { backgroundColor: fillColor(level) }}
						/>
					</span>
				</div>
				<div className="relative mt-2 h-5">
					{levels.map((stop, i) => (
						<span
							key={stop}
							className={cn(
								"absolute top-0 -translate-x-1/2 text-[13px] leading-5 whitespace-nowrap transition-colors duration-200",
								i === index ? cn("font-semibold", EFFORT[stop].text) : "text-muted-foreground",
							)}
							style={{ left: stopLeft(i, levels.length) }}
						>
							{stop}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

function fillColor(level: EffortLevel) {
	return level === "high" ? "var(--brand)" : `var(--effort-${level})`;
}

/**
 * The effort chip's mark: five bars rising like a signal, lit up to the level in its color, all five
 * in the rainbow for max.
 */
export function EffortGlyph({ level, className }: { level: EffortLevel | null; className?: string }) {
	const id = useId();
	const lit = level ? EFFORT_LEVELS.indexOf(level) : -1;
	const paint = level === "max" ? `url(#${id})` : level ? fillColor(level) : "currentColor";
	return (
		<svg viewBox="0 0 14 14" aria-hidden="true" className={className}>
			{level === "max" ? (
				<defs>
					<linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
						<stop offset="0" stopColor="#e5484d" />
						<stop offset="0.3" stopColor="#ec6a0c" />
						<stop offset="0.55" stopColor="#23a35a" />
						<stop offset="0.8" stopColor="#0a84ff" />
						<stop offset="1" stopColor="#7c5cff" />
					</linearGradient>
				</defs>
			) : null}
			{[0, 1, 2, 3, 4].map((i) => {
				const height = 4 + i * 2.25;
				return (
					<rect
						key={i}
						x={i * 2.9}
						y={13 - height}
						width={2.1}
						height={height}
						rx={1.05}
						style={{ fill: i <= lit ? paint : "currentColor", opacity: i <= lit ? 1 : 0.28 } as CSSProperties}
					/>
				);
			})}
		</svg>
	);
}
