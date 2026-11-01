import { KiteMark } from "./brand";

export function Splash() {
	return (
		<div className="flex min-h-dvh items-center justify-center">
			<KiteMark live className="animate-breathe size-10" />
		</div>
	);
}

export function Offline({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
			<KiteMark className="size-12 opacity-50 grayscale" />
			<div>
				<h1 className="font-display text-3xl tracking-tight">Can't reach your computer</h1>
				<p className="text-muted-foreground mt-2 text-sm leading-relaxed">
					Check that Kiteline is still running there and that this phone is on the same network or tailnet.
				</p>
			</div>
			<button
				type="button"
				onClick={onRetry}
				className="border-border-strong hover:bg-surface-2 h-10 rounded-xl border px-4 text-sm font-medium"
			>
				Try again
			</button>
		</div>
	);
}
