import type { PermissionModeId } from "@kiteline/api/agent/types";
import { ClipboardList, Hand, type LucideIcon, PencilLine, ShieldOff, Sparkles } from "lucide-react";

export const MODES: {
	id: PermissionModeId;
	title: string;
	short: string;
	description: string;
	icon: LucideIcon;
}[] = [
	{
		id: "default",
		title: "Ask first",
		short: "Ask",
		description: "Approve each edit and command from here.",
		icon: Hand,
	},
	{
		id: "acceptEdits",
		title: "Auto-accept edits",
		short: "Edits",
		description: "File edits go through; commands still ask.",
		icon: PencilLine,
	},
	{
		id: "plan",
		title: "Plan only",
		short: "Plan",
		description: "Reads and plans. Changes nothing until you approve.",
		icon: ClipboardList,
	},
	{
		id: "auto",
		title: "Auto",
		short: "Auto",
		description: "A safety classifier approves routine calls and asks about the rest.",
		icon: Sparkles,
	},
	{
		id: "bypassPermissions",
		title: "Bypass permissions",
		short: "Bypass",
		description: "Never asks. Only for throwaway work.",
		icon: ShieldOff,
	},
];

const ASK = MODES[0] as (typeof MODES)[number];

export function modeInfo(id: PermissionModeId | null | undefined) {
	return MODES.find((m) => m.id === id) ?? ASK;
}

export const MODELS: { id: string | null; title: string; description: string }[] = [
	{ id: null, title: "Default", description: "Whatever your Claude Code settings pick" },
	{ id: "opus", title: "Opus", description: "Most capable for hard problems" },
	{ id: "sonnet", title: "Sonnet", description: "Fast and strong for everyday work" },
	{ id: "haiku", title: "Haiku", description: "Quickest for small tasks" },
];

/** "claude-opus-5-5" → "Opus 5.5" */
export function modelLabel(model: string | null | undefined) {
	if (!model) return "Default";
	const match = model.match(/(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d+))?/i);
	const [, family, major, minor] = match ?? [];
	if (!family || !major) return MODELS.find((m) => m.id === model)?.title ?? model;
	const name = family.charAt(0).toUpperCase() + family.slice(1);
	// A third number that long is a date stamp, not a minor version.
	return `${name} ${major}${minor && minor.length < 3 ? `.${minor}` : ""}`;
}
