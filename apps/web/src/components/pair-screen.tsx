import { Button } from "@kiteline/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { pair } from "@/lib/auth";
import { onRelay } from "@/lib/relay";

import { Wordmark } from "./brand";

const STEPS = [
	<>
		On your computer, run{" "}
		<code className="bg-surface-2 rounded-md px-1.5 py-0.5 font-mono text-[13px]">kiteline pair</code>.
	</>,
	<>Scan the code with this phone's camera.</>,
	<>Or paste the pairing link below.</>,
];

/** Through the relay, a bare code can't say which computer; the link does. */
const FIELD = onRelay ? "Pairing link" : "Pairing link or code";

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
		try {
			const result = await pair(value);
			if (result.ok) queryClient.setQueryData(["auth"], { authed: true });
			else setError(result.error);
		} catch {
			setError(
				"Couldn't reach your computer. Check that Kiteline is running, and that you're on its network.",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex min-h-dvh flex-col">
			<main className="pt-safe mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
				<Wordmark />
				<h1 className="mt-10 text-[28px] leading-tight font-semibold tracking-[-0.025em]">Pair this phone</h1>
				<p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
					Kiteline runs Claude Code or Codex on your computer. Pair once and this phone stays connected.
				</p>

				<ol className="mt-8 space-y-4">
					{STEPS.map((step, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of steps.
						<li key={i} className="flex items-start gap-3 text-[15px] leading-snug">
							<span className="bg-surface-2 text-muted-foreground inline-flex size-6 flex-none items-center justify-center rounded-full text-[12px] font-semibold tabular-nums">
								{i + 1}
							</span>
							<span className="pt-0.5">{step}</span>
						</li>
					))}
				</ol>

				<form onSubmit={submit} className="mt-8 space-y-3">
					<label htmlFor="pair" className="sr-only">
						{FIELD}
					</label>
					<input
						id="pair"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder={FIELD}
						autoComplete="off"
						autoCapitalize="off"
						spellCheck={false}
						className="bg-surface-2 placeholder:text-faint focus-visible:bg-surface-3 h-12 w-full rounded-xl px-4 font-mono text-[16px] outline-none placeholder:font-sans focus-visible:outline-none"
					/>
					{error ? <p className="text-destructive text-[13px]">{error}</p> : null}
					<Button type="submit" size="lg" className="w-full" disabled={busy || !value.trim()}>
						{busy ? "Pairing…" : "Pair this phone"}
					</Button>
				</form>
			</main>
		</div>
	);
}
