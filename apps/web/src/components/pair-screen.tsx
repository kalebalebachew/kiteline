import { Button } from "@kiteline/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, QrCode, TerminalSquare } from "lucide-react";
import { useState } from "react";

import { pair } from "@/lib/auth";

import { KiteMark } from "./brand";

export function PairScreen({ initialError }: { initialError?: string | null }) {
	const queryClient = useQueryClient();
	const [value, setValue] = useState("");
	const [error, setError] = useState(initialError ?? null);
	const [busy, setBusy] = useState(false);

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		if (!value.trim()) return;
		setBusy(true);
		setError(null);
		const result = await pair(value);
		setBusy(false);
		if (result.ok) queryClient.setQueryData(["auth"], { authed: true });
		else setError(result.error);
	}

	return (
		<div className="relative flex min-h-dvh flex-col overflow-hidden">
			<div className="halo pointer-events-none absolute inset-x-0 top-0 h-[28rem]" />
			<main className="pt-safe relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
				<div className="relative mb-10 inline-flex size-20 items-center justify-center">
					<div className="aurora absolute inset-2 rounded-full opacity-35 blur-2xl" />
					<div className="border-border-strong bg-surface elevated relative inline-flex size-20 items-center justify-center rounded-[1.6rem] border">
						<KiteMark className="size-12" live />
					</div>
				</div>
				<h1 className="font-display text-[2.75rem] leading-[1.02] tracking-tight">
					Your terminal,
					<br />
					<span className="aurora-text italic">in your pocket.</span>
				</h1>
				<p className="text-muted-foreground mt-4 text-[0.9375rem] leading-relaxed">
					Kiteline runs Claude Code on your computer. Pair this device once and it stays paired.
				</p>

				<ol className="mt-8 space-y-3.5">
					{[
						{ icon: TerminalSquare, text: "Start Kiteline on your computer with pnpm start." },
						{ icon: QrCode, text: "Scan the QR code it prints with this phone's camera." },
						{ icon: KeyRound, text: "Or paste the pairing link below." },
					].map(({ icon: Icon, text }, i) => (
						<li key={text} className="flex items-start gap-3 text-sm">
							<span className="border-border bg-surface text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums">
								{i + 1}
							</span>
							<span className="text-muted-foreground flex items-center gap-2 pt-1">
								<Icon className="text-faint size-4 shrink-0" />
								{text}
							</span>
						</li>
					))}
				</ol>

				<form onSubmit={submit} className="mt-8 space-y-3">
					<label htmlFor="pair" className="sr-only">
						Pairing link or code
					</label>
					<input
						id="pair"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="Pairing link or code"
						autoComplete="off"
						autoCapitalize="off"
						spellCheck={false}
						className="border-border-strong bg-surface placeholder:text-faint focus:border-aurora-1/60 focus:ring-aurora-1/10 h-13 w-full rounded-2xl border px-4 font-mono text-[0.9375rem] outline-none placeholder:font-sans focus:ring-4"
					/>
					{error ? <p className="text-destructive text-sm">{error}</p> : null}
					<Button
						type="submit"
						variant="aurora"
						size="lg"
						className="w-full"
						disabled={busy || !value.trim()}
					>
						{busy ? "Pairing…" : "Pair this device"}
					</Button>
				</form>
			</main>
		</div>
	);
}
