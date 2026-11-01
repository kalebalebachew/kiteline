const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeTime(ms: number, now = Date.now()) {
	const seconds = Math.round((ms - now) / 1000);
	const abs = Math.abs(seconds);
	if (abs < 45) return "just now";
	if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
	if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
	if (abs < 86_400 * 7) return rtf.format(Math.round(seconds / 86_400), "day");
	return new Date(ms).toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function dayBucket(ms: number, now = new Date()) {
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	if (ms >= start) return "Today";
	if (ms >= start - 86_400_000) return "Yesterday";
	if (ms >= start - 6 * 86_400_000) return "This week";
	if (ms >= start - 29 * 86_400_000) return "This month";
	return "Earlier";
}

let home = "";
export function setHome(path: string) {
	home = path;
}

export function tildify(path: string) {
	return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

export function baseName(path: string) {
	const parts = path.replace(/\/+$/, "").split("/");
	return parts[parts.length - 1] || path;
}

/** "src/routes/index.tsx" from an absolute path inside the session's folder. */
export function relativeTo(path: string, cwd: string | null | undefined) {
	if (cwd && path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1);
	return tildify(path);
}

export function formatCost(usd: number) {
	if (usd < 0.01) return "<$0.01";
	return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

export function formatDuration(ms: number) {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	return `${m}m ${s % 60}s`;
}

export function compactNumber(n: number) {
	return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function greeting(now = new Date()) {
	const h = now.getHours();
	if (h < 5) return "Up late";
	if (h < 12) return "Good morning";
	if (h < 18) return "Good afternoon";
	return "Good evening";
}
