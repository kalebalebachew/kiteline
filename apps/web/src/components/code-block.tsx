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
		<div
			className="[&_pre]:m-0 [&_pre]:min-w-max [&_pre]:px-3.5 [&_pre]:pt-0.5 [&_pre]:pb-3"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output escapes the source text.
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	) : (
		<pre className="m-0 min-w-max px-3.5 pt-0.5 pb-3">
			<code>{code}</code>
		</pre>
	);

	if (bare) {
		return (
			<div
				className={cn("overflow-auto font-mono text-[12.5px] leading-relaxed", className)}
				style={{ maxHeight }}
			>
				{body}
			</div>
		);
	}

	return (
		<div className={cn("group/code bg-surface-2 overflow-hidden rounded-xl", className)}>
			<div className="flex h-8 items-center justify-between pr-1 pl-3.5">
				<span className="text-faint truncate text-[12px]">{label ?? lang ?? "Text"}</span>
				<CopyButton text={code} label="Copy code" />
			</div>
			<div className="overflow-auto font-mono text-[12.5px] leading-relaxed" style={{ maxHeight }}>
				{body}
			</div>
		</div>
	);
});
