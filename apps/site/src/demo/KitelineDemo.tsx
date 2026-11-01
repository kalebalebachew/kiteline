import {
	ArrowUpIcon,
	CaretDownIcon,
	CpuIcon,
	FileTextIcon,
	FolderSimpleIcon,
	HandIcon,
	MagnifyingGlassIcon,
	NotePencilIcon,
	ShieldWarningIcon,
} from "@phosphor-icons/react";

import type { Act } from "../kit/act";
import { Collapse } from "../kit/motion/Collapse";
import { Roll } from "../kit/motion/Roll";
import { Stream } from "../kit/motion/Stream";
import { Phone } from "../kit/phone";
import { Stage } from "../kit/stage";
import { Bar, Window } from "../kit/window";
import "./demo.css";

// Kiteline's hero: a device pair. The editor on the laptop is pinned top-left
// and runs off the bottom; the phone straddles its right edge, cropped at the
// top so its approval sheet and the Allow button stay whole.
//
// Story, about 12s: Claude Code is working (context) -> it asks to edit
// src/auth.ts and the sheet rises on the phone -> a finger taps Allow -> the
// line changes in the editor on the computer -> the reply streams in on the
// phone (payoff, held). The loop fades the scene out and back to the start.
//
// Real strings: the request, Edit src/auth.ts, the two diff lines, Allow, the
// code in the editor, the reply. Everything else is a line or an icon.

type S = {
	thinking: boolean;
	ask: boolean;
	allowed: boolean;
	applied: boolean;
	words: number;
	cover: boolean;
};

const START: S = { thinking: true, ask: false, allowed: false, applied: false, words: 0, cover: false };
const REST = { wide: { x: 820, y: 330 }, compact: { x: 300, y: 300 } };

const REQUEST = "Signing in always lands on the home page. Send people back to where they were.";
const REPLY = "Fixed. After signing in, people go back to the page they started on.";
const REPLY_WORDS = REPLY.split(" ").length;

const POSTER: S = {
	thinking: false,
	ask: false,
	allowed: true,
	applied: true,
	words: REPLY_WORDS,
	cover: false,
};

const script = async (a: Act<S>) => {
	await a.wait(1300);
	a.mark("ask");
	a.put({ thinking: false, ask: true });
	await a.wait(2100);
	a.mark("allow");
	await a.click("allow");
	a.put({ ask: false, allowed: true });
	await a.wait(550);
	a.mark("applied");
	a.put({ applied: true });
	await a.wait(900);
	a.mark("reply");
	for (let i = 1; i <= REPLY_WORDS; i++) {
		a.put({ words: i });
		await a.wait(70);
	}
	await a.wait(2600);
	// The opening frame dissolves in over the payoff; the scene resets under it.
	a.put({ cover: true });
	await a.wait(620);
	await a.snap({ ...START, cover: true });
	await a.snap({ cover: false });
	await a.move(a.layout === "wide" ? REST.wide : REST.compact);
	await a.wait(200);
};

type Tok = [string, string?];

/** The file in the editor, as tokens: [text, kind]. Line 9 is the one that changes. */
const CODE: Tok[][] = [
	[["import", "kw"], [" { redirect } "], ["from", "kw"], [' "./router"', "str"]],
	[["import", "kw"], [" { session } "], ["from", "kw"], [' "./session"', "str"]],
	[],
	[["export async function", "kw"], [" login", "fn"], ["(form) {"]],
	[["  const", "kw"], [" user = "], ["await", "kw"], [" "], ["signIn", "fn"], ["(form)"]],
	[["  if", "kw"], [" (!user) "], ["return", "kw"], [" { error: "], ["true", "kw"], [" }"]],
	[],
	[["  const", "kw"], [" next = form."], ["get", "fn"], ["("], ['"next"', "str"], [")"]],
	"CHANGED" as unknown as Tok[],
	[["}"]],
	[],
	[["export function", "kw"], [" logout", "fn"], ["() {"]],
	[["  session."], ["end", "fn"], ["()"]],
	[["  return", "kw"], [" "], ["redirect", "fn"], ["("], ['"/login"', "str"], [")"]],
	[["}"]],
	[],
	[["export async function", "kw"], [" current", "fn"], ["() {"]],
	[["  const", "kw"], [" id = "], ["cookies", "fn"], ["()."], ["get", "fn"], ["("], ['"sid"', "str"], [")"]],
	[["  if", "kw"], [" (!id) "], ["return", "kw"], [" "], ["null", "kw"]],
	[["  return", "kw"], [" session."], ["find", "fn"], ["(id)"]],
	[["}"]],
	[],
	[["export function", "kw"], [" guard", "fn"], ["(path) {"]],
	[["  if", "kw"], [" ("], ["current", "fn"], ["()) "], ["return", "kw"]],
	[["  return", "kw"], [" "], ["redirect", "fn"], ["("], ['"/login"', "str"], [")"]],
	[["}"]],
];

