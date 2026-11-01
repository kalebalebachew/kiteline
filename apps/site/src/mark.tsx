/** Kiteline's mark, drawn white for a dark tile. */
export function KiteMark({ className = "mark" }: { className?: string }) {
	return (
		<svg viewBox="0 0 64 64" className={className} aria-hidden="true">
			<path
				d="M27.2 42C22.5 47.5 21 50.5 17 53S11 56.5 9.5 58.5"
				fill="none"
				stroke="rgba(255,255,255,0.55)"
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
			<g transform="translate(41.5 21.5) rotate(35)">
				<path d="M0-17 14-5 0 25-14-5Z" fill="#fff" />
				<path d="M0-17-14-5H0Z" fill="#cfd8e6" />
			</g>
		</svg>
	);
}
