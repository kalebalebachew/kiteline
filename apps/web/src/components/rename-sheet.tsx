import { Button } from "@kiteline/ui/components/button";
import { Sheet } from "@kiteline/ui/components/sheet";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function RenameSheet({
	open,
	onOpenChange,
	initial,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initial: string;
	onSave: (title: string) => Promise<void>;
}) {
	const [value, setValue] = useState(initial);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		if (open) setValue(initial);
	}, [open, initial]);

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title="Rename session"
			description="The name shows here and in Claude Code's /resume list."
			footer={
				<Button
					variant="aurora"
					size="lg"
					className="w-full"
					disabled={busy || !value.trim()}
					onClick={async () => {
						setBusy(true);
						try {
							await onSave(value.trim());
							onOpenChange(false);
						} catch (error) {
							toast.error(error instanceof Error ? error.message : "Couldn't rename it.");
						} finally {
							setBusy(false);
						}
					}}
				>
					Save
				</Button>
			}
		>
			<input
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={200}
				aria-label="Session name"
				className="border-border-strong bg-surface focus:border-aurora-1/60 h-12 w-full rounded-2xl border px-4 text-[1rem] outline-none"
			/>
		</Sheet>
	);
}