function Editor({ applied }: { applied: boolean }) {
	return (
		<Window
			title="auth.ts"
			className="kl-editor"
			sidebarWidth={176}
			sidebar={
				<div className="kl-tree">
					<div className="kl-tree__row kl-tree__head">
						<Bar w={56} h={6} tone={3} />
					</div>
					<div className="kl-tree__row">
						<CaretDownIcon weight="bold" className="kl-tree__caret" />
						<FolderSimpleIcon weight="fill" className="kl-tree__icon" />
						<span>src</span>
					</div>
					<div className="kl-tree__row kl-tree__file" data-on="">
						<FileTextIcon weight="fill" className="kl-tree__icon" />
						<span>auth.ts</span>
					</div>
					{[52, 64, 44].map((w) => (
						<div key={w} className="kl-tree__row kl-tree__file">
							<FileTextIcon weight="fill" className="kl-tree__icon kl-faint" />
							<Bar w={w} h={6} tone={2} />
						</div>
					))}
					{[60, 48, 72, 40, 56, 66].map((w) => (
						<div key={w} className="kl-tree__row">
							<FolderSimpleIcon weight="fill" className="kl-tree__icon kl-faint" />
							<Bar w={w} h={6} tone={2} />
						</div>
					))}
				</div>
			}
		>
			<div className="kl-code">
				{CODE.map((line, i) => {
					const n = i + 1;
					if ((line as unknown) === "CHANGED") {
						return (
							<div key={n} className="kl-line" data-changed={applied || undefined}>
								<span className="kl-gutter">
									{n}
									<span className="kl-mark" />
								</span>
								<span className="kl-text">
									<span className="kl-kw">{"  return"}</span> <span className="kl-fn">redirect</span>(
									<Roll className="kl-arg">{applied ? 'next ?? "/"' : '"/"'}</Roll>)
								</span>
							</div>
						);
					}
					return (
						<div key={n} className="kl-line">
							<span className="kl-gutter">{n}</span>
							<span className="kl-text">
								{line.map(([text, kind], j) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed tokens of a line.
									<span key={j} className={kind ? `kl-${kind}` : undefined}>
										{text}
									</span>
								))}
							</span>
						</div>
					);
				})}
			</div>
		</Window>
	);
}

function Step({
	icon,
	verb,
	target,
	tone,
	children,
}: {
	icon: React.ReactNode;
	verb: string;
	target: string;
	tone?: "warn";
	children?: React.ReactNode;
}) {
	return (
		<div className="kl-step">
			<span className="kl-disc" data-tone={tone}>
				{icon}
			</span>
			<span className="kl-step__label">
				<span className="kl-step__verb">{verb}</span> <span className="kl-mono">{target}</span>
			</span>
			{children}
		</div>
	);
}

