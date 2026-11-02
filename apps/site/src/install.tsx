import {
	ArrowRightIcon,
	CheckIcon,
	CopyIcon,
	GlobeHemisphereWestIcon,
	PowerIcon,
} from "@phosphor-icons/react";
import { type CSSProperties, useRef, useState } from "react";

import { ManagerSwitch } from "./manager-switch";
import { usePlayOnce } from "./play-once";
import { run, useManager } from "./pm";
import { QR_PATH, QR_SIZE } from "./qr";

import "./install.css";

function CopyCode({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="snippet">
			<pre>
				<code>{code}</code>
			</pre>
			<button
				type="button"
				className="snippet__copy"
				aria-label={copied ? "Copied" : "Copy"}
				onClick={async () => {
					await navigator.clipboard?.writeText(code);
					setCopied(true);
					setTimeout(() => setCopied(false), 1400);
				}}
			>
				{copied ? <CheckIcon weight="bold" /> : <CopyIcon weight="fill" />}
			</button>
		</div>
	);
}

const at = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;

/** What `npx kiteline --relay` prints, in the banner's own colors, cropped below the pairing link. */
function Terminal({ command }: { command: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const motion = usePlayOnce(ref);
	return (
		<div ref={ref} className="setup__shot" data-motion={motion}>
			<svg className="setup__clouds" viewBox="0 0 600 520" preserveAspectRatio="none" aria-hidden="true">
				<filter id="setup-clouds" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.0035 0.014" numOctaves="5" seed="23" />
					<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.6 0 0 0 -1.3" />
				</filter>
				<rect width="600" height="520" filter="url(#setup-clouds)" />
			</svg>
			<div
				className="term"
				role="img"
				aria-label={`The terminal after ${command}: Kiteline's addresses and a QR code to pair your phone`}
			>
				<div className="term__bar">
					<span className="term__lights">
						<i />
						<i />
						<i />
					</span>
					<span className="term__title">{command}</span>
				</div>
				<div className="term__body">
					<div className="term__line">
						<span className="t-dim">~</span> <span className="t-accent">❯</span>{" "}
						<span className="term__typed" style={{ "--chars": command.length } as CSSProperties}>
							{command}
						</span>
					</div>
					<div className="term__gap" />
					<div className="term__line out" style={at(0.95)}>
						{"  "}
						<span className="t-accent">◆</span>
						{"  "}
						<b>Kiteline</b> <span className="t-dim">v0.3.3</span>
					</div>
					<div className="term__gap" />
					<div className="term__line out" style={at(1.05)}>
						{"  "}
						<span className="t-dim">Anywhere</span> https://relay.kiteline.seefun.dev
					</div>
					<div className="term__line out" style={at(1.12)}>
						{"  "}
						<span className="t-dim">Local </span> http://localhost:4545
					</div>
					<div className="term__gap" />
					<div className="term__line out" style={at(1.22)}>
						{"  "}
						<b>Pair a phone:</b> scan this code, or open the link on it.
					</div>
					<div className="term__gap" />
					<svg
						className="term__qr out"
						style={at(1.35)}
						viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`}
						shapeRendering="crispEdges"
						aria-hidden="true"
					>
						<rect width={QR_SIZE} height={QR_SIZE} fill="#e7eaf0" />
						<path d={QR_PATH} fill="#0f1218" />
					</svg>
					<div className="term__gap" />
					<div className="term__line out" style={at(1.55)}>
						{"  "}
						<span className="t-accent">https://relay.kiteline.seefun.dev/#host=…&amp;code=…</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export function Install() {
	const [manager] = useManager();
	return (
		<section className="setup" id="install">
			<h2 className="statement">
				Set it up with one command.{" "}
				<span>You need Node.js 22.18 or newer, and Claude Code signed in on the computer.</span>
			</h2>

			<div className="setup__grid">
				<ol className="setup__steps">
					<li className="setup-step">
						<span className="setup-step__n">1</span>
						<div className="setup-step__body">
							<h3>Run it on the computer where you use Claude Code</h3>
							<ManagerSwitch className="pm-switch" />
							<CopyCode code={run(manager, "kiteline --relay")} />
						</div>
					</li>
					<li className="setup-step">
						<span className="setup-step__n">2</span>
						<div className="setup-step__body">
							<h3>Scan the code, then allow your phone</h3>
							<p>
								Check that your phone and the terminal show the same six digits, and type y. To pair another
								device later, run <code>{run(manager, "kiteline pair")}</code>.
							</p>
						</div>
					</li>
				</ol>
				<Terminal command={run(manager, "kiteline --relay")} />
			</div>

			<div className="setup__next">
				<a className="next-card" href="docs/#anywhere">
					<span className="next-card__icon">
						<GlobeHemisphereWestIcon weight="fill" />
					</span>
					<span className="next-card__text">
						<strong>Reach it from anywhere</strong>
						<span>With --relay your phone reaches it on any network, sealed end to end.</span>
					</span>
					<ArrowRightIcon weight="bold" className="next-card__arrow" />
				</a>
				<a className="next-card" href="docs/#always-on">
					<span className="next-card__icon">
						<PowerIcon weight="fill" />
					</span>
					<span className="next-card__text">
						<strong>Keep it running</strong>
						<span>One command makes it a service that starts at boot and keeps going.</span>
					</span>
					<ArrowRightIcon weight="bold" className="next-card__arrow" />
				</a>
			</div>
		</section>
	);
}
