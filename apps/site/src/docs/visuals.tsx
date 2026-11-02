import {
	CaretDownIcon,
	ClipboardTextIcon,
	DeviceMobileIcon,
	FolderSimpleIcon,
	HandIcon,
	type Icon,
	LockSimpleIcon,
	NotePencilIcon,
	PencilSimpleLineIcon,
	ShieldCheckIcon,
	ShieldSlashIcon,
	TerminalWindowIcon,
} from "@phosphor-icons/react";

import { KiteMark } from "../mark";
import { QR_PATH, QR_SIZE } from "../qr";

/** Phone, your own network, then everything else on one computer. */
export function HowItWorks() {
	return (
		<div className="flow">
			<span className="flow__node">
				<span className="flow__icon">
					<DeviceMobileIcon weight="fill" />
				</span>
				Your phone
			</span>
			<span className="flow__link">
				<span className="flow__label">
					<LockSimpleIcon weight="fill" />
					Your Wi-Fi or Tailscale
				</span>
			</span>
			<span className="flow__machine">
				<span className="flow__caption">Your computer</span>
				<span className="flow__row">
					<span className="flow__node">
						<span className="flow__icon flow__icon--brand">
							<KiteMark className="flow__mark" />
						</span>
						Kiteline
					</span>
					<span className="flow__hop" />
					<span className="flow__node">
						<span className="flow__icon">
							<TerminalWindowIcon weight="fill" />
						</span>
						Claude Code
					</span>
					<span className="flow__hop" />
					<span className="flow__node">
						<span className="flow__icon">
							<FolderSimpleIcon weight="fill" />
						</span>
						Your files
					</span>
				</span>
			</span>
		</div>
	);
}

