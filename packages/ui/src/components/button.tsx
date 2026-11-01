import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@kiteline/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
	"group/button focus-visible:ring-ring/60 focus-visible:ring-offset-background relative inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out outline-none select-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
				aurora:
					"aurora text-[oklch(0.16_0.02_268)] shadow-[0_6px_20px_-6px_color-mix(in_oklch,var(--aurora-2)_60%,transparent)] hover:brightness-105",
				outline: "border-border-strong bg-surface hover:bg-surface-2 border",
				secondary: "bg-surface-2 text-foreground hover:bg-surface-3",
				ghost: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
				destructive: "bg-destructive/12 text-destructive hover:bg-destructive/20",
				link: "text-aurora-1 underline-offset-4 hover:underline",
			},
			size: {
				default: "h-10 rounded-xl px-4 text-sm",
				sm: "h-8 rounded-lg px-3 text-[0.8125rem]",
				lg: "h-12 rounded-2xl px-5 text-[0.9375rem]",
				icon: "size-10 rounded-xl",
				"icon-sm": "size-8 rounded-lg",
				"icon-lg": "size-12 rounded-2xl",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
