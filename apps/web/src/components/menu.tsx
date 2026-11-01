import { Menu as Base } from "@base-ui/react/menu";
import { cn } from "@kiteline/ui/lib/utils";
import { CheckIcon } from "@phosphor-icons/react";
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
			<Base.Positioner className="z-50 outline-none" sideOffset={6} align={align} side={side}>
				<Base.Popup
					className={cn(
						"bg-raised text-foreground shadow-float max-h-(--available-height) min-w-56 origin-(--transform-origin) overflow-y-auto rounded-xl p-1 transition-[scale,opacity] duration-150 ease-out outline-none data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-100 data-starting-style:scale-[0.97] data-starting-style:opacity-0",
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
	"flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] outline-none select-none data-disabled:opacity-40 data-highlighted:bg-surface-2";

export function MenuItem({ className, ...props }: React.ComponentProps<typeof Base.Item>) {
	return <Base.Item className={cn(itemClass, className)} {...props} />;
}

export function MenuSeparator() {
	return <Base.Separator className="bg-border mx-2.5 my-1 h-px" />;
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
				<Base.GroupLabel className="text-faint px-2.5 pt-1.5 pb-1 text-[12px] font-medium">
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
				<span className={cn("text-icon mt-px flex-none", tone === "danger" && "text-destructive")}>
					{icon}
				</span>
			) : null}
			<span className="min-w-0 flex-1">
				<span className={cn("block leading-snug font-medium", tone === "danger" && "text-destructive")}>
					{title}
				</span>
				{description ? (
					<span className="text-muted-foreground mt-0.5 block text-[13px] leading-snug">{description}</span>
				) : null}
			</span>
			<Base.RadioItemIndicator className="text-brand mt-0.5 flex-none">
				<CheckIcon weight="bold" className="size-4" />
			</Base.RadioItemIndicator>
		</Base.RadioItem>
	);
}
