import type { DeviceInfo, PairRequestInfo } from "@kiteline/api/devices";
import { Button } from "@kiteline/ui/components/button";
import { cn } from "@kiteline/ui/lib/utils";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DEVICES_KEY, useDevices } from "@/lib/devices";
import { relativeTime } from "@/lib/format";
import { client, errorMessage } from "@/lib/orpc";
import { clock, useNow } from "@/lib/use-now";

import { CopyButton } from "./copy-button";
import { DeviceIcon } from "./device-icon";

const day = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });

function status(device: DeviceInfo) {
	const used = device.active
		? "Active now"
		: device.lastSeen
			? `Last used ${relativeTime(Date.parse(device.lastSeen))}`
			: "Not used yet";
	return `${used} · paired ${day(device.pairedAt)}`;
}

/** This device first, then the most recently used. */
function order(a: DeviceInfo, b: DeviceInfo) {
	const used = (d: DeviceInfo) => (d.active ? Date.now() : d.lastSeen ? Date.parse(d.lastSeen) : 0);
	return Number(b.current) - Number(a.current) || used(b) - used(a);
}

/** Every device paired with this computer: when each was last used, a way to cut any one off, and room for one more. */
export function DeviceList() {
	const { data } = useDevices();
	const devices = [...(data?.devices ?? [])].sort(order);
	return (
		<>
			{devices.map((device, i) => (
				<DeviceRow key={device.id} device={device} first={i === 0} />
			))}
			<PairAnother first={!devices.length} requests={data?.requests ?? []} />
		</>
	);
}

function DeviceRow({ device, first }: { device: DeviceInfo; first: boolean }) {
	return (
		<div className="pl-4">
			<div
				className={cn("flex min-h-[60px] items-center gap-3 py-2.5 pr-3", !first && "border-border border-t")}
			>
				<span className="bg-surface-2 text-icon inline-flex size-9 flex-none items-center justify-center rounded-full">
					<DeviceIcon name={device.name} className="size-[18px]" />
				</span>
				<div className="min-w-0 flex-1">
					<p className="flex items-center gap-2 text-[15px] leading-tight">
						<span className="truncate">{device.name}</span>
						{device.current ? (
							<span className="bg-brand-soft text-brand-text flex-none rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium">
								This device
							</span>
						) : null}
					</p>
					<p className="text-muted-foreground mt-1 truncate text-[13px] leading-tight">{status(device)}</p>
				</div>
				{device.current ? null : <RemoveButton device={device} />}
			</div>
		</div>
	);
}

/** Two taps: the first asks, the second removes, and it cuts the device off at once. */
function RemoveButton({ device }: { device: DeviceInfo }) {
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);
	const remove = useMutation({
		mutationFn: () => client.devices.remove({ id: device.id }),
		onSuccess: () => {
			queryClient.setQueryData(DEVICES_KEY, (current: typeof undefined | { devices: DeviceInfo[] }) =>
				current ? { ...current, devices: current.devices.filter((d) => d.id !== device.id) } : current,
			);
			toast.success(`Removed ${device.name}`, { description: "It can't reach this computer any more." });
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	useEffect(() => {
		if (!confirming) return;
		const timer = setTimeout(() => setConfirming(false), 4000);
		return () => clearTimeout(timer);
	}, [confirming]);

	if (confirming)
		return (
			<Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
				{remove.isPending ? "Removing…" : "Remove"}
			</Button>
		);
	return (
		<button
			type="button"
			aria-label={`Remove ${device.name}`}
			onClick={() => setConfirming(true)}
			className="text-icon hover:bg-surface-2 hover:text-destructive inline-flex size-9 flex-none items-center justify-center rounded-full transition-colors"
		>
			<TrashIcon className="size-[18px]" />
		</button>
	);
}

type Code = Awaited<ReturnType<typeof client.devices.code>>;

/** A one-time code for the next device, right here: once it's used, the request to allow comes up. */
function PairAnother({ first, requests }: { first: boolean; requests: PairRequestInfo[] }) {
	const [code, setCode] = useState<Code | null>(null);
	const make = useMutation({
		mutationFn: () => client.devices.code(),
		onSuccess: setCode,
		onError: (error) => toast.error(errorMessage(error)),
	});
	const now = useNow(code ? 1000 : null);
	const left = code ? code.expiresAt - now : 0;
	// Used, so spent: the request to allow it takes over from here.
	const used = !!code && requests.some((r) => r.code === code.id);
	useEffect(() => {
		if (used || (code && left <= 0)) setCode(null);
	}, [used, code, left]);

	if (!code || left <= 0) {
		return (
			<button
				type="button"
				onClick={() => make.mutate()}
				disabled={make.isPending}
				className="hover:bg-surface-2/60 block w-full pl-4 text-left transition-colors"
			>
				<span
					className={cn(
						"text-brand-text flex min-h-12 items-center gap-3 py-2 pr-3 text-[15px] font-medium",
						!first && "border-border border-t",
					)}
				>
					<span className="bg-brand-soft inline-flex size-9 flex-none items-center justify-center rounded-full">
						<PlusIcon weight="bold" className="size-4" />
					</span>
					{make.isPending ? "Making a code…" : "Pair a new device"}
				</span>
			</button>
		);
	}

	return (
		<div className={cn("p-5", !first && "border-border border-t")}>
			<div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
				<div
					className="shadow-card size-44 flex-none overflow-hidden rounded-xl bg-white p-2.5 [&_svg]:size-full"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated by the server's QR encoder.
					dangerouslySetInnerHTML={{ __html: code.svg }}
				/>
				<div className="w-full min-w-0 space-y-2.5">
					<p className="text-muted-foreground text-[14px] leading-snug">
						Scan it with the other device's camera, or send it this link. It works once, and you'll be asked
						to allow the device.
					</p>
					<div className="bg-surface-2 flex items-center gap-1 rounded-lg py-1 pr-1 pl-3">
						<span className="min-w-0 flex-1 truncate font-mono text-[12px]">{code.url}</span>
						<CopyButton text={code.url} label="Copy pairing link" />
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-faint text-[13px] tabular-nums">Works for {clock(left)}</span>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								void client.devices.cancelCode({ id: code.id }).catch(() => {});
								setCode(null);
							}}
						>
							Cancel
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
