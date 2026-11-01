import {
	ArrowUpRightIcon,
	CheckIcon,
	CopyIcon,
	GlobeHemisphereWestIcon,
	PowerIcon,
} from "@phosphor-icons/react";
import { type CSSProperties, useRef, useState } from "react";

import { usePlayOnce } from "./play-once";

import "./install.css";

const REPO = "https://github.com/sifenfisaha/kiteline";

/** The site's own address, encoded with uqr as the server does; scanning it opens this page. */
const QR = [
	"11111110011100100100001111111",
	"10000010000111101000101000001",
	"10111010011100010010001011101",
	"10111010101101011101101011101",
	"10111010101010001111101011101",
	"10000010011000100010101000001",
	"11111110101010101010101111111",
	"00000000010010101011100000000",
	"11000111011011000100000011000",
	"10101101001001110001000110110",
	"01111010110111111000001110000",
	"11110101001100101001101111000",
	"01010110011001111000101100001",
	"11100101111011011011001110011",
	"01101111011001110110100001100",
	"10011001101011100010100110101",
	"01011111100010111110000001100",
	"10101101011000011111101110111",
	"11001010100011110001110011001",
	"10100101000100100010010000000",
	"10110010110100000101111110111",
	"00000000111011010110100011000",
	"11111110100001111011101011100",
	"10000010111011010001100010011",
	"10111010000111001001111111001",
	"10111010001000011111010001101",
	"10111010010110011100001111110",
	"10000010110100010000001101101",
	"11111110100100000111001011100",
];

/** One path for every dark module, inside a one-module light border, like the banner's. */
const QR_PATH = QR.flatMap((row, y) =>
	[...row].flatMap((bit, x) => (bit === "1" ? [`M${x + 1} ${y + 1}h1v1h-1z`] : [])),
).join("");

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

/** What `pnpm start` prints, in the banner's own colors, cropped below the pairing link. */
function Terminal() {
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
				aria-label="The terminal after pnpm start: Kiteline's addresses and a QR code to pair your phone"
			>
				<div className="term__bar">
					<span className="term__lights">
						<i />
						<i />
						<i />
					</span>
					<span className="term__title">kiteline — pnpm start</span>
				</div>
				<div className="term__body">
					<div className="term__line">
						<span className="t-dim">~/kiteline</span> <span className="t-accent">❯</span>{" "}
						<span className="term__typed">pnpm start</span>
					</div>
					<div className="term__gap" />
					<div className="term__line out" style={at(0.95)}>
						{"  "}
						<span className="t-accent">◆</span>
						{"  "}
						<b>Kiteline</b> <span className="t-dim">v0.1.0</span>
					</div>
					<div className="term__gap" />
					<div className="term__line out" style={at(1.05)}>
						{"  "}
						<span className="t-dim">Network </span> http://192.168.1.20:4545
					</div>
					<div className="term__line out" style={at(1.12)}>
						{"  "}
						<span className="t-dim">Local </span> http://localhost:4545
					</div>
					<div className="term__gap" />
					<div className="term__line out" style={at(1.22)}>
						{"  "}
						<b>Pair your phone:</b> scan this code, or open the link on it.
					</div>
					<div className="term__gap" />
					<svg
						className="term__qr out"
						style={at(1.35)}
						viewBox="0 0 31 31"
						shapeRendering="crispEdges"
						aria-hidden="true"
					>
						<rect width="31" height="31" fill="#e7eaf0" />
						<path d={QR_PATH} fill="#0f1218" />
					</svg>
					<div className="term__gap" />
					<div className="term__line out" style={at(1.55)}>
						{"  "}
						<span className="t-accent">http://192.168.1.20:4545/#pair=Qm3xV8rT2kLp9ZwYb4NcHd7s</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export function Install() {
	return (
		<section className="setup" id="install">
			<h2 className="statement">
				Set it up in a few minutes.{" "}
				<span>You need Node.js 20 or newer, pnpm, and Claude Code signed in on the computer.</span>
			</h2>

			<div className="setup__grid">
				<ol className="setup__steps">
					<li className="setup-step">
						<span className="setup-step__n">1</span>
						<div className="setup-step__body">
							<h3>Clone it and build</h3>
							<CopyCode code={`git clone ${REPO}.git\ncd kiteline\npnpm install && pnpm build`} />
						</div>
					</li>
					<li className="setup-step">
						<span className="setup-step__n">2</span>
						<div className="setup-step__body">
							<h3>Start it on the computer where you use Claude Code</h3>
							<CopyCode code="pnpm start" />
						</div>
					</li>
					<li className="setup-step">
						<span className="setup-step__n">3</span>
						<div className="setup-step__body">
							<h3>Scan the code with your phone</h3>
							<p>
								Kiteline opens already paired, and stays paired. To show the code again later, run{" "}
								<code>pnpm pair</code>.
							</p>
						</div>
					</li>
				</ol>
				<Terminal />
			</div>

			<div className="setup__next">
				<a className="next-card" href={`${REPO}#reaching-it-from-outside-your-home-network`}>
					<span className="next-card__icon">
						<GlobeHemisphereWestIcon weight="fill" />
					</span>
					<span className="next-card__text">
						<strong>Reach it from anywhere</strong>
						<span>Tailscale gives your phone a private HTTPS address for it, away from home.</span>
					</span>
					<ArrowUpRightIcon weight="bold" className="next-card__arrow" />
				</a>
				<a className="next-card" href={`${REPO}#keeping-it-running`}>
					<span className="next-card__icon">
						<PowerIcon weight="fill" />
					</span>
					<span className="next-card__text">
						<strong>Keep it running</strong>
						<span>Run it as a service that starts at boot and keeps going with the lid closed.</span>
					</span>
					<ArrowUpRightIcon weight="bold" className="next-card__arrow" />
				</a>
			</div>
		</section>
	);
}
