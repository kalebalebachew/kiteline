import type { DevicesSnapshot } from "@kiteline/api/devices";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { client, isUnauthorized, lostPairing } from "./orpc";

export const DEVICES_KEY = ["devices"] as const;

/** The paired devices and the ones asking to pair, kept current by the stream `useDevicesStream` holds. */
export function useDevices() {
	return useQuery({
		queryKey: DEVICES_KEY,
		queryFn: () => client.devices.list(),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/** Holds the devices stream open, coming back after it drops, and keeps the latest in the cache. */
export function useDevicesStream() {
	const queryClient = useQueryClient();
	const [snapshot, setSnapshot] = useState<DevicesSnapshot | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		const { signal } = controller;
		let attempt = 0;
		let wake: (() => void) | null = null;

		void (async () => {
			while (!signal.aborted) {
				try {
					const stream = await client.devices.watch(undefined, { signal });
					attempt = 0;
					for await (const next of stream) {
						setSnapshot(next);
						queryClient.setQueryData(DEVICES_KEY, next);
					}
				} catch (error) {
					if (signal.aborted) break;
					// Removed on another device, or the computer forgot this one: pair again.
					if (isUnauthorized(error)) {
						lostPairing();
						break;
					}
				}
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

	return snapshot;
}

/** Devices this phone allowed itself, which need no alert. */
export const allowedHere = new Set<string>();
