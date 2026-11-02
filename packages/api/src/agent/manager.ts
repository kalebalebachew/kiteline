import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";

import { getSessionInfo } from "@anthropic-ai/claude-agent-sdk";

import { EffortCatalog } from "./effort";
import { AsyncQueue } from "./queue";
import { type ImageInput, Run } from "./run";
import type { SessionTracker } from "./tracker";
import type {
	EffortChoice,
	EffortInfo,
	PermissionDecision,
	PermissionModeId,
	RunEvent,
	RunSnapshot,
	RunSummary,
} from "./types";

export type ManagerConfig = {
	claudePath: string | null;
	allowBypass: boolean;
	maxLiveRuns: number;
	/** An idle session's process is stopped after this long; the next message resumes it. */
	idleTimeoutMs: number;
	tracker: SessionTracker;
};

export type SendInput = {
	sessionId?: string;
	cwd?: string;
	text: string;
	images?: ImageInput[];
	permissionMode?: PermissionModeId;
	model?: string | null;
	/** An effort level picked while the session wasn't running. */
	effort?: EffortChoice;
};

export class RunManager {
	private readonly runs = new Map<string, Run>();
	/** Sessions being woken right now, so a second send waits and joins the same run. */
	private readonly starting = new Map<string, Promise<void>>();
	/** Runs that died with an error, kept a few minutes so a reconnecting phone still sees why. */
	private readonly failed = new Map<string, { snapshot: RunSnapshot; at: number }>();
	private readonly sessionWatchers = new Map<string, Set<AsyncQueue<RunEvent>>>();
	private readonly listWatchers = new Set<AsyncQueue<RunSummary[]>>();
	private listTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly effort: EffortCatalog;

	constructor(private readonly config: ManagerConfig) {
		this.effort = new EffortCatalog(config.claudePath);
		setInterval(() => this.reap(), 30_000).unref();
		// Learning the models takes Claude Code a few seconds; do it before a phone asks.
		setTimeout(() => void this.effort.startingPoint(null, null).catch(() => {}), 3_000).unref();
	}

	get tracker() {
		return this.config.tracker;
	}

	get(sessionId: string) {
		return this.runs.get(sessionId);
	}

	summaries(): RunSummary[] {
		return [...this.runs.values()]
			.filter((run) => run.isLive)
			.map((run) => ({
				sessionId: run.sessionId,
				cwd: run.cwd,
				title: run.title,
				status: run.status,
				pendingPermissions: run.pendingCount,
				startedAt: run.startedAt,
				lastActivity: run.lastActivity,
			}))
			.sort((a, b) => b.lastActivity - a.lastActivity);
	}

	async send(input: SendInput): Promise<{ sessionId: string }> {
		const text = input.text.trim();
		if (!text && !input.images?.length) throw new Error("Write a message first.");
		// A phone may still hold Bypass as its default after the server turned it off.
		const permissionMode =
			input.permissionMode === "bypassPermissions" && !this.config.allowBypass
				? "default"
				: input.permissionMode;

		// Another send is already waking this session: wait for it, then join the run it started.
		const waking = input.sessionId ? this.starting.get(input.sessionId) : undefined;
		if (waking) await waking;

		const live = input.sessionId ? this.runs.get(input.sessionId) : undefined;
		if (live?.isLive) {
			// The phone thought it was asleep; the level it picked still comes first.
			if (input.effort) await live.setEffort(input.effort).catch(() => {});
			live.send(text, input.images);
			return { sessionId: live.sessionId };
		}

		const sessionId = input.sessionId;
		if (!sessionId) return this.start({ ...input, permissionMode }, text);
		let started = () => {};
		this.starting.set(sessionId, new Promise<void>((resolve) => (started = resolve)));
		try {
			return await this.start({ ...input, permissionMode }, text);
		} finally {
			this.starting.delete(sessionId);
			started();
		}
	}

	/** Starts a Claude Code process for a new session, or wakes a sleeping one, and sends to it. */
	private async start(input: SendInput, text: string): Promise<{ sessionId: string }> {
		this.checkLimit();

		let cwd = input.cwd;
		let resume = false;
		let sessionId = input.sessionId;
		let title = "";
		if (sessionId) {
			const info = await getSessionInfo(sessionId);
			if (!info?.cwd) throw new Error("Kiteline can't find that session on this computer.");
			cwd = info.cwd;
			title = info.customTitle || info.summary || "";
			resume = true;
		} else {
			sessionId = randomUUID();
		}
		if (!cwd) throw new Error("Pick a project folder first.");
		const folder = await stat(cwd).catch(() => null);
		if (!folder?.isDirectory()) throw new Error(`${cwd} isn't a folder on this computer.`);
		// Count again: another session may have started while this one looked up its folder.
		this.checkLimit();

		const id = sessionId;
		this.failed.delete(id);
		const run = new Run(
			{
				sessionId: id,
				cwd,
				resume,
				permissionMode: input.permissionMode ?? "default",
				model: input.model ?? null,
				...(input.effort ? { effort: input.effort } : {}),
				claudePath: this.config.claudePath,
				allowBypass: this.config.allowBypass,
			},
			(event) => this.broadcast(id, event),
			() => this.scheduleListUpdate(),
		);
		run.title = title;
		this.runs.set(id, run);
		this.config.tracker.add(id, cwd);
		this.broadcast(id, { type: "snapshot", run: run.snapshot() });
		run.send(text, input.images);
		return { sessionId: id };
	}

