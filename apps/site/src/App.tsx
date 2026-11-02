import { CaretRightIcon } from "@phosphor-icons/react";

import { Features } from "./bento";
import { KitelineDemo } from "./demo/KitelineDemo";
import { Install } from "./install";
import { ScrollBar } from "./scrollbar";
import { Clouds, FlyingKite, Sky } from "./sky";

const REPO = "https://github.com/sifenfisaha/kiteline";

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

				<header className="nav">
					<a className="brand" href="./">
						Kiteline
					</a>
					<nav className="nav__links" aria-label="Sections">
						<a href="#features">Features</a>
						<a href="#install">Install</a>
						<a href="docs/">Docs</a>
					</nav>
					<a className="nav__cta" href={REPO}>
						GitHub
					</a>
				</header>

				<div className="hero">
					<div className="hero__lead">
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

				<div className="horizon">
					<Clouds />
					<div className="frame" aria-label="Kiteline approving an edit from a phone" role="img">
						<div className="frame__inner">
							<KitelineDemo />
						</div>
					</div>
				</div>
				{/* After the clouds, so it flies in front of them and its line still runs behind the frame. */}
				<FlyingKite />
			</section>

			<main>
				<Features />

				<Install />
			</main>

			<footer className="footer">
				<p>
					MIT licensed. An independent project, not made by or affiliated with Anthropic.
					<br />
					Built by <a href="https://www.seefun.dev">seefun.dev</a>
				</p>
			</footer>
			<ScrollBar />
		</>
	);
}
