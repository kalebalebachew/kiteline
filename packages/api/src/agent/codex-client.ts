import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** The app-server v2 fields Kiteline consumes. Unknown events stay outside the browser contract. */
export type CodexItem = {
	type: string;
	id: string;
	text?: string;
	content?: { type: string; text?: string }[];
	summary?: string[];
	command?: string;
	cwd?: string;
	status?: string;
	aggregatedOutput?: string | null;
	exitCode?: number | null;
	changes?: { path: string; diff: string; kind: unknown }[];
	server?: string;
	tool?: string;
	arguments?: unknown;
	result?: unknown;
	error?: unknown;
};

export type CodexThread = {
	id: string;
	cwd: string;
	preview: string;
	name: string | null;
	createdAt: number;
	updatedAt: number;
	gitInfo: { branch?: string | null } | null;
	historyMode?: "legacy" | "paginated";
	turns: { id: string; items: CodexItem[] }[];
};

export type CodexModel = {
	model: string;
	displayName: string;
	description: string;
	hidden: boolean;
	isDefault: boolean;
	defaultReasoningEffort: string;
	supportedReasoningEfforts: { reasoningEffort: string }[];
};

export type CodexMessage = {
	id?: number | string;
	method?: string;
	params?: Record<string, unknown>;
	result?: unknown;
	error?: { code: number; message: string };
};

type Pending = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

/** One local stdio connection, using the user's existing Codex login and configuration. */
export class CodexClient {
	private readonly child;
	private readonly pending = new Map<number, Pending>();
	private sequence = 0;
	private ended = false;
	readonly ready: Promise<void>;

	constructor(
		path: string | null,
		private readonly onMessage?: (message: CodexMessage) => void,
		private readonly onExit: (error: Error) => void = () => {},
	) {
		this.child = spawn(path ?? "codex", ["app-server"], {
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		const lines = createInterface({ input: this.child.stdout });
		lines.on("line", (line) => {
			try {
				this.receive(JSON.parse(line) as CodexMessage);
			} catch {
				this.fail(new Error("Codex sent an invalid app-server message."));
			}
		});
		this.child.stderr.on("data", (data: Buffer) => {
			if (process.env.KITELINE_DEBUG) process.stderr.write(data);
		});
		this.child.stdin.on("error", (error) => this.fail(error));
		this.child.on("error", (error) => {
			const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
			this.fail(
				missing
					? new Error("Codex isn't installed. Install and sign in to the Codex CLI, or set CODEX_PATH.")
					: error,
			);
		});
		this.child.on("exit", (code, signal) => {
			lines.close();
			this.fail(new Error(`Codex app-server stopped (${signal ?? code ?? "unknown"}).`));
		});
		this.ready = this.request("initialize", {
			clientInfo: { name: "kiteline", title: "Kiteline", version: "0.2.0" },
		}).then(() => this.write({ method: "initialized" }));
	}

	async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
		await this.ready;
		return this.request(method, params) as Promise<T>;
	}

	respond(id: number | string, result: unknown) {
		this.write({ id, result });
	}

	reject(id: number | string, message: string) {
		this.write({ id, error: { code: -32601, message } });
	}

	close() {
		if (this.ended) return;
		this.fail(new Error("Codex connection closed."), false);
	}

	private request(method: string, params: Record<string, unknown>): Promise<unknown> {
		if (this.ended) return Promise.reject(new Error("Codex connection is closed."));
		const id = ++this.sequence;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.fail(new Error(`Codex took too long to answer ${method}.`));
			}, 60_000);
			timer.unref();
			this.pending.set(id, { resolve, reject, timer });
			this.write({ id, method, params });
		});
	}

	private write(message: CodexMessage) {
		if (this.ended) throw new Error("Codex connection is closed.");
		this.child.stdin.write(`${JSON.stringify(message)}\n`);
	}

	private receive(message: CodexMessage) {
		if (!message.method && typeof message.id === "number") {
			const pending = this.pending.get(message.id);
			if (!pending) return;
			this.pending.delete(message.id);
			clearTimeout(pending.timer);
			if (message.error) pending.reject(new Error(message.error.message));
			else pending.resolve(message.result);
			return;
		}
		this.onMessage?.(message);
		// Unhandled server requests must fail closed, rather than silently granting permissions.
		if (message.id !== undefined && message.method && !this.onMessage) {
			this.reject(message.id, `Kiteline doesn't support ${message.method}.`);
		}
	}

	private fail(error: Error, notify = true) {
		if (this.ended) return;
		this.ended = true;
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
		this.child.stdin.destroy();
		this.child.kill();
		const child = this.child;
		setTimeout(() => {
			if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
		}, 2000).unref();
		if (notify) this.onExit(error);
	}
}