/** What `npx kiteline --relay` prints, in the banner's colours. */
export function BannerShot() {
	return (
		<div className="banner-shot">
			<div className="banner-shot__bar">
				<span className="banner-shot__lights">
					<i />
					<i />
					<i />
				</span>
				<span>npx kiteline --relay</span>
			</div>
			<div className="banner-shot__body">
				<div>
					<span className="t-dim">~</span> <span className="t-accent">❯</span> npx kiteline --relay
				</div>
				<div className="banner-shot__gap" />
				<div>
					{"  "}
					<span className="t-accent">◆</span>
					{"  "}
					<b>Kiteline</b> <span className="t-dim">v0.3.0</span>
				</div>
				<div className="banner-shot__gap" />
				<div>
					{"  "}
					<span className="t-dim">Anywhere</span> https://relay.kiteline.seefun.dev
				</div>
				<div>
					{"  "}
					<span className="t-dim">Local </span> http://localhost:4545
				</div>
				<div className="banner-shot__gap" />
				<div>
					{"  "}
					<b>Pair a phone:</b> scan this code, or open the link on it.
				</div>
				<svg
					className="banner-shot__qr"
					viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`}
					shapeRendering="crispEdges"
					aria-hidden="true"
				>
					<rect width={QR_SIZE} height={QR_SIZE} fill="#e7eaf0" />
					<path d={QR_PATH} fill="#0f1218" />
				</svg>
				<div>
					{"  "}
					<span className="t-accent">https://relay.kiteline.seefun.dev/#host=…&amp;code=…</span>
				</div>
				<div>
					{"  "}
					<span className="t-dim">
						Works once, for the next 10 minutes. You'll be asked to allow the phone.
					</span>
				</div>
				<div className="banner-shot__gap" />
				<div>
					{"  "}
					<span className="t-accent">◆</span>
					{"  "}
					<b>iPhone · Safari</b> wants to pair, through the relay.
				</div>
				<div>
					{"     "}Allow it only if it's yours and its screen shows <b>482 913</b>.
				</div>
				<div>
					{"     "}Allow it? <span className="t-dim">y or n</span> y
				</div>
				<div className="banner-shot__gap" />
				<div>
					{"  "}
					<span className="t-accent">◆</span>
					{"  "}Paired <b>iPhone · Safari</b>.
				</div>
			</div>
		</div>
	);
}

/** A numbered pin that ties part of a drawing to its explanation. */
function Pin({ n }: { n: number }) {
	return <span className="pin">{n}</span>;
}

/** The approval sheet as the app draws it, pinned for the legend beside it. */
export function SheetMock() {
	return (
		<div className="sheet-mock">
			<div className="sheet-mock__phone">
				<span className="sheet-mock__handle" />
				<div className="sheet-mock__head">
					<span className="sheet-mock__tile">
						<NotePencilIcon weight="fill" />
					</span>
					<span className="sheet-mock__who">
						<span>Claude Code needs you</span>
						<span>in kiteline</span>
					</span>
					<span className="sheet-mock__count">1 of 2</span>
					<Pin n={1} />
				</div>
				<div className="sheet-mock__title">Edit src/auth.ts?</div>
				<div className="sheet-mock__preview">
					<div className="sheet-mock__file">src/auth.ts</div>
					<div className="sheet-mock__line">
						<span>1</span>
						<span />
						<span>{'  const next = form.get("next")'}</span>
					</div>
					<div className="sheet-mock__line" data-kind="del">
						<span>2</span>
						<span>−</span>
						<span>{'  return redirect("/")'}</span>
					</div>
					<div className="sheet-mock__line" data-kind="add">
						<span>2</span>
						<span>+</span>
						<span>{'  return redirect(next ?? "/")'}</span>
					</div>
					<Pin n={2} />
				</div>
				<div className="sheet-mock__actions">
					<span className="sheet-mock__deny">Deny</span>
					<span className="sheet-mock__allow">Allow</span>
					<Pin n={3} />
				</div>
				<div className="sheet-mock__always">
					<ShieldCheckIcon weight="fill" />
					<span>
						<b>Always allow</b>
						<span>Don't ask again for edits for the rest of this session</span>
					</span>
					<Pin n={4} />
				</div>
			</div>
		</div>
	);
}

const MODES: {
	pill: string;
	icon: Icon;
	tone?: "plan" | "danger";
	title: string;
	asks: string;
	body: string;
}[] = [
	{
		pill: "Ask",
		icon: HandIcon,
		title: "Ask first",
		asks: "Every edit and command",
		body: "Approve each edit and command from your phone. The default, and the safest.",
	},
	{
		pill: "Edits",
		icon: PencilSimpleLineIcon,
		title: "Auto-accept edits",
		asks: "Commands only",
		body: "File edits go straight through; anything it wants to run still asks.",
	},
	{
		pill: "Plan",
		icon: ClipboardTextIcon,
		tone: "plan",
		title: "Plan only",
		asks: "Approving the plan",
		body: "It reads and plans, and changes nothing until you approve the plan.",
	},
	{
		pill: "Auto",
		icon: ShieldCheckIcon,
		title: "Auto",
		asks: "Only what looks risky",
		body: "A safety check approves routine work and asks you about the rest.",
	},
	{
		pill: "Bypass",
		icon: ShieldSlashIcon,
		tone: "danger",
		title: "Bypass permissions",
		asks: "Nothing",
		body: "Never asks. Only for throwaway work you don't mind losing.",
	},
];

/** The five modes, each with the pill the composer shows for it. */
export function ModeList() {
	return (
		<div
			className="modes-list"
			data-md={MODES.map(
				(m) => `- **${m.title}** (the "${m.pill}" pill): ${m.body} Asks about: ${m.asks.toLowerCase()}.`,
			).join("\n")}
		>
			{MODES.map(({ pill, icon: ModeIcon, tone, title, asks, body }) => (
				<div key={pill} className="modes-list__row">
					<span className="mode-pill" data-tone={tone}>
						<ModeIcon weight="fill" />
						{pill}
						<CaretDownIcon weight="bold" className="mode-pill__caret" />
					</span>
					<span className="modes-list__text">
						<b>{title}</b>
						<span>{body}</span>
					</span>
					<span className="modes-list__asks">
						<span>Asks about</span>
						{asks}
					</span>
				</div>
			))}
		</div>
	);
}
