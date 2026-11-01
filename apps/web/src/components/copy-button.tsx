import { cn } from "@kiteline/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Clipboard API needs a secure context; plain-HTTP LAN access falls back to execCommand. */
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
				"text-faint hover:bg-surface-3 hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-colors",
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
			{copied ? <Check className="text-success size-3.5" /> : <Copy className="size-3.5" />}
		</button>
	);
}
