import {
	CaretDownIcon,
	CheckIcon,
	CopyIcon,
	InfoIcon,
	LightbulbIcon,
	LinkSimpleIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useId, useState } from "react";

import { ManagerSwitch } from "../manager-switch";
import { everyManager, type Manager, useManager } from "../pm";

/** A heading's anchor: shows on hover, and a click copies the section's link. */
function Anchor({ id }: { id: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<a
			href={`#${id}`}
			className="doc-anchor"
			aria-label="Copy a link to this section"
			onClick={() => {
				const url = `${location.origin}${location.pathname}#${id}`;
				void navigator.clipboard?.writeText(url).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1200);
				});
			}}
		>
			{copied ? <CheckIcon weight="bold" /> : <LinkSimpleIcon weight="bold" />}
		</a>
	);
}

/** One section of the page: a numbered-free h2 with an anchor, a lead, and its content. */
export function Section({
	id,
	title,
	lead,
	children,
}: {
	id: string;
	title: string;
	lead?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="doc-section" aria-labelledby={id}>
			<h2 id={id} className="doc-h2">
				{title}
				<Anchor id={id} />
			</h2>
			{lead ? <p className="doc-lead">{lead}</p> : null}
			{children}
		</section>
	);
}

export function H3({ id, children }: { id: string; children: string }) {
	return (
		<h3 id={id} className="doc-h3">
			{children}
			<Anchor id={id} />
		</h3>
	);
}

/** Numbered steps joined by a hairline. */
export function Steps({ children }: { children: ReactNode }) {
	return <ol className="doc-steps">{children}</ol>;
}

export function Step({ title, children }: { title: string; children?: ReactNode }) {
	return (
		<li className="doc-step">
			<h4>{title}</h4>
			{children}
		</li>
	);
}

const TONES = {
	tip: { icon: LightbulbIcon, label: "Tip" },
	note: { icon: InfoIcon, label: "Note" },
	warn: { icon: WarningIcon, label: "Careful" },
} as const;

export function Callout({ tone = "note", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
	const { icon: ToneIcon, label } = TONES[tone];
	return (
		<aside className={`doc-callout doc-callout--${tone}`} data-label={label}>
			<ToneIcon weight="fill" className="doc-callout__icon" />
			<div>{children}</div>
		</aside>
	);
}

/**
 * A code block with a label and a copy button. Lines starting with "#" are comments, shown dimmed
 * and left out of what's copied, as is any trailing "# comment".
 */
/**
 * A block of commands to copy. With `pm`, the commands come in npm, pnpm and bun, switched by tabs in
 * its caption; the choice holds for every block on the site.
 */
export function Code({
	code: fixed = "",
	label = "Terminal",
	pm,
}: {
	code?: string;
	label?: string;
	pm?: (manager: Manager) => string;
}) {
	const [copied, setCopied] = useState(false);
	const [manager] = useManager();
	const code = pm ? pm(manager) : fixed;
	const runnable = code
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("#"))
		.map((line) => line.replace(/\s+#\s.*$/, ""))
		.join("\n");
	return (
		<figure className="doc-code" data-code={pm ? everyManager(pm) : code} data-label={label}>
			<figcaption>
				{pm ? <ManagerSwitch className="doc-code__pm" /> : <span>{label}</span>}
				<button
					type="button"
					aria-label={copied ? "Copied" : "Copy"}
					onClick={() => {
						void navigator.clipboard?.writeText(runnable).then(() => {
							setCopied(true);
							setTimeout(() => setCopied(false), 1400);
						});
					}}
				>
					{copied ? <CheckIcon weight="bold" /> : <CopyIcon weight="fill" />}
					{copied ? "Copied" : "Copy"}
				</button>
			</figcaption>
			<pre>
				<code>
					{code.split("\n").map((line, i) => {
						const comment = line.match(/^(\s*)(#.*)$/) ?? line.match(/^(.*?\S)(\s+#\s.*)$/);
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: lines of fixed text.
							<span key={i} className="doc-code__line">
								{comment ? (
									<>
										{comment[1]}
										<span className="doc-code__comment">{comment[2]}</span>
									</>
								) : (
									line || " "
								)}
							</span>
						);
					})}
				</code>
			</pre>
		</figure>
	);
}

export function Kbd({ children }: { children: ReactNode }) {
	return <kbd className="doc-kbd">{children}</kbd>;
}

/** Tabs for instructions that differ by device. Plain buttons with the ARIA tab pattern. */
export function Tabs({ tabs }: { tabs: { label: string; content: ReactNode }[] }) {
	const [active, setActive] = useState(0);
	const id = useId();
	return (
		<div className="doc-tabs">
			<div className="doc-tabs__list" role="tablist">
				{tabs.map((tab, i) => (
					<button
						key={tab.label}
						type="button"
						role="tab"
						id={`${id}-tab-${i}`}
						aria-selected={active === i}
						aria-controls={`${id}-panel-${i}`}
						tabIndex={active === i ? 0 : -1}
						onClick={() => setActive(i)}
						onKeyDown={(e) => {
							if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
							const next = (active + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
							setActive(next);
							document.getElementById(`${id}-tab-${next}`)?.focus();
						}}
					>
						{tab.label}
					</button>
				))}
			</div>
			{tabs.map((tab, i) => (
				<div
					key={tab.label}
					role="tabpanel"
					id={`${id}-panel-${i}`}
					aria-labelledby={`${id}-tab-${i}`}
					hidden={active !== i}
					className="doc-tabs__panel"
					data-tab={tab.label}
				>
					{tab.content}
				</div>
			))}
		</div>
	);
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
	return (
		<div className="doc-table">
			<table>
				<thead>
					<tr>
						{head.map((cell) => (
							<th key={cell}>{cell}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, r) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: rows of fixed content.
						<tr key={r}>
							{row.map((cell, c) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: cells of a fixed row.
								<td key={c}>{cell}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/** A question or problem that opens to its answer. */
export function Details({ id, summary, children }: { id?: string; summary: string; children: ReactNode }) {
	return (
		<details className="doc-details" id={id}>
			<summary>
				<span>{summary}</span>
				<CaretDownIcon weight="bold" className="doc-details__caret" />
			</summary>
			<div className="doc-details__body">{children}</div>
		</details>
	);
}

/** A figure that draws part of the product; `alt` stands in for it when the page is copied as text. */
export function Figure({
	alt,
	caption,
	children,
}: {
	alt: string;
	caption?: ReactNode;
	children: ReactNode;
}) {
	return (
		<figure className="doc-figure" data-alt={alt}>
			<div className="doc-figure__art" role="img" aria-label={alt}>
				{children}
			</div>
			{caption ? <figcaption>{caption}</figcaption> : null}
		</figure>
	);
}