function KitelineScreen({ s }: { s: S }) {
	const editing = s.ask || s.allowed;
	return (
		<div className="kl-app" data-ask={s.ask || undefined}>
			<div className="kl-feed">
				<div className="kl-history">
					<div className="kl-bubble kl-bubble--filler">
						<Bar w={196} h={8} r={4} tone={3} />
						<Bar w={132} h={8} r={4} tone={3} />
					</div>
					<div className="kl-steps kl-steps--filler">
						<span className="kl-disc">
							<FileTextIcon weight="fill" />
						</span>
						<span className="kl-disc">
							<NotePencilIcon weight="fill" />
						</span>
						<span className="kl-disc">
							<MagnifyingGlassIcon weight="bold" />
						</span>
						<Bar w={52} h={8} r={4} tone={3} />
					</div>
					<div className="kl-prose">
						<Bar w={318} h={8} r={4} tone={2} />
						<Bar w={286} h={8} r={4} tone={2} />
						<Bar w={190} h={8} r={4} tone={2} />
					</div>
				</div>
				<div className="kl-bubble">{REQUEST}</div>

				<div className="kl-steps">
					<Step icon={<FileTextIcon weight="fill" />} verb="Read" target="src/auth.ts" />
					<Step icon={<MagnifyingGlassIcon weight="bold" />} verb="Searched" target="“next”" />
				</div>

				<div className="kl-prose">
					<Bar w={300} h={8} r={4} tone={2} />
					<Bar w={212} h={8} r={4} tone={2} />
				</div>

				<Collapse open={editing} reveal="drop">
					<Step
						icon={
							<span className="kl-swap">
								<ShieldWarningIcon size={14} weight="fill" data-on={!s.allowed || undefined} />
								<NotePencilIcon size={14} weight="fill" data-on={s.allowed || undefined} />
							</span>
						}
						verb={s.allowed ? "Edited" : "Edit"}
						target="src/auth.ts"
						tone={s.allowed ? undefined : "warn"}
					>
						<span className="kl-step__end">
							<span className="kl-review" data-show={!s.allowed || undefined}>
								Review
							</span>
							<span className="kl-delta" data-show={s.allowed || undefined}>
								<span className="kl-add">+1</span> <span className="kl-del">−1</span>
							</span>
						</span>
					</Step>
				</Collapse>

				<Collapse open={s.thinking}>
					<div className="kl-working">
						<KiteGlyph />
						<span className="kl-shimmer">Thinking…</span>
					</div>
				</Collapse>

				<Collapse open={s.words > 0} reveal="drop">
					<div>
						<Stream className="kl-reply" text={REPLY} count={s.words} />
					</div>
				</Collapse>
			</div>

			<div className="kl-composer">
				<div className="kl-composer__surface" />
				<span className="kl-composer__placeholder">Reply…</span>
				<div className="kl-composer__row">
					<span className="kl-chip">
						<HandIcon weight="fill" />
						Ask
						<CaretDownIcon weight="bold" className="kl-chip__caret" />
					</span>
					<span className="kl-chip">
						<CpuIcon weight="fill" />
						Opus 5.5
						<CaretDownIcon weight="bold" className="kl-chip__caret" />
					</span>
					<span className="kl-send">
						<ArrowUpIcon weight="bold" />
					</span>
				</div>
			</div>

			<div className="kl-backdrop" data-show={s.ask || undefined} />
			<div className="kl-sheet" data-open={s.ask || undefined}>
				<span className="kl-sheet__handle" />
				<div className="kl-sheet__surface">
					<div className="kl-sheet__eyebrow">
						<NotePencilIcon weight="fill" />
						Claude Code needs you
					</div>
					<div className="kl-sheet__title">Edit src/auth.ts?</div>
					<div className="kl-diff">
						<div className="kl-diff__head">src/auth.ts</div>
						<div className="kl-diff__line">
							<span className="kl-diff__n">8</span>
							<span className="kl-diff__sign" />
							<span>const next = form.get("next")</span>
						</div>
						<div className="kl-diff__line" data-kind="del">
							<span className="kl-diff__n">9</span>
							<span className="kl-diff__sign">−</span>
							<span>return redirect("/")</span>
						</div>
						<div className="kl-diff__line" data-kind="add">
							<span className="kl-diff__n">9</span>
							<span className="kl-diff__sign">+</span>
							<span>return redirect(next ?? "/")</span>
						</div>
					</div>
					<div className="kl-sheet__actions">
						<span className="kl-btn kl-btn--quiet">Deny</span>
						<span className="kl-btn kl-btn--ink" data-target="allow" data-cursor="pointer">
							Allow
						</span>
					</div>
					<div className="kl-sheet__always">Allow, and don't ask again for this</div>
				</div>
			</div>
		</div>
	);
}

/** The kite from Kiteline's mark, at glyph size for the Thinking line. */
function KiteGlyph() {
	return (
		<svg viewBox="0 0 64 64" className="kl-kite" aria-hidden="true">
			<path
				d="M27.2 42C22.5 47.5 21 50.5 17 53S11 56.5 9.5 58.5"
				fill="none"
				stroke="var(--kl-faint)"
				strokeWidth="3"
				strokeLinecap="round"
			/>
			<g className="kl-kite__sway">
				<g transform="translate(41.5 21.5) rotate(35)">
					<path d="M0-17 14-5 0 25-14-5Z" fill="currentColor" />
				</g>
			</g>
		</svg>
	);
}

function Scene({ s, layout }: { s: S; layout: "wide" | "compact" }) {
	return (
		<div className="kl-scene" data-layout={layout}>
			{layout === "wide" ? <Editor applied={s.applied} /> : null}
			<Phone width={layout === "wide" ? 340 : 326} className="kl-phone" wallpaper="#fdfdfc">
				<KitelineScreen s={s} />
			</Phone>
		</div>
	);
}

export function KitelineDemo() {
	return (
		<Stage<S>
			width={960}
			height={660}
			compact={{ below: 720, width: 358, height: 612 }}
			initial={START}
			poster={POSTER}
			script={script}
			cursor={{ at: REST, style: "touch" }}
			className="kl-demo"
		>
			{(s, _rect, layout) => (
				<>
					<Scene s={s} layout={layout} />
					<div className="kl-cover" data-show={s.cover || undefined} aria-hidden="true">
						<Scene s={START} layout={layout} />
					</div>
				</>
			)}
		</Stage>
	);
}
