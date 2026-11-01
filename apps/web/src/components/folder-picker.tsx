import { Button } from "@kiteline/ui/components/button";
import { Sheet } from "@kiteline/ui/components/sheet";
import { cn } from "@kiteline/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Folder, FolderGit2, Home } from "lucide-react";
import { useEffect, useState } from "react";

import { tildify } from "@/lib/format";
import { orpc } from "@/lib/orpc";

export function FolderPicker({
	open,
	onOpenChange,
	start,
	onPick,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	start: string | null;
	onPick: (path: string) => void;
}) {
	const [path, setPath] = useState<string | undefined>(start ?? undefined);
	useEffect(() => {
		if (open) setPath(start ?? undefined);
	}, [open, start]);

	const dirs = useQuery({
		...orpc.fs.dirs.queryOptions({ input: { path } }),
		enabled: open,
		placeholderData: (p) => p,
	});
	const data = dirs.data;

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title="Choose a folder"
			description={data ? <span className="font-mono text-xs">{tildify(data.path)}</span> : "Loading…"}
			footer={
				<Button
					variant="aurora"
					size="lg"
					className="w-full"
					disabled={!data}
					onClick={() => {
						if (data) onPick(data.path);
						onOpenChange(false);
					}}
				>
					Start here
				</Button>
			}
		>
			<div className="mb-2 flex gap-1.5">
				<button
					type="button"
					disabled={!data?.parent}
					onClick={() => data?.parent && setPath(data.parent)}
					className="border-border text-muted-foreground inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-[0.8125rem] font-medium disabled:opacity-40"
				>
					<ChevronLeft className="size-4" />
					Up
				</button>
				<button
					type="button"
					onClick={() => setPath(data?.home)}
					className="border-border text-muted-foreground inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[0.8125rem] font-medium"
				>
					<Home className="size-4" />
					Home
				</button>
			</div>
			<div
				className={cn("border-border overflow-hidden rounded-2xl border", dirs.isFetching && "opacity-70")}
			>
				{data?.dirs.length === 0 ? (
					<p className="text-faint px-4 py-6 text-center text-sm">No folders in here</p>
				) : null}
				{data?.dirs.map((dir, i) => (
					<button
						key={dir.path}
						type="button"
						onClick={() => setPath(dir.path)}
						className={cn(
							"active:bg-surface-2 flex h-12 w-full items-center gap-3 px-4 text-left text-[0.9375rem]",
							i && "border-border border-t",
						)}
					>
						{dir.isGit ? (
							<FolderGit2 className="text-aurora-1 size-4 shrink-0" />
						) : (
							<Folder className="text-faint size-4 shrink-0" />
						)}
						<span className="min-w-0 flex-1 truncate">{dir.name}</span>
						<ChevronRight className="text-faint size-4 shrink-0" />
					</button>
				))}
			</div>
		</Sheet>
	);
}
