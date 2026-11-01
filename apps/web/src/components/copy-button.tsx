import { cn } from "@kiteline/ui/lib/utils";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";

/** The Clipboard API needs a secure context; plain-HTTP access falls back to execCommand. */
export async function copyText(text: string) {
	try {
		if (window.isSecureContext && navigator.clipboard) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// Fall through to the legacy path.
	}
	const area = document.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.style.position = "fixed";
	area.style.opacity = "0";
	document.body.append(area);
	area.select();
	const ok = document.execCommand("copy");
	area.remove();
	return ok;
}

export function CopyButton({
	text,
	label = "Copy",
	className,
}: {
	text: string;
	label?: string;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			aria-label={copied ? "Copied" : label}
			className={cn(
				"text-icon hover:bg-surface-3 hover:text-foreground inline-flex size-7 flex-none items-center justify-center rounded-md transition-colors",
				className,
			)}
			onClick={async (event) => {
				event.stopPropagation();
				if (await copyText(text)) {
					setCopied(true);
					setTimeout(() => setCopied(false), 1400);
				}
			}}
		>
			{copied ? (
				<CheckIcon weight="bold" className="text-success size-3.5" />
			) : (
				<CopyIcon weight="fill" className="size-3.5" />
			)}
		</button>
	);
}
