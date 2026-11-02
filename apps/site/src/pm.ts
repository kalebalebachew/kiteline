import { useSyncExternalStore } from "react";

/** The package managers the install commands come in. Kiteline runs on Node with each. */
export const MANAGERS = ["npm", "pnpm", "bun"] as const;
export type Manager = (typeof MANAGERS)[number];

const RUN: Record<Manager, string> = { npm: "npx", pnpm: "pnpm dlx", bun: "bunx" };
const INSTALL: Record<Manager, string> = { npm: "npm install -g", pnpm: "pnpm add -g", bun: "bun add -g" };

/** A command run once, without installing it: `npx kiteline --relay`. */
export const run = (manager: Manager, args: string) => `${RUN[manager]} ${args}`;

/** Installing for good: `npm install -g kiteline`. */
export const install = (manager: Manager, spec = "kiteline") => `${INSTALL[manager]} ${spec}`;

const KEY = "kiteline:pm";
const EVENT = "kiteline:pm";
/** Kept here too, for a browser that won't store it. */
let chosen: Manager | null = null;

function read(): Manager {
	if (chosen) return chosen;
	try {
		const saved = localStorage.getItem(KEY);
		if ((MANAGERS as readonly string[]).includes(saved ?? "")) return saved as Manager;
	} catch {}
	return "npm";
}

function subscribe(onChange: () => void) {
	window.addEventListener(EVENT, onChange);
	window.addEventListener("storage", onChange);
	return () => {
		window.removeEventListener(EVENT, onChange);
		window.removeEventListener("storage", onChange);
	};
}

function choose(manager: Manager) {
	chosen = manager;
	try {
		localStorage.setItem(KEY, manager);
	} catch {}
	window.dispatchEvent(new Event(EVENT));
}

/** The package manager you picked: every command on the site follows it, and this device remembers it. */
export function useManager(): [Manager, (manager: Manager) => void] {
	return [useSyncExternalStore(subscribe, read, () => "npm"), choose];
}

/** All three, for copies that can't switch, like the page as Markdown. */
export function everyManager(command: (manager: Manager) => string) {
	return MANAGERS.map((manager) => `# ${manager}\n${command(manager)}`).join("\n\n");
}
