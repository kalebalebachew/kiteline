import { type KeyboardEvent, useRef } from "react";

import { MANAGERS, useManager } from "./pm";

/** npm, pnpm or bun: one choice that switches every command on the page. */
export function ManagerSwitch({ className }: { className: string }) {
	const [manager, choose] = useManager();
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);

	const onKeyDown = (event: KeyboardEvent, at: number) => {
		if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
		event.preventDefault();
		const next = (at + (event.key === "ArrowRight" ? 1 : MANAGERS.length - 1)) % MANAGERS.length;
		const picked = MANAGERS[next];
		if (picked) choose(picked);
		buttons.current[next]?.focus();
	};

	return (
		<div className={className} role="tablist" aria-label="Package manager">
			{MANAGERS.map((name, i) => (
				<button
					key={name}
					ref={(button) => {
						buttons.current[i] = button;
					}}
					type="button"
					role="tab"
					aria-selected={manager === name}
					tabIndex={manager === name ? 0 : -1}
					onClick={() => choose(name)}
					onKeyDown={(event) => onKeyDown(event, i)}
				>
					{name}
				</button>
			))}
		</div>
	);
}
