import { Menu as Base } from "@base-ui/react/menu";
import { cn } from "@kiteline/ui/lib/utils";
import { Check } from "lucide-react";
import type * as React from "react";

export const Menu = Base.Root;
export const MenuTrigger = Base.Trigger;

export function MenuContent({
	children,
	className,
	align = "start",
	side = "top",
}: {
	children: React.ReactNode;
	className?: string;
	align?: "start" | "center" | "end";
	side?: "top" | "bottom";
}) {
	return (
		<Base.Portal>
			<Base.Positioner className="z-50 outline-none" sideOffset={8} align={align} side={side}>
				<Base.Popup
					className={cn(
						"elevated border-border-strong bg-popover text-popover-foreground max-h-(--available-height) min-w-56 origin-(--transform-origin) overflow-y-auto rounded-2xl border p-1.5 transition-[scale,opacity] duration-150 ease-out outline-none data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-100 data-starting-style:scale-[0.97] data-starting-style:opacity-0",
						className,
					)}
				>
					{children}
				</Base.Popup>
			</Base.Positioner>
		</Base.Portal>
	);
}

const itemClass =
	"flex min-h-10 cursor-default items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm outline-none select-none data-disabled:opacity-40 data-highlighted:bg-surface-2";

export function MenuItem({ className, ...props }: React.ComponentProps<typeof Base.Item>) {
	return <Base.Item className={cn(itemClass, className)} {...props} />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-faint px-2.5 pt-1.5 pb-1 text-[0.7rem] font-medium tracking-wide uppercase">
			{children}
		</div>
	);
}

export function MenuSeparator() {
	return <Base.Separator className="bg-border mx-1 my-1.5 h-px" />;
}

export function MenuRadioGroup<T extends string>({
	value,
	onValueChange,
	children,
	label,
}: {
	value: T;
	onValueChange: (value: T) => void;
	children: React.ReactNode;
	label?: string;
}) {
	return (
		<Base.Group>
			{label ? (
				<Base.GroupLabel className="text-faint px-2.5 pt-1.5 pb-1 text-[0.7rem] font-medium tracking-wide uppercase">
					{label}
				</Base.GroupLabel>
			) : null}
			<Base.RadioGroup value={value} onValueChange={(v) => onValueChange(v as T)}>
				{children}
			</Base.RadioGroup>
		</Base.Group>
	);
}

export function MenuRadioItem({
	value,
	title,
	description,
	icon,
	tone,
}: {
	value: string;
	title: string;
	description?: string;
	icon?: React.ReactNode;
	tone?: "danger";
}) {
	return (
		<Base.RadioItem value={value} className={cn(itemClass, "items-start")}>
			{icon ? (
				<span className={cn("text-muted-foreground mt-0.5", tone === "danger" && "text-destructive")}>
					{icon}
				</span>
			) : null}
			<span className="min-w-0 flex-1">
				<span className={cn("block font-medium", tone === "danger" && "text-destructive")}>{title}</span>
				{description ? (
					<span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{description}</span>
				) : null}
			</span>
			<Base.RadioItemIndicator className="text-aurora-1 mt-0.5">
				<Check className="size-4" />
			</Base.RadioItemIndicator>
		</Base.RadioItem>
	);
}
