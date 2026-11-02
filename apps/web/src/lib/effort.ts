import { EFFORT_LEVELS, type EffortChoice, type EffortLevel } from "@kiteline/api/agent/types";

export { EFFORT_LEVELS, type EffortChoice, type EffortLevel };

/**
 * Each level as Claude Code describes it in `/effort`, and its color there: low amber, medium green,
 * high blue, xhigh a violet shimmer and max a rainbow.
 */
export const EFFORT: Record<EffortLevel, { description: string; text: string }> = {
	low: {
		description: "Quick, straightforward implementation with minimal overhead.",
		text: "text-(--effort-low)",
	},
	medium: {
		description: "Balanced approach with standard implementation and testing.",
		text: "text-(--effort-medium)",
	},
	high: {
		description: "Comprehensive implementation with extensive testing and documentation.",
		text: "text-(--effort-high)",
	},
	xhigh: {
		description: "Deeper reasoning than high, just below maximum.",
		text: "effort-shimmer",
	},
	max: {
		description: "Maximum capability with deepest reasoning.",
		text: "effort-rainbow",
	},
};

/** What Claude Code says about max, word for word. */
export const MAX_WARNING =
	"May use excessive tokens resulting in long response times or overthinking. Use sparingly for the hardest tasks.";

export function isEffortLevel(value: string): value is EffortLevel {
	return (EFFORT_LEVELS as readonly string[]).includes(value);
}

/**
 * What a choice did, in the terminal's terms: a level saved as the default too, or for this session
 * only, or auto. `later` when the session isn't running and it applies from the next message.
 */
export function describeChoice(
	{ level, persist }: EffortChoice,
	{
		levels,
		modelName,
		modelDefault,
		later,
	}: {
		levels: readonly EffortLevel[] | null;
		modelName: string | null;
		modelDefault?: EffortLevel | null;
		later: boolean;
	},
): { title: string; description?: string } {
	const from = later ? "It applies from your next message." : "";
	if (!level) {
		const own = modelDefault ? `, ${modelDefault}` : "";
		return {
			title: "Effort set to auto for this session",
			description: `${modelName ?? "The model"} goes back to its own default${own}. ${from}`.trim(),
		};
	}
	const shown = fitLevel(level, levels);
	if (!persist || shown === "max") {
		return { title: `Effort set to ${shown} for this session`, ...(from ? { description: from } : {}) };
	}
	return {
		title: `Effort set to ${shown}`,
		description: `Also your default for new ${modelName ? `${modelName} ` : ""}sessions. ${from}`.trim(),
	};
}

/** Claude Code runs a level the model doesn't offer as high. */
export function fitLevel(level: EffortLevel, levels: readonly EffortLevel[] | null): EffortLevel {
	if (!levels?.length || levels.includes(level)) return level;
	return levels.includes("high") ? "high" : (levels.at(-1) ?? level);
}
