import {
	ArrowRightIcon,
	ArrowUpIcon,
	CheckIcon,
	GithubLogoIcon,
	ListIcon,
	MagnifyingGlassIcon,
	MarkdownLogoIcon,
	PencilSimpleIcon,
	PowerIcon,
	QrCodeIcon,
	RocketLaunchIcon,
	ShieldCheckIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { ScrollBar } from "../scrollbar";
import { Content } from "./content";
import { toMarkdown } from "./markdown";
import { NAV } from "./nav";
import { buildIndex, type Entry, Search } from "./search";

import "./docs.css";

const REPO = "https://github.com/sifenfisaha/kiteline";
const base = import.meta.env.BASE_URL;

const QUICK = [
	{
		id: "install",
		icon: RocketLaunchIcon,
		title: "Quick start",
		body: "Install it and start it in four commands.",
	},
	{ id: "pair", icon: QrCodeIcon, title: "Pair your phone", body: "One scan, and your phone is in." },
	{
		id: "approve",
		icon: ShieldCheckIcon,
		title: "Approve from anywhere",
		body: "Allow, deny, or always allow.",
	},
	{ id: "always-on", icon: PowerIcon, title: "Run it always", body: "Start at boot, survive a closed lid." },
];

/** Which section (h2) and subsection (h3) the reader is in: the last heading above the top bar. */
function useReading(article: React.RefObject<HTMLElement | null>) {
	const [at, setAt] = useState({ section: NAV[0]?.items[0]?.id ?? "", sub: "" });
	useEffect(() => {
		const root = article.current;
		if (!root) return;
		let frame = 0;
		const measure = () => {
			frame = 0;
			const line = 120;
			let section = "";
			let sub = "";
			for (const h of root.querySelectorAll<HTMLElement>("h2, h3")) {
				if (h.getBoundingClientRect().top > line) break;
				if (h.tagName === "H2") {
					section = h.id;
					sub = "";
				} else sub = h.id;
			}
			// At the very bottom the last section may never reach the line; it still counts as read.
			if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
				const last = [...root.querySelectorAll<HTMLElement>("h2")].at(-1);
				if (last) section = last.id;
			}
			setAt((prev) =>
				prev.section === (section || prev.section) && prev.sub === sub
					? prev
					: { section: section || (NAV[0]?.items[0]?.id ?? ""), sub },
			);
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};
		measure();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
			cancelAnimationFrame(frame);
		};
	}, [article]);
	return at;
}

function CopyPage({ article }: { article: React.RefObject<HTMLElement | null> }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			className="docs-action"
			onClick={() => {
				if (!article.current) return;
				void navigator.clipboard?.writeText(`# Kiteline docs\n\n${toMarkdown(article.current)}`).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1600);
				});
			}}
		>
			{copied ? <CheckIcon weight="bold" /> : <MarkdownLogoIcon weight="fill" />}
			{copied ? "Copied" : "Copy page as Markdown"}
		</button>
	);
}

