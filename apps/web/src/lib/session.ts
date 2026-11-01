import type { HistoryPage, Item, RunEvent, RunSnapshot } from "@kiteline/api/agent/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { client, isUnauthorized, orpc } from "./orpc";

type State = {
	run: RunSnapshot | null;
	/** Items from an earlier run in this visit, kept until history catches up. */
	retired: Item[];
	generation: number;
};

function patchTool(items: Item[], toolUseId: string, patch: (tool: Extract<Item, { kind: "tool" }>) => Item) {
	let changed = false;
	const next = items.map((item) => {
		if (item.kind === "tool" && item.id === toolUseId) {
			changed = true;
			return patch(item);
		}
		return item;
	});
	return changed ? next : items;
}

function reducer(state: State, event: RunEvent): State {
	if (event.type === "snapshot") {
		const replacing = state.run && event.run && state.run.startedAt !== event.run.startedAt;
		return {
			run: event.run,
			retired: replacing && state.run ? [...state.retired, ...state.run.items] : state.retired,
			generation: state.generation + 1,
		};
	}
	const run = state.run;
	if (!run) return state;
	const set = (patch: Partial<RunSnapshot>) => ({ ...state, run: { ...run, ...patch } });
	switch (event.type) {
		case "item": {
			const exists = run.items.findIndex((i) => i.id === event.item.id);
			const items = exists === -1 ? [...run.items, event.item] : run.items.with(exists, event.item);
			return set({ items });
		}
		case "tool-result": {
			const { [event.toolUseId]: _, ...toolProgress } = run.toolProgress;
			return set({
				items: patchTool(run.items, event.toolUseId, (tool) => ({ ...tool, result: event.result })),
				toolProgress,
			});
		}
		case "tool-progress":
			return set({ toolProgress: { ...run.toolProgress, [event.toolUseId]: event.seconds } });
		case "draft-delta":
			return set({ draft: run.draft + event.text });
		case "draft-reset":
			return set({ draft: "" });
		case "status":
			return set({ status: event.status, error: event.error });
		case "meta":
			return set({ meta: event.meta });
		case "usage":
			return set({ usage: event.usage });
		case "permission":
			return run.permissions.some((p) => p.id === event.request.id)
				? state
				: set({ permissions: [...run.permissions, event.request] });
		case "permission-resolved":
			return set({ permissions: run.permissions.filter((p) => p.id !== event.id) });
	}
}

const sleep = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener("abort", () => {
			clearTimeout(timer);
			resolve();
		});
	});

/** Live events for one session. Reconnects with backoff, and at once when the tab comes back. */
export function useRunStream(sessionId: string | null) {
	const [state, dispatch] = useReducer(reducer, { run: null, retired: [], generation: 0 });
	const [connected, setConnected] = useState(false);
	const queryClient = useQueryClient();
	const wake = useRef<AbortController | null>(null);

	useEffect(() => {
		if (!sessionId) return;
		const controller = new AbortController();
		const { signal } = controller;
		let attempt = 0;

		void (async () => {
			while (!signal.aborted) {
				try {
					const events = await client.runs.watch({ sessionId }, { signal });
					setConnected(true);
					attempt = 0;
					for await (const event of events) dispatch(event);
				} catch (error) {
					if (signal.aborted) break;
					if (isUnauthorized(error)) {
						queryClient.setQueryData(["auth"], { authed: false });
						break;
					}
				}
				setConnected(false);
				if (signal.aborted) break;
				const nap = new AbortController();
				wake.current = nap;
				signal.addEventListener("abort", () => nap.abort(), { once: true });
				await sleep(Math.min(8000, 400 * 2 ** attempt++), nap.signal);
			}
		})();

		const onVisible = () => {
			if (document.visibilityState === "visible") wake.current?.abort();
		};
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("online", onVisible);
		return () => {
			controller.abort();
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("online", onVisible);
			setConnected(false);
		};
	}, [sessionId, queryClient]);

	// A run that just ended or restarted has written to the transcript; refresh it.
	const status = state.run?.status;
	useEffect(() => {
		if (!sessionId) return;
		if (status === "idle" || status === "closed" || status === "error" || state.generation > 1) {
			void queryClient.invalidateQueries({ queryKey: orpc.sessions.history.key({ input: { sessionId } }) });
			void queryClient.invalidateQueries({ queryKey: orpc.sessions.list.key() });
		}
	}, [sessionId, status, state.generation, queryClient]);

	return { run: state.run, retired: state.retired, connected };
}

/** The saved transcript, newest page first, with "load earlier" for long sessions. */
export function useHistory(sessionId: string | null) {
	const latest = useQuery({
		...orpc.sessions.history.queryOptions({ input: { sessionId: sessionId ?? "" } }),
		enabled: !!sessionId,
		staleTime: 10_000,
	});
	const [earlier, setEarlier] = useState<HistoryPage[]>([]);
	const [loadingEarlier, setLoadingEarlier] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a different session starts with no earlier pages.
	useEffect(() => {
		setEarlier([]);
	}, [sessionId]);

	const first = earlier[0] ?? latest.data;
	const hasEarlier = !!first && first.start > 0;

	const loadEarlier = useCallback(async () => {
		if (!sessionId || !first || first.start === 0) return;
		setLoadingEarlier(true);
		try {
			const page = await client.sessions.history({ sessionId, before: first.start, limit: 240 });
			setEarlier((pages) => [page, ...pages]);
		} finally {
			setLoadingEarlier(false);
		}
	}, [sessionId, first]);

	const items = useMemo(
		() => [...earlier.flatMap((p) => p.items), ...(latest.data?.items ?? [])],
		[earlier, latest.data],
	);

	return { items, isLoading: latest.isLoading, error: latest.error, hasEarlier, loadEarlier, loadingEarlier };
}

/** History, then earlier runs from this visit, then the live run; later copies of an id win. */
export function mergeTimeline(history: Item[], retired: Item[], live: Item[]) {
	const byId = new Map<string, Item>();
	for (const list of [history, retired, live]) {
		for (const item of list) byId.set(item.id, item);
	}
	return [...byId.values()];
}
