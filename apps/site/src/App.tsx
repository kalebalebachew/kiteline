import {
	ArrowSquareOutIcon,
	CheckIcon,
	CopyIcon,
	DeviceMobileIcon,
	GithubLogoIcon,
	type Icon,
	LightningIcon,
	ListBulletsIcon,
	LockKeyIcon,
	ShieldCheckIcon,
	SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { useState } from "react";

import { KitelineDemo } from "./demo/KitelineDemo";

const REPO = "https://github.com/sifenfisaha/kiteline";

const FEATURES: { icon: Icon; title: string; body: string }[] = [
	{
		icon: ListBulletsIcon,
		title: "Every session, one list",
		body: "Sessions from your terminal and from your phone, by day and by project. Open one and keep going.",
	},
	{
		icon: ShieldCheckIcon,
		title: "Approve from anywhere",
		body: "Commands and diffs slide up as a sheet. Allow, deny with a note, or allow it for good.",
	},
	{
		icon: LightningIcon,
		title: "Live as it works",
		body: "Replies stream in as they're written, with every command, edit and sub-agent laid out step by step.",
	},
	{
		icon: SlidersHorizontalIcon,
		title: "Your modes, your models",
		body: "Switch between Ask, Auto-accept edits, Plan and Auto, or between Opus, Sonnet and Haiku, mid-session.",
	},
	{
		icon: LockKeyIcon,
		title: "Stays on your computer",
		body: "Claude Code runs where your files are. Your phone reaches it over your own network or Tailscale; nothing is relayed.",
	},
	{
		icon: DeviceMobileIcon,
		title: "Feels like an app",
		body: "Add it to your home screen. Light and dark, swipeable sheets, and it reconnects when your phone wakes.",
	},
];

const STEPS = [
	{ label: "Clone it and build", code: `git clone ${REPO}.git && cd kiteline\npnpm install && pnpm build` },
	{ label: "Start it on the computer where you use Claude Code", code: "pnpm start" },
	{
		label: "Scan the QR code it prints with your phone",
		code: "pnpm pair   # shows the code again any time",
	},
];

function CopyCode({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="code">
			<pre>
				<code>{code}</code>
			</pre>
			<button
				type="button"
				className="code__copy"
				aria-label={copied ? "Copied" : "Copy"}
				onClick={async () => {
					await navigator.clipboard?.writeText(code.replace(/\s+#.*$/gm, ""));
					setCopied(true);
					setTimeout(() => setCopied(false), 1400);
				}}
			>
				{copied ? <CheckIcon weight="bold" /> : <CopyIcon weight="fill" />}
			</button>
		</div>
	);
}

function KiteMark() {
	return (
		<svg viewBox="0 0 64 64" className="mark" aria-hidden="true">
			<path
				d="M27.2 42C22.5 47.5 21 50.5 17 53S11 56.5 9.5 58.5"
				fill="none"
				stroke="#9a9a9d"
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
			<g transform="translate(41.5 21.5) rotate(35)">
				<path d="M0-17 14-5 0 25-14-5Z" fill="currentColor" />
				<path d="M0-17-14-5H0Z" fill="#fdfdfc" fillOpacity="0.18" />
			</g>
		</svg>
	);
}

/** `?demo` (optionally `?demo=358`) renders the demo alone, for filming. */
export function App() {
	const params = new URLSearchParams(window.location.search);
	if (params.has("demo")) {
		const width = Number(params.get("demo")) || 960;
		return (
			<div id="demo" style={{ width }}>
				<KitelineDemo />
			</div>
		);
	}

	return (
		<>
			<header className="nav">
				<a className="brand" href="./">
					<KiteMark />
					Kiteline
				</a>
				<a className="nav__link" href={REPO}>
					<GithubLogoIcon weight="fill" />
					GitHub
				</a>
			</header>

			<main>
				<section className="hero">
					<p className="eyebrow">Open source · Self-hosted · For Claude Code</p>
					<h1>
						Your terminal,
						<br />
						in your pocket.
					</h1>
					<p className="lede">
						Kiteline runs Claude Code on your computer and puts every session on your phone. Pick up where you
						left off, start something new, and approve each change with a tap.
					</p>
					<div className="actions">
						<a className="button button--ink" href="#install">
							Get started
						</a>
						<a className="button" href={REPO}>
							<GithubLogoIcon weight="fill" />
							View on GitHub
						</a>
					</div>
				</section>

				<section className="demo" aria-label="Kiteline approving an edit from a phone">
					<KitelineDemo />
				</section>

				<section className="features">
					{FEATURES.map(({ icon: FeatureIcon, title, body }) => (
						<div key={title} className="feature">
							<span className="feature__icon">
								<FeatureIcon weight="fill" />
							</span>
							<h2>{title}</h2>
							<p>{body}</p>
						</div>
					))}
				</section>

				<section className="install" id="install">
					<h2>Set it up in a few minutes</h2>
					<p className="install__lede">
						You need Node.js 20 or newer, pnpm, and Claude Code signed in on the computer.
					</p>
					<ol>
						{STEPS.map((step, i) => (
							<li key={step.label}>
								<span className="install__n">{i + 1}</span>
								<div className="install__body">
									<p>{step.label}</p>
									<CopyCode code={step.code} />
								</div>
							</li>
						))}
					</ol>
					<p className="install__more">
						Away from home, reach it through Tailscale. To keep it running for good, set it up as a background
						service.{" "}
						<a href={`${REPO}#keeping-it-running`}>
							Read how <ArrowSquareOutIcon weight="bold" />
						</a>
					</p>
				</section>
			</main>

			<footer className="footer">
				<p>
					MIT licensed. An independent project, not made by or affiliated with Anthropic.
					<br />
					The demo is built with <a href="https://benji.org/stageshow">Stageshow</a> by Benji Taylor.
				</p>
			</footer>
		</>
	);
}
