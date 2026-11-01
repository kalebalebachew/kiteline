import { cn } from "@kiteline/ui/lib/utils";
import { useId } from "react";

/**
 * Kiteline's mark: a kite on its line. The kite pivots on the point where the
 * line meets it, so `live` can let it sway without the line moving.
 */
export function KiteMark({ className, live = false }: { className?: string; live?: boolean }) {
	const id = useId();
	return (
		<svg viewBox="0 0 64 64" className={cn("size-7", className)} aria-hidden="true">
			<defs>
				<linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="var(--aurora-1)" />
					<stop offset="1" stopColor="var(--aurora-2)" />
				</linearGradient>
			</defs>
			<path
				d="M27.2 42C22.5 47.5 21 50.5 17 53S11 56.5 9.5 58.5"
				fill="none"
				stroke="var(--aurora-2)"
				strokeOpacity="0.75"
				strokeWidth="2.2"
				strokeLinecap="round"
			/>
			<g className={cn(live && "animate-sway [transform-origin:27.2px_42px] [transform-box:view-box]")}>
				<g transform="translate(41.5 21.5) rotate(35)">
					<path d="M0-17 14-5 0 25-14-5Z" fill={`url(#${id}-g)`} />
					<path d="M0-17-14-5H0Z" fill="white" fillOpacity="0.22" />
					<path d="M14-5 0 25V-5Z" fill="black" fillOpacity="0.1" />
					<path
						d="M0-13.5V21M-10.5-5H10.5"
						fill="none"
						stroke="var(--background)"
						strokeOpacity="0.7"
						strokeWidth="1.3"
						strokeLinecap="round"
					/>
				</g>
			</g>
		</svg>
	);
}

export function Wordmark({ className }: { className?: string }) {
	return (
		<span className={cn("inline-flex items-center gap-2", className)}>
			<KiteMark />
			<span className="font-display text-[1.6rem] leading-none tracking-tight italic">Kiteline</span>
		</span>
	);
}
