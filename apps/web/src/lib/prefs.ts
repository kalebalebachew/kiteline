import type { PermissionModeId } from "@kiteline/api/agent/types";
import { useSyncExternalStore } from "react";

/** Per-device conveniences only; everything that matters lives on the server. */
export type Prefs = {
	permissionMode: PermissionModeId;
	model: string | null;
	enterToSend: boolean;
	recentProjects: string[];
};

const KEY = "kiteline:prefs:v1";
const DEFAULTS: Prefs = {
	permissionMode: "default",
	model: null,
	enterToSend: !window.matchMedia?.("(pointer: coarse)").matches,
	recentProjects: [],
};

function read(): Prefs {
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
	} catch {
		return DEFAULTS;
	}
}

let current = read();
const listeners = new Set<() => void>();

export function setPrefs(patch: Partial<Prefs>) {
	current = { ...current, ...patch };
	try {
		localStorage.setItem(KEY, JSON.stringify(current));
	} catch {
		// Private mode or blocked storage: keep the change for this visit only.
	}
	for (const listener of listeners) listener();
}

export function rememberProject(cwd: string) {
	setPrefs({ recentProjects: [cwd, ...current.recentProjects.filter((p) => p !== cwd)].slice(0, 8) });
}

export function usePrefs(): Prefs {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => current,
	);
}
