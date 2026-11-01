import { cn } from "@kiteline/ui/lib/utils";
import { Children, isValidElement, memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "./code-block";

function textOf(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
	return "";
}

const components: Components = {
	pre({ children }) {
		const child = Children.toArray(children)[0];
		const props = isValidElement<{ className?: string; children?: ReactNode }>(child) ? child.props : {};
		const lang = /language-([\w+-]+)/.exec(props.className ?? "")?.[1];
		return <CodeBlock code={textOf(props.children).replace(/\n$/, "")} lang={lang} className="my-1" />;
	},
	a({ href, children }) {
		return (
			<a href={href} target="_blank" rel="noreferrer noopener">
				{children}
			</a>
		);
	},
	img({ alt }) {
		return <span className="text-muted-foreground">[image{alt ? `: ${alt}` : ""}]</span>;
	},
};

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
	return (
		<div className={cn("prose-kiteline", className)}>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
				{text}
			</ReactMarkdown>
		</div>
	);
});
