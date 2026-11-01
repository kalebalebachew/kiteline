import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@kiteline/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
	"group/button relative inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-out outline-none select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"bg-foreground text-background hover:bg-foreground/88 disabled:bg-surface-3 disabled:text-faint disabled:opacity-100",
				brand: "bg-brand hover:bg-brand/90 text-white",
				secondary:
					"bg-surface-2 text-foreground hover:bg-surface-3 dark:bg-surface-3 dark:hover:bg-[#333337]",
				outline: "bg-surface text-foreground shadow-card hover:bg-surface-2",
				ghost: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
				destructive: "bg-destructive-soft text-destructive hover:bg-destructive/15",
				link: "text-brand-text underline-offset-4 hover:underline",
			},
			size: {
				default: "h-10 rounded-[10px] px-4 text-[14px]",
				sm: "h-8 rounded-lg px-3 text-[13px]",
				lg: "h-12 rounded-xl px-5 text-[15px]",
				icon: "size-10 rounded-[10px]",
				"icon-sm": "size-8 rounded-lg",
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
