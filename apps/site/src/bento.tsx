import {
	CaretDownIcon,
	CheckIcon,
	ClipboardTextIcon,
	CpuIcon,
	DeviceMobileIcon,
	FileTextIcon,
	FolderSimpleIcon,
	HandIcon,
	LockSimpleIcon,
	PencilSimpleLineIcon,
	ShieldCheckIcon,
	TerminalWindowIcon,
} from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useRef } from "react";

import { KiteMark } from "./mark";
import { usePlayOnce } from "./play-once";

import "./bento.css";

/**
 * One tile: copy on top, a picture under it. A tile with motion plays it once, the first time it
 * scrolls into view.
 */
function Tile({
	kind,
	copy,
	children,
	motion = false,
}: {
	kind: string;
	copy: ReactNode;
	children: ReactNode;
	motion?: boolean;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const state = usePlayOnce(ref, motion);

	return (
		<div ref={ref} className={`tile tile--${kind}`} data-motion={state}>
			<p className="tile__copy">{copy}</p>
			<div className="tile__art" aria-hidden="true">
				{children}
			</div>
		</div>
	);
}

const delay = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;

/** The reply, word by word; each word's place sets when it streams in. */
const REPLY = "Uploads are now limited to 10 a minute, and all 42 tests pass."
	.split(" ")
	.map((word, at) => ({ word, at }));

function LiveSession() {
	return (
		<div className="live">
			<div className="live__head">
				<span className="live__title">Add rate limiting to uploads</span>
				<span className="live__project">api</span>
			</div>
			<ol className="live__steps">
				<li className="step rise" style={delay(0.15)}>
					<span className="step__icon">
						<FileTextIcon weight="fill" />
					</span>
					<span className="step__verb">Read</span>
					<span className="step__target">2 files</span>
				</li>
				<li className="step step--diff rise" style={delay(0.6)}>
					<span className="step__icon">
						<PencilSimpleLineIcon weight="fill" />
					</span>
					<span className="step__verb">Edited</span>
					<span className="step__target step__target--mono">src/routes/upload.ts</span>
					<span className="step__meta step__meta--add">+1</span>
					<div className="diff">
						<div className="diff__line">
							<span className="diff__n">12</span>
							<span className="diff__sign" />
							<code>export const upload = route()</code>
						</div>
						<div className="diff__line diff__line--add">
							<span className="diff__n">13</span>
							<span className="diff__sign">+</span>
							<code>{'  .use(rateLimit("10/min"))'}</code>
						</div>
						<div className="diff__line">
							<span className="diff__n">14</span>
							<span className="diff__sign" />
							<code>{"  .post(async (c) => {"}</code>
						</div>
					</div>
				</li>
				<li className="step rise" style={delay(1.15)}>
					<span className="step__icon">
						<TerminalWindowIcon weight="fill" />
					</span>
					<span className="step__verb">Ran</span>
					<span className="step__target step__target--mono">pnpm test</span>
					<span className="step__meta step__meta--swap">
						<span className="step__running">
							<span className="spinner" />
							Running
						</span>
						<span className="step__passed">
							<CheckIcon weight="bold" />
							42 passed
						</span>
					</span>
				</li>
			</ol>
			<p className="live__reply">
				{REPLY.map(({ word, at }) => (
					<span key={at} className="word" style={{ "--i": at } as CSSProperties}>
						{word}{" "}
					</span>
				))}
			</p>
		</div>
	);
}

/** A home screen in glass, its dock running off the foot; the Kiteline icon is the only real one. */
function HomeScreen() {
	const slots = Array.from({ length: 8 }, (_, i) => i);
	return (
		<>
			<svg className="tile__clouds" viewBox="0 0 400 480" preserveAspectRatio="none" aria-hidden="true">
				<filter id="tile-clouds" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.004 0.016" numOctaves="5" seed="7" />
					<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.6 0 0 0 -1.3" />
				</filter>
				<rect width="400" height="480" filter="url(#tile-clouds)" />
			</svg>
			<div className="home">
				{slots.map((i) =>
					i === 6 ? (
						<span key={i} className="home__app home__app--kiteline">
							<span className="home__icon">
								<KiteMark className="home__mark" />
							</span>
							<span className="home__label">Kiteline</span>
						</span>
					) : (
						<span key={i} className="home__app">
							<span className="home__icon" />
							<span className="home__label home__label--bar" />
						</span>
					),
				)}
			</div>
			<div className="dock">
				{[0, 1, 2, 3].map((i) => (
					<span key={i} className="home__icon" />
				))}
			</div>
		</>
	);
}

/** Rows as the app draws them: title, folder and branch, when, and a dot while it's live. */
function SessionList() {
	return (
		<div className="sessions">
			<div className="sessions__day">Today</div>
			<div className="session session--current">
				<span className="session__text">
					<span className="session__title">Upgrade to React 19</span>
					<span className="session__sub">web · main</span>
				</span>
				<span className="session__time">
					<span className="session__live" />
					just now
				</span>
			</div>
			<div className="session">
				<span className="session__text">
					<span className="session__title">Write the release notes</span>
					<span className="session__sub">kiteline · docs</span>
				</span>
				<span className="session__time">2 hours ago</span>
			</div>
			<div className="sessions__day">Yesterday</div>
			{[72, 56].map((w) => (
				<div key={w} className="session session--filler">
					<span className="session__text">
						<span className="bar" style={{ width: `${w}%` }} />
						<span className="bar bar--sub" style={{ width: `${w - 24}%` }} />
					</span>
				</div>
			))}
		</div>
	);
}

const COMMANDS = [
	["/compact", "/review", "/init", "/context", "/cost", "/todos"],
	["/security-review", "/changelog", "/pr-comments", "/deploy"],
	["/release-notes", "/fix-issue", "/write-tests", "/standup"],
	["/triage", "/bump-version", "/docs", "/migrate", "/seed-db"],
	["/explain", "/ship", "/lint", "/perf", "/a11y"],
	["/refactor", "/i18n", "/storybook", "/e2e", "/bench"],
];

function Commands() {
	return (
		<div className="commands">
			{COMMANDS.map((row, r) => (
				<div key={row[0]} className={`commands__row commands__row--${r}`}>
					{row.map((command) => (
						<span key={command} className={command === "/changelog" ? "chip chip--on" : "chip"}>
							{command}
						</span>
					))}
				</div>
			))}
		</div>
	);
}

const MENU = [
	{ title: "Ask first", icon: HandIcon },
	{ title: "Auto-accept edits", icon: PencilSimpleLineIcon },
	{ title: "Plan only", icon: ClipboardTextIcon },
	{ title: "Auto", icon: ShieldCheckIcon },
];

function ModeMenu() {
	return (
		<div className="modes">
			<div className="menu">
				<div className="menu__label">Permissions</div>
				<div className="menu__items">
					<span className="menu__pick">
						<CheckIcon weight="bold" />
					</span>
					{MENU.map(({ title, icon: ItemIcon }) => (
						<div key={title} className="menu__item">
							<ItemIcon weight="fill" />
							{title}
						</div>
					))}
				</div>
			</div>
			<div className="composer">
				<span className="pill pill--mode">
					<span className="pill__swap">
						<span className="pill__from">
							<HandIcon weight="fill" />
							Ask
						</span>
						<span className="pill__to">
							<ClipboardTextIcon weight="fill" />
							Plan
						</span>
					</span>
					<CaretDownIcon weight="bold" className="pill__caret" />
				</span>
				<span className="pill">
					<CpuIcon weight="fill" />
					Opus 5.5
					<CaretDownIcon weight="bold" className="pill__caret" />
				</span>
			</div>
		</div>
	);
}

function Node({ icon, label, brand = false }: { icon: ReactNode; label: string; brand?: boolean }) {
	return (
		<span className="node">
			<span className={brand ? "node__icon node__icon--brand" : "node__icon"}>{icon}</span>
			{label}
		</span>
	);
}

function Topology() {
	return (
		<div className="topology">
			<Node icon={<DeviceMobileIcon weight="fill" />} label="Your phone" />
			<div className="link">
				<span className="link__label">
					<LockSimpleIcon weight="fill" />
					Relay, Wi-Fi or Tailscale
				</span>
			</div>
			<div className="machine">
				<span className="machine__label">Your computer</span>
				<div className="machine__row">
					<Node icon={<KiteMark className="node__mark" />} label="Kiteline" brand />
					<span className="hop" />
					<Node icon={<TerminalWindowIcon weight="fill" />} label="Claude Code" />
					<span className="hop" />
					<Node icon={<FolderSimpleIcon weight="fill" />} label="Your files" />
				</div>
			</div>
		</div>
	);
}

export function Features() {
	return (
		<section className="bento-section" id="features">
			<h2 className="statement">
				Claude Code, wherever you are.{" "}
				<span>
					Everything you do at the terminal, from the couch, the train or the other side of the world.
				</span>
			</h2>
			<div className="bento">
				<Tile
					kind="live"
					motion
					copy={
						<>
							<strong>Watch it work.</strong> Replies stream in as they're written, with every command and
							edit laid out step by step.
						</>
					}
				>
					<LiveSession />
				</Tile>
				<Tile
					kind="home"
					motion
					copy={
						<>
							<strong>Feels like an app.</strong> Put it on your home screen. It reconnects by itself when
							your phone wakes.
						</>
					}
				>
					<HomeScreen />
				</Tile>
				<Tile
					kind="sessions"
					copy={
						<>
							<strong>Every session, one list.</strong> Started in your terminal or on your phone, each one
							picks up where it left off.
						</>
					}
				>
					<SessionList />
				</Tile>
				<Tile
					kind="commands"
					copy={
						<>
							<strong>Slash commands, too.</strong> Type / for every command your setup has, your own
							included.
						</>
					}
				>
					<Commands />
				</Tile>
				<Tile
					kind="modes"
					motion
					copy={
						<>
							<strong>Your modes, your models.</strong> Change how much it asks, or which model it runs,
							mid-session.
						</>
					}
				>
					<ModeMenu />
				</Tile>
				<Tile
					kind="local"
					copy={
						<>
							<strong>Stays on your computer.</strong> Claude Code runs where your files are, with your
							settings and your login. Your phone reaches it through the relay, sealed end to end, or over
							your Wi-Fi or Tailscale, and a new device gets in only once you allow it.
						</>
					}
				>
					<Topology />
				</Tile>
			</div>
		</section>
	);
}
