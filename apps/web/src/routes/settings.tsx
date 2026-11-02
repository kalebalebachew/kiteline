import { Button } from "@kiteline/ui/components/button";
import { cn } from "@kiteline/ui/lib/utils";
import { CaretLeftIcon, DesktopIcon, MoonIcon, SignOutIcon, SunIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { KiteMark } from "@/components/brand";
import { DeviceList } from "@/components/device-list";
import { useTheme } from "@/components/theme-provider";
import { unpair } from "@/lib/auth";
import { MODELS, MODES } from "@/lib/modes";
import { orpc } from "@/lib/orpc";
import { setPrefs, usePrefs } from "@/lib/prefs";

export const Route = createFileRoute("/settings")({
	component: Settings,
});

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
	return (
		<section className="mt-7">
			<h2 className="text-muted-foreground mb-2 px-1 text-[13px] font-medium">{title}</h2>
			<div className="bg-surface shadow-card overflow-hidden rounded-2xl">{children}</div>
			{hint ? <p className="text-faint mt-2 px-1 text-[13px] leading-relaxed">{hint}</p> : null}
		</section>
	);
}

function Row({ label, children, first }: { label: ReactNode; children: ReactNode; first?: boolean }) {
	return (
		<div className="pl-4">
			<div
				className={cn(
					"flex min-h-12 items-center justify-between gap-4 py-2 pr-3",
					!first && "border-border border-t",
				)}
			>
				<span className="text-[15px]">{label}</span>
				<div className="text-muted-foreground min-w-0 text-right text-[14px]">{children}</div>
			</div>
		</div>
	);
}

function Segmented<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { value: T; label: string; icon?: ReactNode }[];
	onChange: (value: T) => void;
}) {
	return (
		<div className="bg-surface-2 inline-flex rounded-[10px] p-0.5">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					onClick={() => onChange(o.value)}
					className={cn(
						"inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
						value === o.value ? "bg-raised text-foreground shadow-card" : "text-muted-foreground",
					)}
				>
					{o.icon}
					<span className="trim">{o.label}</span>
				</button>
			))}
		</div>
	);
}

function Select<T extends string>({
	value,
	options,
	onChange,
	label,
}: {
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	label: string;
}) {
	return (
		<select
			aria-label={label}
			value={value}
			onChange={(e) => onChange(e.target.value as T)}
			className="bg-surface-2 text-foreground h-8 max-w-[11rem] rounded-lg px-2.5 text-[14px] font-medium outline-none"
		>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
	);
}

function Settings() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const prefs = usePrefs();
	const { theme, setTheme } = useTheme();
	const system = useQuery(orpc.system.info.queryOptions({ staleTime: 60_000 }));
	const info = system.data;

	return (
		<div className="min-h-dvh">
			<header className="pt-safe glass sticky top-0 z-30 shadow-[0_1px_0_var(--border)]">
				<div className="mx-auto flex h-14 max-w-2xl items-center gap-1 px-2">
					<button
						type="button"
						aria-label="Back"
						onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/" }))}
						className="text-icon hover:bg-surface-2 hover:text-foreground inline-flex size-10 items-center justify-center rounded-full transition-colors"
					>
						<CaretLeftIcon weight="bold" className="size-[18px]" />
					</button>
					<h1 className="text-[15px] font-semibold tracking-[-0.01em]">Settings</h1>
				</div>
			</header>

			<main className="mx-auto max-w-2xl px-4 pb-16">
				<Group
					title="Devices"
					hint="A pairing code works once, for ten minutes, and a device only gets in once you allow it, here or in the terminal. Removing one cuts it off at once."
				>
					<DeviceList />
				</Group>

				<Group title="Appearance">
					<Row label="Theme" first>
						<Segmented
							value={theme}
							onChange={setTheme}
							options={[
								{ value: "system", label: "Auto", icon: <DesktopIcon weight="fill" className="size-3.5" /> },
								{ value: "light", label: "Light", icon: <SunIcon weight="fill" className="size-3.5" /> },
								{ value: "dark", label: "Dark", icon: <MoonIcon weight="fill" className="size-3.5" /> },
							]}
						/>
					</Row>
				</Group>

				<Group title="New sessions start with">
					<Row label="Permissions" first>
						<Select
							label="Default permission mode"
							value={prefs.permissionMode}
							onChange={(v) => setPrefs({ permissionMode: v })}
							options={MODES.filter((m) => info?.allowBypass !== false || m.id !== "bypassPermissions").map(
								(m) => ({
									value: m.id,
									label: m.title,
								}),
							)}
						/>
					</Row>
					<Row label="Model">
						<Select
							label="Default model"
							value={prefs.model ?? "__default"}
							onChange={(v) => setPrefs({ model: v === "__default" ? null : v })}
							options={MODELS.map((m) => ({ value: m.id ?? "__default", label: m.title }))}
						/>
					</Row>
					<Row label="Return key">
						<Segmented
							value={prefs.enterToSend ? "on" : "off"}
							onChange={(v) => setPrefs({ enterToSend: v === "on" })}
							options={[
								{ value: "off", label: "New line" },
								{ value: "on", label: "Send" },
							]}
						/>
					</Row>
				</Group>

				<Group title="This computer">
					<Row label="Name" first>
						{info?.hostname ?? "…"}
					</Row>
					<Row label="Kiteline">{info ? `v${info.version}` : "…"}</Row>
				</Group>

				<Button
					variant="destructive"
					size="lg"
					className="mt-7 w-full"
					onClick={async () => {
						await unpair();
						queryClient.setQueryData(["auth"], { authed: false });
					}}
				>
					<SignOutIcon weight="bold" className="size-4" />
					Unpair this device
				</Button>

				<footer className="text-faint mt-12 flex flex-col items-center gap-3 text-center text-[13px]">
					<KiteMark className="text-faint size-7" />
					<p>
						Kiteline is open source and runs entirely on your computer.
						<br />
						Add it to your home screen for a full-screen app.
					</p>
				</footer>
			</main>
		</div>
	);
}
