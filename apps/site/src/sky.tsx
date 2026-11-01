const base = import.meta.env.BASE_URL;

/** The hero's sky: the photograph's own deep blue, fading into the page below the horizon. */
export function Sky() {
	return (
		<div className="sky" aria-hidden="true">
			<div className="sky__haze" />
		</div>
	);
}

/**
 * A cumulus tower (Pexels photo 8726326), anchored to the framed demo rather than the sky so its
 * tops always rise just above the frame and every word above it sits on clear blue.
 */
export function Clouds() {
	return (
		<img
			className="clouds"
			src={`${base}sky-2400.webp`}
			srcSet={`${base}sky-1200.webp 1200w, ${base}sky-2400.webp 2400w`}
			sizes="max(100vw, 1100px)"
			alt=""
			aria-hidden="true"
			fetchPriority="high"
		/>
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
