import {
	ArrowUpIcon,
	CaretDownIcon,
	CaretRightIcon,
	CpuIcon,
	FileTextIcon,
	FolderSimpleIcon,
	ImageSquareIcon,
	MagnifyingGlassIcon,
	NotePencilIcon,
	ShieldCheckIcon,
	StopIcon,
	TerminalWindowIcon,
} from "@phosphor-icons/react";

import type { Act } from "../kit/act";
import { Collapse } from "../kit/motion/Collapse";
import { Stream } from "../kit/motion/Stream";
import { Phone } from "../kit/phone";
import { Stage } from "../kit/stage";
import { Bar, Window } from "../kit/window";
import "./demo.css";

// Kiteline's hero: a device pair. The editor on the laptop is pinned top-left
// and runs off the bottom; the phone straddles its right edge, cropped at the
// top so the session and its composer stay whole.
//
// Story, about 11s: the session runs in Auto mode, where a safety check
// approves routine calls, so Claude Code just works. Thinking -> it reads and searches -> it edits src/auth.ts,
// and the line changes in the editor on the computer as the step lands -> it
// runs the tests -> the reply streams in on the phone (payoff, held). The loop
// fades the scene out and back to the start. Every step draws as the app's
// timeline does: its icon spins while the tool runs.
//
// Real strings: the request, the four steps, the code in the editor, the
// reply, the composer's mode and model. Everything else is a line or an icon.

type S = {
	/** How many tool steps have started: Read, Searched, Edited, the tests. */
	steps: number;
	/** The newest step's tool is still running. */
	running: boolean;
	applied: boolean;
	words: number;
	cover: boolean;
};

const START: S = { steps: 0, running: false, applied: false, words: 0, cover: false };

const REQUEST = "Signing in always lands on the home page. Send people back to where they were.";
const REPLY = "Fixed. After signing in, people go back to the page they started on, and the auth tests pass.";
const REPLY_WORDS = REPLY.split(" ").length;

const POSTER: S = { steps: 4, running: false, applied: true, words: REPLY_WORDS, cover: false };

const script = async (a: Act<S>) => {
	await a.wait(1100);
	/** One tool call: its step lands spinning, runs, then settles. */
	const tool = async (step: number, mark: string, runs: number, done: Partial<S> = {}) => {
		a.mark(mark);
		a.put({ steps: step, running: true });
		await a.wait(runs);
		a.put({ running: false, ...done });
	};
	await tool(1, "read", 700);
	await a.wait(250);
	await tool(2, "search", 650);
	await a.wait(300);
	await tool(3, "edit", 500, { applied: true });
	await a.wait(900);
	await tool(4, "test", 1400);
	await a.wait(300);
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
									<span className="kl-insert" data-on={applied || undefined}>
										{"next ?? "}
									</span>
									<span className="kl-str">"/"</span>)
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

/**
 * A tool step as the app's timeline draws it: icon (spinning while the tool runs), verb and target,
 * whatever sits at the row's end, then a caret that opens it. A command with a description shows
 * just the description, in ink.
 */
function Step({
	icon,
	verb,
	target,
	running,
	children,
}: {
	icon: React.ReactNode;
	verb?: string;
	target: string;
	running?: boolean;
	children?: React.ReactNode;
}) {
	return (
		<div className="kl-step">
			<span className="kl-disc" data-running={running || undefined}>
				{icon}
			</span>
			<span className="kl-step__label">
				{verb ? (
					<>
						<span className="kl-step__verb">{verb}</span> <span className="kl-mono">{target}</span>
					</>
				) : (
					<span className="kl-step__verb">{target}</span>
				)}
			</span>
			{children}
			<CaretRightIcon size={14} weight="bold" className="kl-step__caret" />
		</div>
	);
}

function KitelineScreen({ s }: { s: S }) {
	// Working until the reply starts to stream: the Thinking line stays under the steps meanwhile.
	const working = s.words === 0;
	// The turn runs until the reply's last word; until then the composer offers Stop.
	const turnRunning = s.words < REPLY_WORDS;
	const spinning = (step: number) => s.running && s.steps === step;
	return (
		<div className="kl-app">
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

				<Collapse open={s.steps >= 1} reveal="drop">
					<div>
						<div className="kl-steps">
							<Step
								icon={<FileTextIcon weight="fill" />}
								verb="Read"
								target="src/auth.ts"
								running={spinning(1)}
							/>
							<Collapse open={s.steps >= 2} reveal="drop">
								<Step
									icon={<MagnifyingGlassIcon weight="bold" />}
									verb="Searched"
									target="“next”"
									running={spinning(2)}
								/>
							</Collapse>
						</div>
					</div>
				</Collapse>

				<Collapse open={s.steps >= 3} reveal="drop">
					<div>
						<div className="kl-prose">
							<Bar w={300} h={8} r={4} tone={2} />
							<Bar w={212} h={8} r={4} tone={2} />
						</div>
					</div>
				</Collapse>

				<Collapse open={s.steps >= 3} reveal="drop">
					<div>
						<div className="kl-steps">
							<Step
								icon={<NotePencilIcon weight="fill" />}
								verb="Edited"
								target="src/auth.ts"
								running={spinning(3)}
							>
								<span className="kl-add">+1</span>
								<span className="kl-del">−1</span>
							</Step>
							<Collapse open={s.steps >= 4} reveal="drop">
								<Step
									icon={<TerminalWindowIcon weight="fill" />}
									target="Run the auth tests"
									running={spinning(4)}
								/>
							</Collapse>
						</div>
					</div>
				</Collapse>

				<Collapse open={working}>
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
					<span className="kl-attach">
						<ImageSquareIcon />
					</span>
					<span className="kl-chip">
						<ShieldCheckIcon weight="fill" />
						Auto
						<CaretDownIcon weight="bold" className="kl-chip__caret" />
					</span>
					<span className="kl-chip">
						<CpuIcon weight="fill" />
						Opus 5.5
						<CaretDownIcon weight="bold" className="kl-chip__caret" />
					</span>
					<span className="kl-send">
						<span className="kl-send__stop" data-hide={!turnRunning || undefined}>
							<StopIcon weight="fill" />
						</span>
						<span className="kl-send__arrow" data-hide={turnRunning || undefined}>
							<ArrowUpIcon weight="bold" />
						</span>
					</span>
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
