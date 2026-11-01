import { cn } from "@kiteline/ui/lib/utils";
import { diffLines } from "diff";
import { useMemo, useState } from "react";

type Row = { kind: "add" | "del" | "same"; text: string; oldNo: number | null; newNo: number | null };
type Block = { kind: "rows"; rows: Row[] } | { kind: "gap"; rows: Row[] };

const CONTEXT = 3;

function toRows(before: string, after: string): Row[] {
	const rows: Row[] = [];
	let oldNo = 1;
	let newNo = 1;
	for (const change of diffLines(before, after)) {
		const lines = change.value.replace(/\n$/, "").split("\n");
		for (const text of lines) {
			if (change.added) rows.push({ kind: "add", text, oldNo: null, newNo: newNo++ });
			else if (change.removed) rows.push({ kind: "del", text, oldNo: oldNo++, newNo: null });
			else rows.push({ kind: "same", text, oldNo: oldNo++, newNo: newNo++ });
		}
	}
	return rows;
}

/** Folds long unchanged stretches so the edit itself is what you see. */
function toBlocks(rows: Row[]): Block[] {
	const keep = rows.map(() => false);
	rows.forEach((row, i) => {
		if (row.kind === "same") return;
		for (let j = Math.max(0, i - CONTEXT); j <= Math.min(rows.length - 1, i + CONTEXT); j++) keep[j] = true;
	});
	const blocks: Block[] = [];
	rows.forEach((row, i) => {
		const kind = keep[i] ? "rows" : "gap";
		const last = blocks[blocks.length - 1];
		if (last?.kind === kind) last.rows.push(row);
		else blocks.push({ kind, rows: [row] });
	});
	return blocks;
}

export function diffStats(before: string, after: string) {
	let added = 0;
	let removed = 0;
	for (const change of diffLines(before, after)) {
		if (change.added) added += change.count ?? 0;
		else if (change.removed) removed += change.count ?? 0;
	}
	return { added, removed };
}

function Line({ row }: { row: Row }) {
	return (
		<div
			className={cn(
				"grid grid-cols-[2.5rem_1rem_1fr] pr-3",
				row.kind === "add" && "bg-diff-add",
				row.kind === "del" && "bg-diff-del",
			)}
		>
			<span className="text-faint pr-2 text-right tabular-nums select-none">{row.newNo ?? row.oldNo}</span>
			<span
				className={cn(
					"text-center select-none",
					row.kind === "add" ? "text-success" : row.kind === "del" ? "text-destructive" : "text-transparent",
				)}
			>
				{row.kind === "add" ? "+" : row.kind === "del" ? "−" : " "}
			</span>
			<span className="whitespace-pre">{row.text || " "}</span>
		</div>
	);
}

function Gap({ rows }: { rows: Row[] }) {
	const [open, setOpen] = useState(false);
	if (open) return rows.map((row) => <Line key={`${row.oldNo}-${row.newNo}`} row={row} />);
	return (
		<button
			type="button"
			onClick={() => setOpen(true)}
			className="text-faint hover:text-foreground block w-full px-3 py-1 text-left font-sans text-[12px]"
		>
			⋯ {rows.length} unchanged {rows.length === 1 ? "line" : "lines"}
		</button>
	);
}

export function DiffView({
	before,
	after,
	className,
}: {
	before: string;
	after: string;
	className?: string;
}) {
	const blocks = useMemo(() => toBlocks(toRows(before, after)), [before, after]);
	return (
		<div className={cn("overflow-x-auto font-mono text-[12px] leading-[1.65]", className)}>
			<div className="min-w-max py-1">
				{blocks.map((block) =>
					block.kind === "gap" ? (
						<Gap key={`gap-${block.rows[0]?.oldNo}`} rows={block.rows} />
					) : (
						block.rows.map((row) => <Line key={`${row.oldNo}-${row.newNo}-${row.kind}`} row={row} />)
					),
				)}
			</div>
		</div>
	);
}
