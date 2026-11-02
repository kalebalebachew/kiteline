import {
	getSessionInfo,
	getSessionMessages,
	listSessions,
	renameSession,
} from "@anthropic-ai/claude-agent-sdk";

import { transcriptToItems } from "./normalize";
import type { HistoryPage, Item, SessionInfo } from "./types";

type CachedTranscript = { key: string; items: Item[] };
const transcripts = new Map<string, CachedTranscript>();
const MAX_CACHED = 12;

function toInfo(s: Awaited<ReturnType<typeof listSessions>>[number]): SessionInfo {
	return {
		provider: "claude",
		sessionId: s.sessionId,
		title: s.customTitle || s.summary || s.firstPrompt || "Untitled session",
		firstPrompt: s.firstPrompt ?? null,
		cwd: s.cwd ?? null,
		gitBranch: s.gitBranch ?? null,
		lastModified: s.lastModified,
		createdAt: s.createdAt ?? null,
		sizeBytes: s.fileSize ?? null,
	};
}

export async function listAllSessions(
	options: { limit: number; cwd?: string },
	tracked: readonly { id: string; cwd: string }[],
): Promise<SessionInfo[]> {
	const sessions = await listSessions({
		limit: options.limit,
		includeProgrammatic: false,
		...(options.cwd ? { dir: options.cwd } : {}),
	});
	const seen = new Set(sessions.map((s) => s.sessionId));
	const extra = await Promise.all(
		tracked
			.filter((t) => !seen.has(t.id) && (!options.cwd || t.cwd === options.cwd))
			.slice(0, 120)
			.map((t) => getSessionInfo(t.id, { dir: t.cwd }).catch(() => undefined)),
	);
	for (const info of extra) if (info) sessions.push(info);
	sessions.sort((a, b) => b.lastModified - a.lastModified);
	return sessions.slice(0, options.limit).map(toInfo);
}

/**
 * Kiteline's own sessions are SDK sessions, which `includeProgrammatic: false`
 * hides from the main list. This finds one by id regardless.
 */
export async function sessionInfo(sessionId: string): Promise<SessionInfo | null> {
	const info = await getSessionInfo(sessionId);
	return info ? toInfo(info) : null;
}

export async function historyPage(
	sessionId: string,
	options: { before?: number; limit: number },
): Promise<HistoryPage> {
	const info = await getSessionInfo(sessionId);
	if (!info) return { items: [], start: 0, total: 0 };

	const key = `${info.lastModified}:${info.fileSize ?? 0}`;
	let cached = transcripts.get(sessionId);
	if (cached?.key !== key) {
		const messages = await getSessionMessages(sessionId, info.cwd ? { dir: info.cwd } : {});
		cached = { key, items: transcriptToItems(messages) };
		transcripts.delete(sessionId);
		transcripts.set(sessionId, cached);
		while (transcripts.size > MAX_CACHED) {
			const oldest = transcripts.keys().next().value;
			if (oldest === undefined) break;
			transcripts.delete(oldest);
		}
	}

	const total = cached.items.length;
	const end = Math.min(options.before ?? total, total);
	const start = Math.max(0, end - options.limit);
	return { items: cached.items.slice(start, end), start, total };
}

export async function rename(sessionId: string, title: string) {
	await renameSession(sessionId, title);
	transcripts.delete(sessionId);
}
