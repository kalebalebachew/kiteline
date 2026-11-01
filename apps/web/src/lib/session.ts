import type { HistoryPage, Item, RunEvent, RunSnapshot } from "@kiteline/api/agent/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";

import { client, errorMessage, isUnauthorized, orpc } from "./orpc";

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

/**
 * Live events for one session. Reconnects with backoff, and at once when the tab comes back: a phone
 * that slept can leave a stream that looks open but is dead, and a snapshot replaces state, so a
 * fresh connection is always safe.
 */
export function useRunStream(sessionId: string | null) {
	const [state, dispatch] = useReducer(reducer, { run: null, retired: [], generation: 0 });
	const [connected, setConnected] = useState(false);
	const queryClient = useQueryClient();
	const wake = useRef<AbortController | null>(null);
	const stream = useRef<AbortController | null>(null);

	useEffect(() => {
		if (!sessionId) return;
		const controller = new AbortController();
		const { signal } = controller;
		let attempt = 0;

		void (async () => {
			while (!signal.aborted) {
				const connection = new AbortController();
				stream.current = connection;
				const drop = () => connection.abort();
				signal.addEventListener("abort", drop, { once: true });
				try {
					const events = await client.runs.watch({ sessionId }, { signal: connection.signal });
					setConnected(true);
					attempt = 0;
					for await (const event of events) dispatch(event);
				} catch (error) {
					if (signal.aborted) break;
					// Dropped on purpose to reconnect: go straight back.
					if (connection.signal.aborted) {
						attempt = 0;
						continue;
					}
					if (isUnauthorized(error)) {
						queryClient.setQueryData(["auth"], { authed: false });
						break;
					}
				} finally {
					signal.removeEventListener("abort", drop);
				}
				setConnected(false);
				if (signal.aborted) break;
				const nap = new AbortController();
				wake.current = nap;
				signal.addEventListener("abort", () => nap.abort(), { once: true });
				await sleep(Math.min(8000, 400 * 2 ** attempt++), nap.signal);
			}
		})();

		let hiddenAt = 0;
		const onVisible = () => {
			if (document.visibilityState === "hidden") {
				hiddenAt = Date.now();
				return;
			}
			wake.current?.abort();
			if (hiddenAt && Date.now() - hiddenAt > 3000) stream.current?.abort();
			hiddenAt = 0;
		};
		const onOnline = () => {
			wake.current?.abort();
			stream.current?.abort();
		};
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("online", onOnline);
		return () => {
			controller.abort();
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("online", onOnline);
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
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setLoadingEarlier(false);
		}
	}, [sessionId, first]);

	// The latest page slides forward as the session grows; once earlier pages are loaded, that leaves
	// a hole between them. Fetch it, so nothing goes missing.
	const latestStart = latest.data?.start ?? 0;
	const earlierEnd = earlier.length ? (earlier.at(-1)?.start ?? 0) + (earlier.at(-1)?.items.length ?? 0) : 0;
	useEffect(() => {
		if (!sessionId || !earlier.length || latestStart <= earlierEnd) return;
		let cancelled = false;
		void client.sessions
			.history({ sessionId, before: latestStart, limit: Math.min(1000, latestStart - earlierEnd) })
			.then((page) => {
				if (!cancelled) setEarlier((pages) => [...pages, page]);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [sessionId, earlier.length, latestStart, earlierEnd]);

	const items = useMemo(
		() => [...earlier.flatMap((p) => p.items), ...(latest.data?.items ?? [])],
		[earlier, latest.data],
	);

	return { items, isLoading: latest.isLoading, error: latest.error, hasEarlier, loadEarlier, loadingEarlier };
}

/**
 * Lays items from this visit's runs into the saved history. An item history knows replaces its copy
 * in place; one it doesn't (a notice seen only live, or a turn not written yet) goes right after the
 * last known item before it, so a refresh never moves anything to the bottom.
 */
function weave(out: Item[], list: Item[], windowStartsLater: boolean) {
	const position = (id: string) => out.findIndex((item) => item.id === id);
	const firstKnown = list.find((item) => position(item.id) !== -1);
	// History hasn't caught up with this run yet: it all comes after.
	if (!firstKnown) {
		for (const item of list) if (position(item.id) === -1) out.push(item);
		return;
	}
	let lead = position(firstKnown.id);
	// Before the first known item and the loaded window starts there: it's older than the window.
	const dropLeading = windowStartsLater && lead === 0;
	let anchor = -1;
	for (const item of list) {
		const at = position(item.id);
		if (at !== -1) {
			out[at] = item;
			anchor = at;
		} else if (anchor === -1) {
			if (!dropLeading) out.splice(lead++, 0, item);
		} else {
			out.splice(++anchor, 0, item);
		}
	}
}

/** History, then earlier runs from this visit, then the live run; later copies of an id win. */
export function mergeTimeline(history: Item[], retired: Item[], live: Item[], windowStartsLater = false) {
	const out = [...history];
	weave(out, retired, windowStartsLater);
	weave(out, live, windowStartsLater);
	return out;
}
