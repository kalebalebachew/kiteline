import { type RefObject, useEffect, useState } from "react";

export type Motion = "still" | "armed" | "play";

/**
 * Plays an element's motion once, the first time it scrolls into view. Without script, with
 * reduced motion, or when it is already on screen at load, it stays "still" and shows its end
 * state; CSS hides the moving parts only while it is "armed".
 */
export function usePlayOnce(ref: RefObject<HTMLElement | null>, enabled = true): Motion {
	const [state, setState] = useState<Motion>("still");

	useEffect(() => {
		const el = ref.current;
		if (!enabled || !el || !("IntersectionObserver" in window)) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		if (el.getBoundingClientRect().top < window.innerHeight) return;
		setState("armed");
		const io = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				setState("play");
				io.disconnect();
			},
			{ threshold: 0.45 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [ref, enabled]);

	return state;
}
