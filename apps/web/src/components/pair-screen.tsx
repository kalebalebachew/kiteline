import { Button } from "@kiteline/ui/components/button";
import { CaretLeftIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { OUTDATED, type PairAttempt, type PairLink, readPairLink, startPairing } from "@/lib/auth";
import { onRelay } from "@/lib/relay";
import { clock, spaced, useNow } from "@/lib/use-now";

import { KiteMark, Wordmark } from "./brand";

const STEPS = [
	<>
		On your computer, run{" "}
		<code className="bg-surface-2 rounded-md px-1.5 py-0.5 font-mono text-[13px] whitespace-nowrap">
			kiteline pair
		</code>
		.
	</>,
	<>Scan the code with this phone's camera, or paste the link below.</>,
	<>Allow this phone on the computer, after checking both show the same six digits.</>,
];

/** Through the relay, a bare code can't say which computer; the link does. */
const FIELD = onRelay ? "Pairing link" : "Pairing link or code";

const OUTDATED_LINK =
	"That link is from an older Kiteline. Update Kiteline on your computer (npm install -g kiteline@latest), restart it, then run kiteline pair.";
const STALE =
	"This phone isn't paired any more: it was removed, or Kiteline changed how pairing works. Pair it again.";
const UNREACHABLE =
	"Couldn't reach your computer. Check that Kiteline is running, and that you're on its network.";

/** One request per link, however often the screen mounts. */
const attempts = new WeakMap<PairLink, Promise<PairAttempt | { error: string }>>();
function attemptFor(link: PairLink) {
	let attempt = attempts.get(link);
	if (!attempt) {
		attempt = startPairing(link).catch(() => ({ error: UNREACHABLE }));
		attempts.set(link, attempt);
	}
	return attempt;
}

type View =
	| { step: "form"; error: string | null; note?: string }
	| { step: "asking" }
	| { step: "waiting"; attempt: PairAttempt }
	| { step: "paired" };

type Props = {
	/** A link this phone just opened, to ask with straight away. */
	link?: PairLink | typeof OUTDATED | null;
	stale?: boolean;
	onPaired: () => void;
	/** Already paired and here for another link: the way back. */
	onBack?: () => void;
};

export function PairScreen({ link, stale, onPaired, onBack }: Props) {
	const [view, setView] = useState<View>(() =>
		link === OUTDATED
			? { step: "form", error: OUTDATED_LINK }
			: link
				? { step: "asking" }
				: { step: "form", error: null, note: stale ? STALE : undefined },
	);
	const [value, setValue] = useState("");
	const cancelled = useRef(false);

	const ask = useCallback(
		(target: PairLink) => {
			cancelled.current = false;
			setView({ step: "asking" });
			void attemptFor(target).then((attempt) => {
				if ("error" in attempt) return setView({ step: "form", error: attempt.error });
				setView({ step: "waiting", attempt });
				void attempt.result.then((outcome) => {
					if (outcome.ok) {
						setView({ step: "paired" });
						onPaired();
					} else setView({ step: "form", error: cancelled.current ? null : outcome.error });
				});
			});
		},
		[onPaired],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only for the link this screen opened with.
	useEffect(() => {
		if (link && link !== OUTDATED) ask(link);
	}, [link]);

	function submit(event: React.FormEvent) {
		event.preventDefault();
		const parsed = readPairLink(value);
		if (parsed === OUTDATED) return setView({ step: "form", error: OUTDATED_LINK });
		if (!parsed)
			return setView({
				step: "form",
				error: "That doesn't look like a pairing link. Copy the whole link from your terminal.",
			});
		if (onRelay && !parsed.host)
			return setView({
				step: "form",
				error: "Paste the whole link from your computer: it says which computer to reach.",
			});
		ask(parsed);
	}

	return (
		<div className="flex min-h-dvh flex-col">
			{onBack ? (
				<div className="pt-safe mx-auto w-full max-w-md px-2">
					<button
						type="button"
						onClick={onBack}
						className="text-muted-foreground hover:text-foreground mt-2 inline-flex h-10 items-center gap-1 rounded-full px-3 text-[14px] font-medium"
					>
						<CaretLeftIcon weight="bold" className="size-4" />
						Back
					</button>
				</div>
			) : null}
			<main className="pt-safe mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
				<Wordmark />
				{view.step === "waiting" ? (
					<Waiting
						attempt={view.attempt}
						onCancel={() => {
							cancelled.current = true;
							view.attempt.cancel();
						}}
					/>
				) : view.step === "asking" || view.step === "paired" ? (
					<div className="mt-10 flex items-center gap-3">
						{view.step === "paired" ? (
							<CheckCircleIcon weight="fill" className="text-success size-6" />
						) : (
							<KiteMark live className="text-icon size-6" />
						)}
						<p className="text-[17px] font-medium">
							{view.step === "paired" ? "Paired." : "Asking your computer…"}
						</p>
					</div>
				) : (
					<>
						<h1 className="mt-10 text-[28px] leading-tight font-semibold tracking-[-0.025em]">
							Pair this phone
						</h1>
						<p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
							Kiteline runs Claude Code on your computer. Pair once and this phone stays connected.
						</p>
						{view.note ? (
							<p className="bg-surface-2 text-muted-foreground mt-5 rounded-xl px-3.5 py-3 text-[14px] leading-snug">
								{view.note}
							</p>
						) : null}

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
							{view.error ? <p className="text-destructive text-[13px] leading-snug">{view.error}</p> : null}
							<Button type="submit" size="lg" className="w-full" disabled={!value.trim()}>
								Pair this phone
							</Button>
						</form>
					</>
				)}
			</main>
		</div>
	);
}

/** The request is in: the person checks the digits match and allows it, on the computer or another device. */
function Waiting({ attempt, onCancel }: { attempt: PairAttempt; onCancel: () => void }) {
	const now = useNow(1000);
	const left = attempt.expiresAt - now;
	return (
		<>
			<h1 className="mt-10 text-[28px] leading-tight font-semibold tracking-[-0.025em]">Allow this phone</h1>
			<p className="text-muted-foreground mt-2 text-[15px] leading-relaxed">
				Allow it in the terminal where you ran{" "}
				<code className="bg-surface-2 rounded-md px-1.5 py-0.5 font-mono text-[13px] whitespace-nowrap">
					kiteline pair
				</code>
				, or on a device that's already paired. It should show the same code:
			</p>
			<div className="bg-surface shadow-card mt-7 rounded-2xl px-5 py-6 text-center">
				<p className="text-muted-foreground text-[13px] font-medium">This phone's code</p>
				<p className="mt-2 text-[44px] leading-none font-semibold tracking-[0.06em] tabular-nums">
					<span className="sr-only">{attempt.match.split("").join(" ")}</span>
					<span aria-hidden="true">{spaced(attempt.match)}</span>
				</p>
			</div>
			<p className="text-faint mt-4 flex items-center justify-center gap-2 text-[13px] tabular-nums">
				<span className="bg-brand size-1.5 animate-pulse rounded-full" />
				{left > 0 ? `Waiting · ${clock(left)} left` : "Waiting…"}
			</p>
			<Button variant="secondary" size="lg" className="mt-8 w-full" onClick={onCancel}>
				Cancel
			</Button>
		</>
	);
}
