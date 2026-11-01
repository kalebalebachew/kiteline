import { cn } from "@kiteline/ui/lib/utils";
import { memo, useEffect, useState } from "react";

import { grammarFor, highlight } from "@/lib/highlight";

import { CopyButton } from "./copy-button";

type CodeBlockProps = {
	code: string;
	lang?: string | null;
	/** Shown in the header bar; defaults to the language. */
	label?: string;
	className?: string;
	maxHeight?: string;
	bare?: boolean;
};

export const CodeBlock = memo(function CodeBlock({
	code,
	lang,
	label,
	className,
	maxHeight,
	bare,
}: CodeBlockProps) {
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		if (!lang || !grammarFor(lang)) {
			setHtml(null);
			return;
		}
		// Let streaming text settle before paying for a highlight pass.
		const timer = setTimeout(() => {
			highlight(code, lang)
				.then((out) => {
					if (!cancelled) setHtml(out);
				})
				.catch(() => {});
		}, 120);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [code, lang]);

	const body = html ? (
		// biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output escapes the source text.
		<div className="[&_pre]:m-0 [&_pre]:min-w-max [&_pre]:p-3.5" dangerouslySetInnerHTML={{ __html: html }} />
	) : (
		<pre className="m-0 min-w-max p-3.5">
			<code>{code}</code>
		</pre>
	);

	if (bare) {
		return (
			<div
				className={cn("overflow-auto font-mono text-[0.78rem] leading-relaxed", className)}
				style={{ maxHeight }}
			>
				{body}
			</div>
		);
	}

	return (
		<div className={cn("group/code border-border bg-surface overflow-hidden rounded-xl border", className)}>
			<div className="border-border bg-surface-2/60 flex h-8 items-center justify-between border-b pr-1 pl-3.5">
				<span className="text-faint truncate font-mono text-[0.7rem] tracking-wide lowercase">
					{label ?? lang ?? "text"}
				</span>
				<CopyButton text={code} label="Copy code" />
			</div>
			<div className="overflow-auto font-mono text-[0.78rem] leading-relaxed" style={{ maxHeight }}>
				{body}
			</div>
		</div>
	);
});
