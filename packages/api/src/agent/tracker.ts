import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type Entry = { id: string; cwd: string; at: number };

/**
 * Remembers which sessions Kiteline has driven. The SDK marks them as
 * programmatic, and the normal session list leaves programmatic ones out.
 */
export class SessionTracker {
	private entries: Entry[] = [];

	constructor(private readonly file: string) {
		try {
			const parsed = JSON.parse(readFileSync(file, "utf8")) as { sessions?: Entry[] };
			this.entries = Array.isArray(parsed.sessions) ? parsed.sessions : [];
		} catch {
			this.entries = [];
		}
	}

	add(id: string, cwd: string) {
		this.entries = [{ id, cwd, at: Date.now() }, ...this.entries.filter((e) => e.id !== id)].slice(0, 300);
		try {
			mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
			writeFileSync(this.file, `${JSON.stringify({ sessions: this.entries }, null, 2)}\n`, { mode: 0o600 });
		} catch {
			// Not fatal: the session still works, it just may not be listed after a restart.
		}
	}

	list(): readonly Entry[] {
		return this.entries;
	}
}
