import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	type ModelInfo,
	type Query,
	query,
	resolveSettings,
	type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { EFFORT_LEVELS, type EffortInfo, type EffortLevel } from "./types";

type Applied = { model?: string | null; effort?: EffortLevel | null };

/**
 * The model and effort level a Claude Code process will use for its next turn, after its settings,
 * caps and model support have had their say. The SDK sends this request, but its published types
 * don't list the method yet.
 */
export async function appliedSettings(q: Query): Promise<Applied | undefined> {
	const read = (q as unknown as { getSettings?: () => Promise<{ applied?: Applied } | undefined> })
		.getSettings;
	return (await read?.call(q))?.applied;
}

/** The levels a model offers, low to high; empty when it takes no effort level. */
export function levelsOf(model: ModelInfo): EffortLevel[] {
	if (!model.supportsEffort) return [];
	const offered = model.supportedEffortLevels;
	return offered?.length ? EFFORT_LEVELS.filter((level) => offered.includes(level)) : [...EFFORT_LEVELS];
}

/** A model by its alias ("opus"), or by the id an alias stands for ("claude-opus-5-5"). */
export function findModel(models: ModelInfo[], id: string | null | undefined) {
	if (!id) return undefined;
	return models.find((m) => m.value === id) ?? models.find((m) => m.resolvedModel === id);
}

type Catalog = {
	models: ModelInfo[];
	/** The level each model starts a new session at, with your saved settings: by model id. */
	starting: Map<string, EffortLevel>;
	/** Each model's own default, which `/effort auto` goes back to. */
	defaults: Map<string, EffortLevel>;
};

const REFRESH_MS = 6 * 60 * 60_000;
const RETRY_MS = 60_000;

/** Your Claude Code settings file, where `/effort` saves a level. */
function userSettingsFile() {
	return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
}

/**
 * The models Claude Code offers, the effort levels each takes and the level each starts at. Only a
 * running Claude Code can say, so this asks one that never gets a prompt: it costs nothing and
 * leaves no session behind. The answer covers sessions that aren't running; live ones ask their own.
 */
export class EffortCatalog {
	private loading: Promise<Catalog | null> | null = null;
	private loadedAt = 0;
	private settingsChanged = -1;

	constructor(private readonly claudePath: string | null) {}

	/** Asked again when your settings file changes, as it does when `/effort` saves a level. */
	private async catalog() {
		const changed = await stat(userSettingsFile()).then(
			(file) => file.mtimeMs,
			() => 0,
		);
		if (!this.loading || Date.now() - this.loadedAt > REFRESH_MS || changed !== this.settingsChanged) {
			this.settingsChanged = changed;
			this.loadedAt = Date.now();
			this.loading = this.probe().then((catalog) => {
				// A failure is tried again in a minute, not kept for hours.
				if (!catalog) this.loadedAt = Date.now() - REFRESH_MS + RETRY_MS;
				return catalog;
			});
		}
		return this.loading;
	}

	private async probe(): Promise<Catalog | null> {
		let release = () => {};
		const silent = (async function* (): AsyncGenerator<SDKUserMessage> {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		})();
		const q = query({
			prompt: silent,
			options: {
				cwd: homedir(),
				settingSources: ["user"],
				...(this.claudePath ? { pathToClaudeCodeExecutable: this.claudePath } : {}),
			},
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const read = async (): Promise<Catalog> => {
				const models = await q.supportedModels();
				const levelPerModel = async () => {
					const levels = new Map<string, EffortLevel>();
					for (const model of models) {
						if (!levelsOf(model).length) continue;
						await q.setModel(model.value);
						const applied = await appliedSettings(q);
						if (applied?.model && applied.effort) levels.set(applied.model, applied.effort);
					}
					return levels;
				};
				// What a new session gets: Claude Code applies your saved levels by its own rules.
				const starting = await levelPerModel();
				// Then each model's own default, with the saved levels set aside.
				await q.applyFlagSettings({ effortLevel: null });
				const defaults = await levelPerModel();
				return { models, starting, defaults };
			};
			const timeout = new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("Claude Code took too long to list its models.")), 30_000);
			});
			return await Promise.race([read(), timeout]);
		} catch (error) {
			if (process.env.KITELINE_DEBUG) console.error("[kiteline] effort probe failed:", error);
			return null;
		} finally {
			clearTimeout(timer);
			release();
			q.close();
		}
	}

	/**
	 * Where a session would start in `cwd` on `model` (an alias, a model id, or null for the model
	 * your settings pick): the level you saved for that model, as `/effort` saves it, else its own.
	 */
	async startingPoint(cwd: string | null, model: string | null): Promise<EffortInfo> {
		const [catalog, wanted] = await Promise.all([
			this.catalog(),
			model ??
				resolveSettings({ cwd: cwd ?? homedir(), settingSources: ["user", "project", "local"] }).then(
					(settings) => settings.effective.model ?? "default",
					() => "default",
				),
		]);
		const entry = catalog
			? (findModel(catalog.models, wanted) ?? findModel(catalog.models, "default"))
			: undefined;
		const id = entry?.resolvedModel ?? entry?.value ?? wanted;
		const levels = entry ? levelsOf(entry) : null;
		const modelDefault = catalog?.defaults.get(id) ?? null;
		return { model: id, levels, effort: catalog?.starting.get(id) ?? modelDefault, modelDefault };
	}
}
