import { Button } from "@kiteline/ui/components/button";
import { Sheet } from "@kiteline/ui/components/sheet";
import { cn } from "@kiteline/ui/lib/utils";
import {
	ArrowUpIcon,
	CaretRightIcon,
	FolderSimpleIcon,
	GitBranchIcon,
	HouseIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
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
			description={data ? <span className="font-mono text-[13px]">{tildify(data.path)}</span> : "Loading…"}
			footer={
				<Button
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
			<div className="mb-3 flex gap-2">
				<Button
					variant="secondary"
					size="sm"
					disabled={!data?.parent}
					onClick={() => data?.parent && setPath(data.parent)}
				>
					<ArrowUpIcon weight="bold" className="size-3.5" />
					Up
				</Button>
				<Button variant="secondary" size="sm" onClick={() => setPath(data?.home)}>
					<HouseIcon weight="fill" className="size-3.5" />
					Home
				</Button>
			</div>
			<div className={cn("-mx-2 transition-opacity", dirs.isFetching && "opacity-60")}>
				{data?.dirs.length === 0 ? (
					<p className="text-faint px-2 py-8 text-center text-[14px]">No folders in here</p>
				) : null}
				{data?.dirs.map((dir) => (
					<button
						key={dir.path}
						type="button"
						onClick={() => setPath(dir.path)}
						className="hover:bg-surface-2 active:bg-surface-2 flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-[15px]"
					>
						{dir.isGit ? (
							<GitBranchIcon weight="fill" className="text-icon size-4 flex-none" />
						) : (
							<FolderSimpleIcon weight="fill" className="text-icon size-4 flex-none" />
						)}
						<span className="min-w-0 flex-1 truncate">{dir.name}</span>
						<CaretRightIcon weight="bold" className="text-faint size-3 flex-none" />
					</button>
				))}
			</div>
		</Sheet>
	);
}
