import type { RunSummary } from "@kiteline/api/agent/types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { client, isUnauthorized, orpc } from "./orpc";

/** Every live session on the computer, kept current over one event stream. */
export function useLiveRuns() {
	const [runs, setRuns] = useState<RunSummary[] | null>(null);
	const [connected, setConnected] = useState(false);
	const queryClient = useQueryClient();

	useEffect(() => {
		const controller = new AbortController();
		const { signal } = controller;
		let attempt = 0;
		let previous = new Set<string>();
		let wake: (() => void) | null = null;

		void (async () => {
			while (!signal.aborted) {
				try {
					const stream = await client.runs.list(undefined, { signal });
					setConnected(true);
					attempt = 0;
					for await (const list of stream) {
						setRuns(list);
						const ids = new Set(list.map((r) => r.sessionId));
						// A session that just went to sleep has fresh transcript data.
						if ([...previous].some((id) => !ids.has(id))) {
							void queryClient.invalidateQueries({ queryKey: orpc.sessions.list.key() });
						}
						previous = ids;
					}
				} catch (error) {
					if (signal.aborted) break;
					if (isUnauthorized(error)) {
						queryClient.setQueryData(["auth"], { authed: false });
						break;
					}
				}
				setConnected(false);
				await new Promise<void>((resolve) => {
					const timer = setTimeout(resolve, Math.min(8000, 500 * 2 ** attempt++));
					wake = () => {
						clearTimeout(timer);
						resolve();
					};
					signal.addEventListener("abort", wake, { once: true });
				});
			}
		})();

		const onVisible = () => {
			if (document.visibilityState === "visible") wake?.();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			controller.abort();
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [queryClient]);

	return { runs, connected };
}
