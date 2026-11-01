import { cn } from "@kiteline/ui/lib/utils";

/**
 * Kiteline's mark: a kite on its line, in one ink. The kite pivots where the
 * line meets it, so `live` can let it sway without the line moving.
 */
export function KiteMark({ className, live = false }: { className?: string; live?: boolean }) {
	return (
		<svg viewBox="0 0 64 64" className={cn("text-foreground size-6", className)} aria-hidden="true">
			<path
				d="M27.2 42C22.5 47.5 21 50.5 17 53S11 56.5 9.5 58.5"
				fill="none"
				stroke="currentColor"
				strokeOpacity="0.45"
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
			<g className={cn(live && "animate-sway [transform-origin:27.2px_42px] [transform-box:view-box]")}>
				<g transform="translate(41.5 21.5) rotate(35)">
					<path d="M0-17 14-5 0 25-14-5Z" fill="currentColor" />
					<path d="M0-17-14-5H0Z" fill="var(--background)" fillOpacity="0.18" />
					<path
						d="M0-13.5V21M-10.5-5H10.5"
						fill="none"
						stroke="var(--background)"
						strokeOpacity="0.55"
						strokeWidth="1.4"
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
			<KiteMark className="size-[22px]" />
			<span className="text-[17px] font-semibold tracking-[-0.02em]">Kiteline</span>
		</span>
	);
}
