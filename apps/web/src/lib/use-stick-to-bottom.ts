import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps the page pinned to the newest message while you're at the bottom,
 * and leaves you alone once you scroll up to read.
 */
export function useStickToBottom(content: RefObject<HTMLElement | null>, ready: boolean) {
	const pinned = useRef(true);
	const [away, setAway] = useState(false);

	const scrollToBottom = useCallback((behavior: ScrollBehavior = "instant") => {
		const el = document.scrollingElement ?? document.documentElement;
		window.scrollTo({ top: el.scrollHeight, behavior });
		pinned.current = true;
		setAway(false);
	}, []);

	useEffect(() => {
		const onScroll = () => {
			const el = document.scrollingElement ?? document.documentElement;
			const distance = el.scrollHeight - el.scrollTop - window.innerHeight;
			pinned.current = distance < 140;
			setAway(distance > 480);
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		if (!ready) return;
		scrollToBottom();
		const node = content.current;
		if (!node) return;
		const observer = new ResizeObserver(() => {
			if (pinned.current) scrollToBottom();
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [content, ready, scrollToBottom]);

	return { away, scrollToBottom };
}
