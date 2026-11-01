import { useEffect, useRef } from "react";

import "./scrollbar.css";

/** Smallest thumb, and the gap it keeps from the window's top and bottom edges. */
const MIN_THUMB = 48;
const INSET = 4;

/**
 * A slim scrollbar that floats over the page edge, so the hero's sky runs to the window's edge
 * instead of stopping at a gutter. Scrolling stays native (wheel, keys, touch); this only draws
 * the position and lets a mouse drag the thumb or click the track. It turns light over the sky
 * (`lightOver`, the element whose upper part is dark blue).
 * Touch screens, and pages without script, keep the browser's own scrollbar.
 */
export function ScrollBar({ lightOver = ".sky" }: { lightOver?: string }) {
	const trackRef = useRef<HTMLDivElement>(null);
	const thumbRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const track = trackRef.current;
		const thumb = thumbRef.current;
		if (!track || !thumb || !window.matchMedia("(pointer: fine)").matches) return;

		const root = document.documentElement;
		const sky = document.querySelector(lightOver);
		root.classList.add("custom-scrollbar");
		track.hidden = false;

		let geometry = { thumbHeight: 0, travel: 0, max: 0 };
		let frame = 0;
		let idle = 0;
		let drag: { pointerY: number; scrollY: number } | null = null;

		const measure = () => {
			const viewport = window.innerHeight;
			const usable = viewport - INSET * 2;
			const thumbHeight = Math.max(MIN_THUMB, (usable * viewport) / root.scrollHeight);
			geometry = { thumbHeight, travel: usable - thumbHeight, max: root.scrollHeight - viewport };
			thumb.style.height = `${thumbHeight}px`;
			track.dataset.scrollable = geometry.max > 0 ? "true" : "false";
		};

		const paint = () => {
			frame = 0;
			const { thumbHeight, travel, max } = geometry;
			const top = INSET + (max > 0 ? (Math.min(window.scrollY, max) / max) * travel : 0);
			thumb.style.transform = `translateY(${top}px)`;
			// Over the blue part of the sky (above its fade to white) the thumb turns light.
			const blueEnds = sky ? sky.getBoundingClientRect().bottom - sky.clientHeight * 0.3 : 0;
			track.dataset.tone = top + thumbHeight / 2 < blueEnds ? "light" : "dark";
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(paint);
		};
		const refresh = () => {
			measure();
			schedule();
		};

		/** Brighter while the page moves; settles back after a moment of stillness. */
		const wake = () => {
			track.dataset.awake = "true";
			window.clearTimeout(idle);
			idle = window.setTimeout(() => {
				track.dataset.awake = "false";
			}, 900);
		};
		const onScroll = () => {
			schedule();
			wake();
		};

		const onThumbDown = (event: PointerEvent) => {
			if (event.button !== 0) return;
			event.preventDefault();
			thumb.setPointerCapture(event.pointerId);
			drag = { pointerY: event.clientY, scrollY: window.scrollY };
			track.dataset.dragging = "true";
		};
		const onThumbMove = (event: PointerEvent) => {
			if (!drag || geometry.travel <= 0) return;
			const moved = ((event.clientY - drag.pointerY) / geometry.travel) * geometry.max;
			window.scrollTo({ top: drag.scrollY + moved, behavior: "instant" });
		};
		const onThumbUp = () => {
			drag = null;
			track.dataset.dragging = "false";
		};
		/** A click on the track brings the thumb's middle to that point. */
		const onTrackDown = (event: PointerEvent) => {
			if (event.target !== track || event.button !== 0 || geometry.travel <= 0) return;
			const { thumbHeight, travel, max } = geometry;
			const share = (event.clientY - INSET - thumbHeight / 2) / travel;
			window.scrollTo({ top: Math.max(0, Math.min(1, share)) * max, behavior: "smooth" });
		};

		const resizes = new ResizeObserver(refresh);
		resizes.observe(document.body);
		window.addEventListener("resize", refresh);
		window.addEventListener("scroll", onScroll, { passive: true });
		thumb.addEventListener("pointerdown", onThumbDown);
		thumb.addEventListener("pointermove", onThumbMove);
		thumb.addEventListener("pointerup", onThumbUp);
		thumb.addEventListener("pointercancel", onThumbUp);
		track.addEventListener("pointerdown", onTrackDown);
		refresh();

		return () => {
			resizes.disconnect();
			window.removeEventListener("resize", refresh);
			window.removeEventListener("scroll", onScroll);
			thumb.removeEventListener("pointerdown", onThumbDown);
			thumb.removeEventListener("pointermove", onThumbMove);
			thumb.removeEventListener("pointerup", onThumbUp);
			thumb.removeEventListener("pointercancel", onThumbUp);
			track.removeEventListener("pointerdown", onTrackDown);
			cancelAnimationFrame(frame);
			window.clearTimeout(idle);
			root.classList.remove("custom-scrollbar");
			track.hidden = true;
		};
	}, [lightOver]);

	return (
		<div ref={trackRef} className="scrollbar" aria-hidden="true" hidden>
			<div ref={thumbRef} className="scrollbar__thumb" />
		</div>
	);
}
