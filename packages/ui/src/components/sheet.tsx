import { Drawer } from "@base-ui/react/drawer";
import { cn } from "@kiteline/ui/lib/utils";
import type * as React from "react";

type SheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: React.ReactNode;
	description?: React.ReactNode;
	/** Shown above the title, e.g. who is asking. */
	eyebrow?: React.ReactNode;
	children?: React.ReactNode;
	footer?: React.ReactNode;
	className?: string;
	/** When false, tapping outside does not close it. Swipe and Escape still do. */
	dismissible?: boolean;
};

/** A bottom sheet with swipe-to-dismiss, built on Base UI's Drawer. */
export function Sheet({
	open,
	onOpenChange,
	title,
	description,
	eyebrow,
	children,
	footer,
	className,
	dismissible = true,
}: SheetProps) {
	return (
		<Drawer.Root open={open} onOpenChange={onOpenChange} disablePointerDismissal={!dismissible}>
			<Drawer.Portal>
				<Drawer.Backdrop className="fixed inset-0 min-h-dvh bg-black opacity-[calc(var(--backdrop-opacity)*(1-var(--drawer-swipe-progress)))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] [--backdrop-opacity:0.18] data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute dark:[--backdrop-opacity:0.55]" />
				<Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
					<Drawer.Popup
						className={cn(
							"bg-raised text-foreground shadow-float -mb-12 flex max-h-[calc(90dvh+3rem)] w-full max-w-xl [transform:translateY(var(--drawer-swipe-movement-y))] flex-col overflow-hidden rounded-t-[20px] pb-12 transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] outline-none data-ending-style:[transform:translateY(calc(100%-3rem+2px))] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-starting-style:[transform:translateY(calc(100%-3rem+2px))] data-swiping:select-none sm:mb-[calc(1.5rem-3rem)] sm:rounded-b-[20px]",
							className,
						)}
					>
						<div className="bg-surface-3 mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full" />
						<div className="shrink-0 px-5 pt-4 pb-3">
							{eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
							<Drawer.Title className="text-[17px] leading-snug font-semibold tracking-[-0.012em]">
								{title}
							</Drawer.Title>
							{description ? (
								<Drawer.Description className="text-muted-foreground mt-1 text-[14px] leading-relaxed">
									{description}
								</Drawer.Description>
							) : null}
						</div>
						<Drawer.Content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
							{children}
						</Drawer.Content>
						{footer ? (
							<div className="shrink-0 px-5 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">{footer}</div>
						) : null}
					</Drawer.Popup>
				</Drawer.Viewport>
			</Drawer.Portal>
		</Drawer.Root>
	);
}
