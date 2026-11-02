import type { DevicesSnapshot, PairRequestInfo } from "@kiteline/api/devices";
import { Button } from "@kiteline/ui/components/button";
import { Sheet } from "@kiteline/ui/components/sheet";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { allowedHere, useDevicesStream } from "@/lib/devices";
import { relativeTime } from "@/lib/format";
import { client, errorMessage } from "@/lib/orpc";
import { spaced } from "@/lib/use-now";

import { DeviceIcon } from "./device-icon";

const SEEN = "kiteline:devices:seen:";

function readSeen(key: string) {
	try {
		return Number(localStorage.getItem(key)) || null;
	} catch {
		return null;
	}
}

function writeSeen(key: string, value: number) {
	try {
		localStorage.setItem(key, String(value));
	} catch {}
}

/**
 * Tells this device about every other one that pairs, even while it was away: whoever allowed it,
 * you'd want to know. Remembers, per computer, the newest pairing it has told you about.
 */
function useNewDeviceAlerts(snapshot: DevicesSnapshot | null, review: () => void) {
	useEffect(() => {
		const me = snapshot?.devices.find((d) => d.current);
		if (!snapshot || !me) return;
		const key = SEEN + me.id;
		const seen = readSeen(key) ?? Date.parse(me.pairedAt);
		const others = snapshot.devices.filter((d) => !d.current);
		for (const device of others) {
			if (Date.parse(device.pairedAt) <= seen || allowedHere.has(device.id)) continue;
			toast(`${device.name} was paired`, {
				description: `${device.approvedBy === "terminal" ? "Allowed in the terminal" : `Allowed on ${device.approvedBy}`}, ${relativeTime(Date.parse(device.pairedAt))}. Not yours? Remove it in Settings.`,
				action: { label: "Review", onClick: review },
				duration: 12_000,
			});
		}
		const newest = Math.max(seen, ...others.map((d) => Date.parse(d.pairedAt)));
		if (newest !== readSeen(key)) writeSeen(key, newest);
	}, [snapshot, review]);
}

/**
 * Watches this computer's devices from any paired one: asks about each device that wants to pair,
 * like Bluetooth does, and says when one was paired.
 */
export function DeviceWatch() {
	const navigate = useNavigate();
	const snapshot = useDevicesStream();
	const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
	const [review] = useState(() => () => void navigate({ to: "/settings" }));
	useNewDeviceAlerts(snapshot, review);

	const request = snapshot?.requests.find((r) => !dismissed.has(r.id)) ?? null;
	return (
		<ApproveSheet request={request} onDone={(id) => setDismissed((previous) => new Set(previous).add(id))} />
	);
}

function ApproveSheet({
	request,
	onDone,
}: {
	request: PairRequestInfo | null;
	onDone: (id: string) => void;
}) {
	// Keeps the last request on screen while the sheet slides away.
	const [shown, setShown] = useState(request);
	const [busy, setBusy] = useState<"allow" | "decline" | null>(null);
	useEffect(() => {
		if (request) {
			setShown(request);
			setBusy(null);
		}
	}, [request]);

	const decide = async (allow: boolean) => {
		if (!shown || busy) return;
		setBusy(allow ? "allow" : "decline");
		try {
			const { device } = await client.devices.decide({ id: shown.id, allow });
			if (device) allowedHere.add(device.id);
			toast.success(allow ? `Paired ${shown.name}` : `Declined ${shown.name}`);
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			onDone(shown.id);
		}
	};

	return (
		<Sheet
			open={!!request}
			onOpenChange={(open) => {
				if (!open && shown) onDone(shown.id);
			}}
			eyebrow={
				<span className="text-muted-foreground text-[13px] font-medium">
					{shown?.via === "relay" ? "Through the relay" : "On your network"}
				</span>
			}
			title="A device wants to pair"
			description="Allow it only if it's yours, and its screen shows the same code."
			footer={
				<div className="flex gap-2">
					<Button
						variant="secondary"
						size="lg"
						className="flex-1"
						disabled={!!busy}
						onClick={() => void decide(false)}
					>
						Decline
					</Button>
					<Button size="lg" className="flex-[1.3]" disabled={!!busy} onClick={() => void decide(true)}>
						{busy === "allow" ? "Allowing…" : "Allow"}
					</Button>
				</div>
			}
		>
			{shown ? (
				<div className="bg-surface-2 rounded-2xl p-4">
					<div className="flex items-center gap-3">
						<span className="bg-raised text-icon shadow-card inline-flex size-10 flex-none items-center justify-center rounded-full">
							<DeviceIcon name={shown.name} className="size-5" />
						</span>
						<div className="min-w-0">
							<p className="truncate text-[15px] font-medium">{shown.name}</p>
							<p className="text-muted-foreground text-[13px]">Asked {relativeTime(shown.requestedAt)}</p>
						</div>
					</div>
					<div className="border-border mt-4 border-t pt-4 text-center">
						<p className="text-muted-foreground text-[13px]">Its screen shows</p>
						<p className="mt-1.5 text-[36px] leading-none font-semibold tracking-[0.06em] tabular-nums">
							<span className="sr-only">{shown.match.split("").join(" ")}</span>
							<span aria-hidden="true">{spaced(shown.match)}</span>
						</p>
					</div>
				</div>
			) : null}
		</Sheet>
	);
}
