import { ArrowElbowDownLeftIcon, HashIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { GROUP_OF } from "./nav";

export type Entry = { id: string; title: string; trail: string; text: string };

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Every section and subsection of the page, with the words under it, read from the page itself. */
export function buildIndex(article: HTMLElement): Entry[] {
	const entries: Entry[] = [];
	for (const section of article.querySelectorAll<HTMLElement>(".doc-section")) {
		const h2 = section.querySelector("h2");
		if (!h2) continue;
		const sectionTitle = squash(h2.textContent ?? "");
		entries.push({
			id: h2.id,
			title: sectionTitle,
			trail: GROUP_OF[h2.id] ?? "",
			text: squash(section.textContent ?? "").slice(sectionTitle.length),
		});
		for (const h3 of section.querySelectorAll("h3")) {
			let words = "";
			for (let el = h3.nextElementSibling; el && !/^H[23]$/.test(el.tagName); el = el.nextElementSibling) {
				words += ` ${el.textContent ?? ""}`;
			}
			entries.push({
				id: h3.id,
				title: squash(h3.textContent ?? ""),
				trail: sectionTitle,
				text: squash(words),
			});
		}
	}
	return entries;
}

const START = ["install", "pair", "approve", "anywhere", "troubleshooting"];

function excerpt(text: string, terms: string[]) {
	const lower = text.toLowerCase();
	const at = Math.max(
		0,
		...terms
			.map((t) => lower.indexOf(t))
			.filter((i) => i >= 0)
			.slice(0, 1),
	);
	const from = Math.max(0, at - 40);
	const slice = `${from > 0 ? "…" : ""}${text.slice(from, from + 120)}…`;
	if (!terms.length) return slice;
	const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
	return slice.split(re).map((part, i) =>
		i % 2 ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: pieces of one string, in order.
			<mark key={i}>{part}</mark>
		) : (
			part
		),
	);
}

export function Search({ index, onClose }: { index: Entry[]; onClose: () => void }) {
	const [query, setQuery] = useState("");
	const [cursor, setCursor] = useState(0);
	const list = useRef<HTMLDivElement>(null);
	const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);

	const results = useMemo(() => {
		if (!terms.length)
			return START.map((id) => index.find((e) => e.id === id)).filter((e): e is Entry => !!e);
		return index
			.map((entry) => {
				const title = entry.title.toLowerCase();
				const body = entry.text.toLowerCase();
				if (!terms.every((t) => title.includes(t) || body.includes(t))) return null;
				const score = terms.reduce(
					(sum, t) => sum + (title.includes(t) ? 10 : 0) + (title.startsWith(t) ? 5 : 0),
					0,
				);
				return { entry, score };
			})
			.filter((r): r is { entry: Entry; score: number } => !!r)
			.sort((a, b) => b.score - a.score)
			.slice(0, 8)
			.map((r) => r.entry);
	}, [index, terms]);

	useEffect(() => setCursor(0), [query]);
	useEffect(() => {
		list.current?.querySelector(`[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
	}, [cursor]);

	const go = (entry: Entry) => {
		onClose();
		history.replaceState(null, "", `#${entry.id}`);
		document.getElementById(entry.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		<div className="search">
			{/* The dimmed page behind the panel: a click there closes search. Esc does too. */}
			<button
				type="button"
				className="search__scrim"
				tabIndex={-1}
				aria-label="Close search"
				onClick={onClose}
			/>
			<div className="search__panel" role="dialog" aria-modal="true" aria-label="Search the docs">
				<label className="search__field">
					<MagnifyingGlassIcon weight="bold" />
					<input
						// biome-ignore lint/a11y/noAutofocus: the palette exists to be typed into.
						autoFocus
						value={query}
						placeholder="Search the docs"
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") onClose();
							if (e.key === "ArrowDown") {
								e.preventDefault();
								setCursor((c) => Math.min(c + 1, results.length - 1));
							}
							if (e.key === "ArrowUp") {
								e.preventDefault();
								setCursor((c) => Math.max(c - 1, 0));
							}
							if (e.key === "Enter" && results[cursor]) go(results[cursor]);
						}}
						aria-controls="search-results"
						aria-activedescendant={results[cursor] ? `result-${results[cursor].id}` : undefined}
					/>
					<button type="button" className="search__esc" onClick={onClose}>
						Esc
					</button>
				</label>
				{results.length ? (
					<>
						{!terms.length ? <p className="search__hint">Start here</p> : null}
						<div className="search__results" id="search-results" ref={list} role="listbox">
							{results.map((entry, i) => (
								<div
									key={entry.id}
									id={`result-${entry.id}`}
									data-i={i}
									role="option"
									tabIndex={-1}
									aria-selected={i === cursor}
									onMouseMove={() => setCursor(i)}
									onClick={() => go(entry)}
									onKeyDown={(e) => e.key === "Enter" && go(entry)}
								>
									<HashIcon weight="bold" className="search__icon" />
									<span className="search__text">
										<span className="search__title">
											{entry.title}
											<span className="search__trail">{entry.trail}</span>
										</span>
										<span className="search__excerpt">{excerpt(entry.text, terms)}</span>
									</span>
									<ArrowElbowDownLeftIcon weight="bold" className="search__enter" />
								</div>
							))}
						</div>
					</>
				) : (
					<p className="search__empty">Nothing matches “{query}”. Try “pair”, “Tailscale” or “approve”.</p>
				)}
			</div>
		</div>
	);
}
