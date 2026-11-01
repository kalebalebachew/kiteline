import {
	CheckCircleIcon,
	InfoIcon,
	SpinnerGapIcon,
	WarningCircleIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = (props: ToasterProps) => (
	<Sonner
		className="toaster group"
		icons={{
			success: <CheckCircleIcon weight="fill" className="text-success size-4" />,
			info: <InfoIcon weight="fill" className="text-icon size-4" />,
			warning: <WarningIcon weight="fill" className="text-warning size-4" />,
			error: <WarningCircleIcon weight="fill" className="text-destructive size-4" />,
			loading: <SpinnerGapIcon className="text-icon size-4 animate-spin" />,
		}}
		style={
			{
				"--normal-bg": "var(--raised)",
				"--normal-text": "var(--foreground)",
				"--normal-border": "var(--border)",
				"--border-radius": "12px",
			} as React.CSSProperties
		}
		{...props}
	/>
);

export { Toaster };
