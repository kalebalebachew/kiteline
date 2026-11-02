import { useEffect, useState } from "react";

/** The time, again every `interval` ms while it's set: for countdowns. */
export function useNow(interval: number | null) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (!interval) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), interval);
		return () => clearInterval(timer);
	}, [interval]);
	return now;
}

/** 4:05, for what's left of a code. */
export function clock(ms: number) {
	const seconds = Math.max(0, Math.ceil(ms / 1000));
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Six digits as people read them off a screen: 482 913. */
export const spaced = (match: string) => `${match.slice(0, 3)} ${match.slice(3)}`;
