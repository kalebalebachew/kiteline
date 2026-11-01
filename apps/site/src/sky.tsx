/**
 * The hero's sky, drawn rather than photographed: a gradient from deep blue to
 * the horizon, high streaks of cirrus and a low bank of cloud, both from SVG
 * fractal noise, and a haze where the sky meets the page.
 */
export function Sky() {
	return (
		<div className="sky" aria-hidden="true">
			<svg
				className="sky__layer sky__layer--high"
				viewBox="0 0 1600 900"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<filter id="sky-cirrus" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.0016 0.013" numOctaves="5" seed="11" />
					<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.7 0 0 0 -1.32" />
					<feGaussianBlur stdDeviation="0.8" />
				</filter>
				<rect width="1600" height="900" filter="url(#sky-cirrus)" />
			</svg>
			<svg
				className="sky__layer sky__layer--low"
				viewBox="0 0 1600 900"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<filter id="sky-cumulus" x="0" y="0" width="100%" height="100%">
					<feTurbulence type="fractalNoise" baseFrequency="0.005 0.008" numOctaves="6" seed="4" />
					<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.4 0 0 0 -1.55" />
				</filter>
				<rect width="1600" height="900" filter="url(#sky-cumulus)" />
			</svg>
			<div className="sky__haze" />
		</div>
	);
}

/** Kiteline's kite, flying: the mark at sky scale, its line running down behind the framed demo. */
export function FlyingKite() {
	return (
		<svg className="flying-kite" viewBox="0 0 220 540" aria-hidden="true">
			<path
				className="flying-kite__line"
				d="M93.6 119.2C84 190 76 270 66 350S48 470 42 540"
				fill="none"
				stroke="rgba(255,255,255,0.7)"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
			<g className="flying-kite__body">
				<g transform="translate(128 70) rotate(35) scale(2.4)">
					<path d="M0-17 14-5 0 25-14-5Z" fill="#fff" />
					<path d="M0-17-14-5H0Z" fill="#cfe3fb" />
					<path d="M0-13.5V21M-10.5-5H10.5" stroke="#9cc4f4" strokeWidth="0.9" strokeLinecap="round" />
				</g>
			</g>
		</svg>
	);
}
