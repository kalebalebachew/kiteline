import { Button } from "@kiteline/ui/components/button";

import { KiteMark } from "./brand";

export function Splash() {
	return (
		<div className="flex min-h-dvh items-center justify-center">
			<KiteMark live className="text-icon size-9" />
		</div>
	);
}

export function Offline({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
			<KiteMark className="text-faint size-10" />
			<h1 className="mt-5 text-[20px] font-semibold tracking-[-0.02em]">Can't reach your computer</h1>
			<p className="text-muted-foreground mt-1.5 max-w-xs text-[14px] leading-relaxed">
				Check that Kiteline is still running there, and that Tailscale is on on this phone.
			</p>
			<Button variant="secondary" className="mt-6" onClick={onRetry}>
				Try again
			</Button>
		</div>
	);
}
