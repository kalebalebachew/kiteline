import { ArrowSquareOutIcon, CaretRightIcon, CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Features } from "./bento";
import { KitelineDemo } from "./demo/KitelineDemo";
import { KiteMark } from "./mark";
import { FlyingKite, Sky } from "./sky";

const REPO = "https://github.com/sifenfisaha/kiteline";

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
			<section className="top">
				<Sky />
				<FlyingKite />

				<header className="nav">
					<a className="brand" href="./">
						<span className="brand__tile">
							<KiteMark />
						</span>
						Kiteline
					</a>
					<nav className="nav__links" aria-label="Sections">
						<a href="#features">Features</a>
						<a href="#install">Install</a>
						<a href={`${REPO}#readme`}>Docs</a>
					</nav>
					<a className="nav__cta" href={REPO}>
						GitHub
					</a>
				</header>

				<div className="hero">
					<div className="hero__lead">
						<span className="pill">Open source · Self-hosted</span>
						<h1>
							Your terminal,
							<br />
							in your pocket.
						</h1>
					</div>
					<div className="hero__side">
						<p className="lede">
							Kiteline runs Claude Code on your computer and puts every session on your phone. Pick up where
							you left off, start something new, and approve each change with a tap.
						</p>
						<div className="actions">
							<a className="button button--dark" href="#install">
								Get started
							</a>
							<a className="button button--light" href={REPO}>
								View on GitHub
								<CaretRightIcon weight="bold" />
							</a>
						</div>
					</div>
				</div>

				<div className="frame" aria-label="Kiteline approving an edit from a phone" role="img">
					<div className="frame__inner">
						<KitelineDemo />
					</div>
				</div>
			</section>

			<main>
				<Features />

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