	private checkLimit() {
		const liveCount = [...this.runs.values()].filter((run) => run.isLive).length;
		if (liveCount >= this.config.maxLiveRuns) {
			throw new Error(`${liveCount} sessions are already running. Stop one before starting another.`);
		}
	}

	respond(sessionId: string, permissionId: string, decision: PermissionDecision) {
		this.require(sessionId).respond(permissionId, decision);
	}

	async interrupt(sessionId: string) {
		await this.require(sessionId).interrupt();
	}

	async setPermissionMode(sessionId: string, mode: PermissionModeId) {
		if (mode === "bypassPermissions" && !this.config.allowBypass) {
			throw new Error("Bypass mode is turned off on this server.");
		}
		await this.require(sessionId).setPermissionMode(mode);
	}

	async setModel(sessionId: string, model: string | null) {
		await this.require(sessionId).setModel(model);
	}

	async setEffort(sessionId: string, choice: EffortChoice) {
		await this.require(sessionId).setEffort(choice);
	}

	/** Where a session that isn't running would start, for the effort sheet. */
	effortFor(cwd: string | null, model: string | null): Promise<EffortInfo> {
		return this.effort.startingPoint(cwd, model);
	}

	stop(sessionId: string) {
		this.runs.get(sessionId)?.close();
	}

	stopAll() {
		for (const run of this.runs.values()) run.close();
	}

	/** Snapshot first, then every event for this session, across process restarts. */
	async *watchSession(sessionId: string, signal?: AbortSignal): AsyncGenerator<RunEvent> {
		const queue = new AsyncQueue<RunEvent>();
		let watchers = this.sessionWatchers.get(sessionId);
		if (!watchers) {
			watchers = new Set();
			this.sessionWatchers.set(sessionId, watchers);
		}
		watchers.add(queue);
		const stop = () => queue.close();
		signal?.addEventListener("abort", stop, { once: true });
		if (signal?.aborted) queue.close();
		try {
			const run = this.runs.get(sessionId);
			const failed = this.failed.get(sessionId);
			const recent = failed && Date.now() - failed.at < 5 * 60_000 ? failed.snapshot : null;
			yield { type: "snapshot", run: run ? run.snapshot() : recent };
			for await (const event of queue) yield event;
		} finally {
			signal?.removeEventListener("abort", stop);
			watchers.delete(queue);
			if (watchers.size === 0) this.sessionWatchers.delete(sessionId);
		}
	}

	async *watchList(signal?: AbortSignal): AsyncGenerator<RunSummary[]> {
		const queue = new AsyncQueue<RunSummary[]>();
		this.listWatchers.add(queue);
		const stop = () => queue.close();
		signal?.addEventListener("abort", stop, { once: true });
		try {
			yield this.summaries();
			for await (const list of queue) yield list;
		} finally {
			signal?.removeEventListener("abort", stop);
			this.listWatchers.delete(queue);
		}
	}

	private require(sessionId: string) {
		const run = this.runs.get(sessionId);
		if (!run?.isLive) throw new Error("That session isn't running. Send a message to wake it.");
		return run;
	}

	private broadcast(sessionId: string, event: RunEvent) {
		for (const queue of this.sessionWatchers.get(sessionId) ?? []) queue.push(event);
		if (event.type === "status" || event.type === "permission" || event.type === "permission-resolved") {
			this.scheduleListUpdate();
		}
		if (event.type === "item" && event.item.kind === "user") this.scheduleListUpdate();
	}

	private scheduleListUpdate() {
		this.listTimer ??= setTimeout(() => {
			this.listTimer = null;
			for (const [id, run] of this.runs) {
				if (run.isLive) continue;
				if (run.status === "error") this.failed.set(id, { snapshot: run.snapshot(), at: Date.now() });
				this.runs.delete(id);
			}
			const list = this.summaries();
			for (const queue of this.listWatchers) queue.push(list);
		}, 100);
	}

	private reap() {
		const now = Date.now();
		for (const run of this.runs.values()) {
			if (
				run.status === "idle" &&
				run.pendingCount === 0 &&
				now - run.lastActivity > this.config.idleTimeoutMs
			) {
				run.close();
			}
		}
	}
}