export function Docs() {
	const article = useRef<HTMLElement>(null);
	const reading = useReading(article);
	const [index, setIndex] = useState<Entry[]>([]);
	const [searching, setSearching] = useState(false);
	const [menu, setMenu] = useState(false);
	const [subs, setSubs] = useState<Record<string, { id: string; title: string }[]>>({});

	useEffect(() => {
		const root = article.current;
		if (!root) return;
		setIndex(buildIndex(root));
		const map: Record<string, { id: string; title: string }[]> = {};
		for (const section of root.querySelectorAll(".doc-section")) {
			const h2 = section.querySelector("h2");
			if (!h2) continue;
			map[h2.id] = [...section.querySelectorAll("h3")].map((h3) => ({
				id: h3.id,
				title: h3.textContent ?? "",
			}));
		}
		setSubs(map);
		// Opening the page at #anchor: land on it once the layout is settled.
		if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
	}, []);

	// ⌘K, Ctrl+K or / opens search, as on most docs sites.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
			if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
				e.preventDefault();
				setSearching(true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	useEffect(() => {
		document.documentElement.classList.toggle("docs-locked", menu || searching);
	}, [menu, searching]);

	const groupNow = NAV.find((g) => g.items.some((i) => i.id === reading.section));
	const sectionNow = groupNow?.items.find((i) => i.id === reading.section);
	const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

	return (
		<>
			<header className="docs-top">
				<div className="docs-top__inner">
					<a className="docs-brand" href={base}>
						Kiteline
					</a>
					<span className="docs-brand__slash">/</span>
					<a className="docs-brand__docs" href="#top">
						Docs
					</a>
					<button type="button" className="docs-search-trigger" onClick={() => setSearching(true)}>
						<MagnifyingGlassIcon weight="bold" />
						<span>Search</span>
						<kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
					</button>
					<nav className="docs-top__links" aria-label="Site">
						<a href={base}>Home</a>
						<a href={REPO}>
							<GithubLogoIcon weight="fill" />
							GitHub
						</a>
					</nav>
					<button
						type="button"
						className="docs-icon-button docs-only-narrow"
						aria-label="Search"
						onClick={() => setSearching(true)}
					>
						<MagnifyingGlassIcon weight="bold" />
					</button>
					<button
						type="button"
						className="docs-icon-button docs-only-narrow"
						aria-label={menu ? "Close the menu" : "Open the menu"}
						aria-expanded={menu}
						onClick={() => setMenu((m) => !m)}
					>
						{menu ? <XIcon weight="bold" /> : <ListIcon weight="bold" />}
					</button>
				</div>
				{/* Narrow screens: where you are, under the bar. */}
				<button type="button" className="docs-crumb" onClick={() => setMenu(true)}>
					<span>{groupNow?.group}</span>
					<ArrowRightIcon weight="bold" />
					<b>{sectionNow?.title}</b>
				</button>
			</header>

			<div className="docs-banner" id="top">
				<img
					className="docs-banner__sky"
					src={`${base}sky-2400.webp`}
					srcSet={`${base}sky-1200.webp 1200w, ${base}sky-2400.webp 2400w`}
					sizes="100vw"
					alt=""
				/>
				<div className="docs-banner__inner">
					<p className="docs-banner__eyebrow">Kiteline docs</p>
					<h1>Everything you need to drive Claude Code from your phone.</h1>
					<button type="button" className="docs-banner__search" onClick={() => setSearching(true)}>
						<MagnifyingGlassIcon weight="bold" />
						<span>Search the docs</span>
						<kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
					</button>
				</div>
			</div>

			<nav className="docs-quick" aria-label="Start here">
				{QUICK.map(({ id, icon: QuickIcon, title, body }) => (
					<a key={id} className="docs-quick__card" href={`#${id}`}>
						<span className="docs-quick__icon">
							<QuickIcon weight="fill" />
						</span>
						<span className="docs-quick__text">
							<b>{title}</b>
							<span>{body}</span>
						</span>
						<ArrowRightIcon weight="bold" className="docs-quick__arrow" />
					</a>
				))}
			</nav>

			<div className="docs-layout">
				<nav className="docs-side" data-open={menu || undefined} aria-label="Sections">
					{NAV.map(({ group, items }) => (
						<div key={group} className="docs-side__group">
							<p>{group}</p>
							<ul>
								{items.map(({ id, title }) => (
									<li key={id}>
										<a
											href={`#${id}`}
											aria-current={reading.section === id ? "location" : undefined}
											onClick={() => setMenu(false)}
										>
											{title}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}
				</nav>
				{menu ? (
					<button
						type="button"
						className="docs-scrim"
						aria-label="Close the menu"
						onClick={() => setMenu(false)}
					/>
				) : null}

				<main className="docs-article" ref={article}>
					<Content />
				</main>

				<aside className="docs-toc" aria-label="On this page">
					<p>{sectionNow?.title}</p>
					{subs[reading.section]?.length ? (
						<ul>
							{subs[reading.section]?.map(({ id, title }) => (
								<li key={id}>
									<a href={`#${id}`} aria-current={reading.sub === id ? "location" : undefined}>
										{title}
									</a>
								</li>
							))}
						</ul>
					) : null}
					<div className="docs-toc__actions">
						<CopyPage article={article} />
						<a className="docs-action" href={`${REPO}/edit/master/apps/site/src/docs/content.tsx`}>
							<PencilSimpleIcon weight="fill" />
							Suggest an edit
						</a>
						<a className="docs-action" href="#top">
							<ArrowUpIcon weight="bold" />
							Back to top
						</a>
					</div>
				</aside>
			</div>

			<footer className="footer">
				<p>MIT licensed. An independent project, not made by or affiliated with Anthropic.</p>
			</footer>

			{searching ? <Search index={index} onClose={() => setSearching(false)} /> : null}
			<ScrollBar lightOver=".docs-banner" />
		</>
	);
}
