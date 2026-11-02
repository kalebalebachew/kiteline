import { Callout, Code, Details, Figure, H3, Kbd, Section, Step, Steps, Table, Tabs } from "./parts";
import { BannerShot, HowItWorks, ModeList, SheetMock } from "./visuals";

const REPO = "https://github.com/sifenfisaha/kiteline";

/** Everything the docs say. Labels in quotes are the app's own words. */
export function Content() {
	return (
		<>
			<Section
				id="overview"
				title="What Kiteline is"
				lead="Kiteline puts Claude Code in your pocket. You run a small app on your computer, open it on your phone, and keep working from the couch, the train or the other side of the world."
			>
				<p>
					Claude Code keeps running on your computer, with your files, your settings and your login. Your
					phone becomes the screen: you see every session, reply, start new work, and approve what Claude Code
					wants to do. Nothing goes through anyone else's server.
				</p>
				<Figure
					alt="Your phone connects over your Wi-Fi or Tailscale to your computer, where Kiteline runs Claude Code next to your files."
					caption="Your phone talks to your computer directly. Claude Code never leaves it."
				>
					<HowItWorks />
				</Figure>
				<p>From your phone you can:</p>
				<ul>
					<li>
						see every Claude Code session on your computer, including the ones you started in a terminal;
					</li>
					<li>pick any of them up where it stopped, or start a new one in any project;</li>
					<li>watch replies stream in, with each command and edit laid out step by step;</li>
					<li>approve or deny what Claude Code wants to do, from wherever you are;</li>
					<li>switch how much it asks, and which model it uses, mid-session;</li>
					<li>send it screenshots and photos.</li>
				</ul>
			</Section>

			<Section id="requirements" title="What you need">
				<ul>
					<li>
						<strong>A computer where you already use Claude Code,</strong> signed in. If you're not sure, run{" "}
						<code>claude</code> in a terminal once and sign in.
					</li>
					<li>
						<strong>Node.js 22.18 or newer.</strong> Check with <code>node --version</code>, and get it from{" "}
						<a href="https://nodejs.org">nodejs.org</a> if you need to.
					</li>
					<li>
						<strong>A phone with a modern browser,</strong> on the same Wi-Fi as the computer. To use it from
						anywhere else, add <a href="#anywhere">Tailscale</a>.
					</li>
				</ul>
				<Callout tone="note">
					Kiteline uses whatever login Claude Code uses on that computer: your Claude subscription, or an API
					key if one is set. Check that the way you use it fits your plan's terms.
				</Callout>
			</Section>

			<Section id="install" title="Install" lead="One command, on the computer that runs Claude Code.">
				<Code code="npx kiteline" />
				<p>
					It starts Kiteline and prints the addresses your phone can use, with a QR code to pair it. Leave it
					running while you use Kiteline. The first time takes a little longer: Kiteline brings its own copy
					of Claude Code's engine, about 150 MB.
				</p>
				<H3 id="install-for-good">Install it for good</H3>
				<p>
					npx keeps its copy only until it tidies up. To have the <code>kiteline</code> command whenever you
					want it, install it:
				</p>
				<Code code={"npm install -g kiteline\nkiteline"} />
				<Callout tone="tip">
					Want it to start by itself and keep going after you close the terminal? That's one more command:{" "}
					<a href="#always-on">Keep it running</a>.
				</Callout>
				<H3 id="from-source">From source</H3>
				<p>To work on Kiteline itself, run it from a clone of the repository. You'll need pnpm too.</p>
				<Code code={`git clone ${REPO}.git\ncd kiteline\npnpm install\npnpm build\npnpm start`} />
			</Section>

			<Section
				id="pair"
				title="Pair your phone"
				lead="Pairing tells Kiteline this phone is yours. You do it once per phone."
			>
				<Figure alt="The terminal after npx kiteline: Kiteline's addresses, a QR code, and the pairing link.">
					<BannerShot />
				</Figure>
				<Steps>
					<Step title="Scan the code">
						<p>
							Point your phone's camera at the QR code in the terminal and open the link. Kiteline opens
							already paired, on the list of your sessions.
						</p>
					</Step>
					<Step title="No camera handy?">
						<p>
							Open the link printed under the code on your phone instead, or paste it (or just the code after{" "}
							<code>#pair=</code>) into the "Pairing link or code" box on the "Pair this phone" screen.
						</p>
					</Step>
					<Step title="Need the code again later?">
						<p>
							Run <code>kiteline pair</code> (or <code>npx kiteline pair</code>): it shows the code without
							starting a second copy of Kiteline. On a phone that's already paired, Settings → "Pair another
							device" shows it too.
						</p>
					</Step>
				</Steps>
				<H3 id="pair-good-to-know">Good to know</H3>
				<ul>
					<li>A phone stays paired for 400 days, or until you unpair it.</li>
					<li>
						Pairing belongs to the address you opened. If you paired over Wi-Fi and later open your Tailscale
						address, scan once more there.
					</li>
					<li>Pair as many phones, tablets and laptops as you like.</li>
					<li>After ten wrong codes, Kiteline asks you to wait ten minutes before trying again.</li>
				</ul>
				<Callout tone="warn">
					Treat the pairing link like a password: anyone who opens it can drive Claude Code on your computer.
				</Callout>
			</Section>

			<Section
				id="home-screen"
				title="Add it to your home screen"
				lead="Kiteline installs like an app: full screen, its own icon, no browser bars."
			>
				<p>
					Phones only offer this on secure (<code>https://</code>) addresses, so use your{" "}
					<a href="#anywhere">Tailscale address</a> rather than <code>http://192.168…</code>.
				</p>
				<Tabs
					tabs={[
						{
							label: "iPhone and iPad",
							content: (
								<Steps>
									<Step title="Open Kiteline in Safari">
										<p>Use its https address, and pair if you're asked to.</p>
									</Step>
									<Step title="Tap Share">
										<p>The square with an arrow, in Safari's toolbar.</p>
									</Step>
									<Step title="Tap “Add to Home Screen”, then Add">
										<p>Kiteline now opens full screen from its icon.</p>
									</Step>
								</Steps>
							),
						},
						{
							label: "Android",
							content: (
								<Steps>
									<Step title="Open Kiteline in Chrome">
										<p>Use its https address, and pair if you're asked to.</p>
									</Step>
									<Step title="Open Chrome's menu">
										<p>The three dots at the top right.</p>
									</Step>
									<Step title="Tap “Install app” or “Add to Home screen”">
										<p>Kiteline now opens full screen from its icon.</p>
									</Step>
								</Steps>
							),
						},
					]}
				/>
				<p>The installed app updates itself whenever you update Kiteline on the computer.</p>
			</Section>

			<Section
				id="sessions"
				title="Your sessions"
				lead="The first screen lists every Claude Code session on your computer: the ones you start from your phone, and the ones you run in a terminal."
			>
				<ul>
					<li>
						<strong>Live now</strong> sits at the top: sessions that are running, with their status. A strip
						reading "Approval needed" means one is waiting for you.
					</li>
					<li>
						Everything else is grouped by when you last used it: Today, Yesterday, This week, This month,
						Earlier.
					</li>
					<li>
						<strong>Search sessions</strong> looks through titles, first messages, folders and git branches.
						When you have more than one project, chips under the search filter by project.
					</li>
					<li>The dot beside your computer's name at the top is green while your phone is connected.</li>
					<li>The 200 most recent sessions are listed.</li>
				</ul>
				<H3 id="statuses">What the statuses mean</H3>
				<Table
					head={["Status", "Meaning"]}
					rows={[
						["Starting", "Claude Code is starting up, or your phone is reconnecting."],
						["Working", "Claude Code is busy on your request."],
						["Needs you", "It's waiting for you to approve something or answer a question."],
						["Ready", "It's done and waiting for your next message."],
						["Asleep", "Idle for a while, so it's resting. Send a message and it wakes up."],
						["Stopped", "The Claude Code process ended."],
					]}
				/>
				<H3 id="session-menu">The session menu</H3>
				<p>Inside a session, the ⋯ button at the top has:</p>
				<ul>
					<li>
						<strong>Rename</strong>: the name shows in Kiteline and in Claude Code's own <code>/resume</code>{" "}
						list.
					</li>
					<li>
						<strong>Copy terminal resume command</strong>: to carry on at the computer with{" "}
						<code>claude --resume</code>.
					</li>
					<li>
						<strong>Copy session ID</strong>.
					</li>
					<li>
						<strong>Stop the Claude Code process</strong>: puts a live session to sleep and frees its place.
					</li>
				</ul>
				<Callout tone="note">
					Don't drive one session from a terminal and your phone at the same time. If a session was active in
					the last few minutes, Kiteline reminds you to close it in the terminal before replying.
				</Callout>
			</Section>

			<Section id="new-session" title="Start a session">
				<Steps>
					<Step title="Tap “New session”">
						<p>The button floats at the bottom of your session list.</p>
					</Step>
					<Step title="Pick a project">
						<p>
							Your recent folders are listed first. For anything else, tap "Browse folders…", move around with
							Up and Home, tap into folders, then "Start here".
						</p>
					</Step>
					<Step title="Say what you need, and send">
						<p>Type into "What should Claude Code do?". The session opens and Claude Code gets to work.</p>
					</Step>
				</Steps>
				<p>
					The mode and model start from your defaults in <a href="#settings">Settings</a>. Changing either
					one, here or in a session, makes it the new default for the next session too.
				</p>
				<Callout tone="note">
					Up to six sessions can run at once. If you start a seventh, Kiteline asks you to stop one first and
					keeps what you typed. You can raise the limit with <a href="#config">KITELINE_MAX_SESSIONS</a>.
				</Callout>
			</Section>

			<Section
				id="watch"
				title="Watch it work"
				lead="Replies stream in as Claude Code writes them, and everything it does shows up as a step."
			>
				<ul>
					<li>
						Each step says what happened: "Read", "Searched", "Edited" with its <code>+2 −1</code>, "Ran" a
						command. Tap one to see the command and its output, or the change itself.
					</li>
					<li>A step that's still running shows a spinner and how long it's taken.</li>
					<li>Long runs of steps fold into "12 steps"; tap to unfold them.</li>
					<li>Sub-agents show up as one step, with their own steps and report inside.</li>
					<li>
						While it works you'll see "Thinking…". The square button in place of Send is <strong>Stop</strong>
						: it interrupts the turn.
					</li>
					<li>
						You can send another message while it works; it runs as soon as the current turn ends. Stop
						cancels it too if it hasn't started, and marks it "Not sent".
					</li>
					<li>
						After a turn, a small line shows the turns and the cost Claude Code reported for this visit.
					</li>
				</ul>
				<H3 id="sleep">Sessions that sleep</H3>
				<p>
					A session that's been idle for 20 minutes goes to sleep to free up your computer, and shows
					"Asleep". Nothing is lost: send a message and it wakes with its whole history. You can change the 20
					minutes with <a href="#config">KITELINE_IDLE_MINUTES</a>.
				</p>
			</Section>

			<Section
				id="approve"
				title="Approve what it does"
				lead="When Claude Code wants to do something that needs your OK, a sheet slides up on every device that has the session open."
			>
				<Figure alt="The approval sheet: who is asking, the change it wants to make, Deny and Allow, and Always allow with what it covers.">
					<SheetMock />
				</Figure>
				<ol className="pins">
					<li>
						<strong>Who's asking, and where.</strong> "1 of 2" means more requests are waiting after this one.
					</li>
					<li>
						<strong>Exactly what it wants to do:</strong> the change to a file, the command to run, or the
						address to fetch. Anything outside the project is flagged.
					</li>
					<li>
						<strong>Allow or Deny.</strong> Deny lets you tell Claude what to do instead, then send it with
						"Deny and send".
					</li>
					<li>
						<strong>Always allow</strong> says exactly what it stops asking about, like "Don't ask again for{" "}
						<code>pnpm test</code> commands in this project".
					</li>
				</ol>
				<H3 id="questions-and-plans">Questions and plans</H3>
				<p>
					When Claude Code asks you a question, the sheet shows its options, plus "Something else…" for your
					own answer; Skip leaves it to Claude's judgement. When it proposes a plan, you'll see "Review the
					plan" with <strong>Approve plan</strong> and <strong>Keep planning</strong>, where you can say what
					should change.
				</p>
				<H3 id="closed-it">Closed it by accident?</H3>
				<p>
					Swiping the sheet away doesn't answer it: the request keeps waiting. Tap "Review" in the bar above
					the reply box, or on the step itself, to bring it back.
				</p>
				<Callout tone="note">
					Kiteline doesn't send push notifications yet. Waiting requests show on your session list, and the
					browser tab's title changes to "(1) Needs you".
				</Callout>
			</Section>

			<Section
				id="modes"
				title="Permission modes"
				lead="The mode decides how often Claude Code stops to ask. Change it any time from the pill in the reply box."
			>
				<ModeList />
				<p>
					Your default for new sessions is in Settings → "New sessions start with". Changing the mode inside a
					session updates that default too.
				</p>
				<Callout tone="warn">
					Bypass never asks, so Claude Code can change or delete anything it can reach. To take it off the
					menu for every device, set <a href="#config">KITELINE_ALLOW_BYPASS=false</a>.
				</Callout>
			</Section>

			<Section id="models" title="Models" lead="Pick the model from the pill next to the mode.">
				<Table
					head={["Model", "Good for"]}
					rows={[
						["Default", "Whatever your Claude Code settings pick"],
						["Opus", "The most capable, for hard problems"],
						["Sonnet", "Fast and strong, for everyday work"],
						["Haiku", "The quickest, for small tasks"],
					]}
				/>
				<p>While a session runs, the pill shows the exact model in use, like "Opus 5.5".</p>
			</Section>

			<Section
				id="effort"
				title="Effort"
				lead="How hard Claude thinks before it answers. Type /effort, or tap the bars next to the model."
			>
				<p>
					It's the same choice as <code>/effort</code> in the terminal: a slider from Faster to Smarter, and
					each level described the way Claude Code describes it.
				</p>
				<Table
					head={["Level", "What Claude Code says about it"]}
					rows={[
						["low", "Quick, straightforward implementation with minimal overhead"],
						["medium", "Balanced approach with standard implementation and testing"],
						["high", "Comprehensive implementation with extensive testing and documentation"],
						["xhigh", "Deeper reasoning than high, just below maximum"],
						[
							"max",
							"Maximum capability with deepest reasoning. May use excessive tokens resulting in long response times or overthinking. Use sparingly for the hardest tasks.",
						],
					]}
				/>
				<ul>
					<li>
						<strong>Set</strong> changes this session and makes the level your default for new sessions on
						that model, the same as Enter in the terminal. Your terminal sessions pick it up too.
					</li>
					<li>
						<strong>This session only</strong> leaves your default alone.
					</li>
					<li>Max is always for this session only, as in the terminal.</li>
					<li>
						Typing works as well: <code>/effort high</code>, or any level, sets it; <code>/effort auto</code>{" "}
						puts the session back on its model's own default.
					</li>
				</ul>
				<p>
					Models differ in what they offer. Some don't have xhigh, and a few don't take an effort level at
					all; the slider only shows what the model in use offers. A session that's asleep shows the level it
					would wake up at, and a level you pick then applies from your next message.
				</p>
			</Section>

			<Section id="images" title="Images">
				<ul>
					<li>Tap the picture button in the reply box, or paste an image.</li>
					<li>Send up to six at a time, with or without a message.</li>
					<li>
						Big photos are scaled down on your phone before they're sent, so they upload quickly. GIFs go as
						they are.
					</li>
				</ul>
			</Section>

			<Section id="commands" title="Slash commands">
				<p>
					Type <Kbd>/</Kbd> in the reply box to see commands; Enter fills in the first match, and runs a
					command you've typed in full. <code>/effort</code> opens the effort picker. Once a session is
					running, the list is the commands your setup really has, your own custom ones included. Before that,
					you'll see the common ones: <code>/compact</code>, <code>/clear</code>, <code>/context</code>,{" "}
					<code>/cost</code>, <code>/init</code>, <code>/review</code>, <code>/memory</code> and{" "}
					<code>/model</code>.
				</p>
			</Section>

			<Section id="settings" title="Settings" lead="The gear at the top of your session list.">
				<Table
					head={["Setting", "What it does"]}
					rows={[
						["Pair another device", "Shows a QR code and link to pair another phone, tablet or laptop."],
						["Appearance", "Theme: Auto, Light or Dark."],
						[
							"New sessions start with",
							"Your default permission mode and model, and what the Return key does: new line, or send.",
						],
						["This computer", "Your computer's name and Kiteline's version."],
						["Unpair this device", "Forgets this device. You'll need to pair it again to use it."],
					]}
				/>
				<p>Settings belong to each device, so your phone and tablet can differ.</p>
				<H3 id="keyboard">With a keyboard</H3>
				<Table
					head={["Keys", "Does"]}
					rows={[
						[<Kbd key="k">Enter</Kbd>, "Sends, when Return key is set to Send (the default with a mouse)"],
						[<Kbd key="k">Shift Enter</Kbd>, "A new line"],
						[<Kbd key="k">⌘ Enter</Kbd>, "Always sends (Ctrl Enter on Windows and Linux)"],
						[<Kbd key="k">Esc</Kbd>, "Closes a sheet"],
					]}
				/>
			</Section>

			<Section
				id="anywhere"
				title="Reach it from anywhere"
				lead="On the same Wi-Fi it just works. Everywhere else, use Tailscale: a free, private network between your own devices."
			>
				<Steps>
					<Step title="Install Tailscale on your computer and your phone">
						<p>
							Get it from <a href="https://tailscale.com/download">tailscale.com/download</a> and sign in with
							the same account on both.
						</p>
					</Step>
					<Step title="Give Kiteline a secure address">
						<Code code="tailscale serve --bg 4545" />
						<p>
							The first time, Tailscale asks you to switch on Serve and HTTPS for your network, and prints a
							link to do it. Afterwards Kiteline is at an address like{" "}
							<code>https://your-computer.your-network.ts.net</code>.
						</p>
					</Step>
					<Step title="Point the pairing code at it">
						<p>Tell Kiteline its new address, so the QR code opens it. Start it with:</p>
						<Code code={"npx kiteline \\\n  --public-url https://your-computer.your-network.ts.net"} />
						<p>
							Running it in the background? Give the same option to{" "}
							<a href="#always-on">kiteline service install</a> instead.
						</p>
					</Step>
					<Step title="Pair once more on the new address">
						<p>Scan the new code with Tailscale on. Now Kiteline works wherever your phone has signal.</p>
					</Step>
				</Steps>
				<Callout tone="tip">
					With Tailscale in front, also add <code>--host 127.0.0.1</code>: Kiteline then answers only through
					Tailscale, and not to other devices on your Wi-Fi.
				</Callout>
				<Callout tone="warn">
					Never open Kiteline's port to the internet, for example with port forwarding on your router.
				</Callout>
			</Section>

			<Section
				id="always-on"
				title="Keep it running"
				lead="On Linux, Kiteline can run as a background service: it starts when the computer does, restarts if it stops, and keeps going after you log out."
			>
				<Steps>
					<Step title="Install it">
						<p>The service needs a copy of Kiteline that stays put, so not npx's:</p>
						<Code code="npm install -g kiteline" />
					</Step>
					<Step title="Set up the service">
						<Code code="kiteline service install" />
						<p>Using Tailscale? Give it your address, and keep Kiteline to it:</p>
						<Code
							code={
								"kiteline service install \\\n  --host 127.0.0.1 \\\n  --public-url https://your-computer.your-network.ts.net"
							}
						/>
						<p>
							It writes the service for this computer, with the folders your terminal finds programs in, so
							the commands Claude Code runs work as they do for you. It makes sure the service also starts at
							boot, before you log in, and tells you the one command to run if that needs your password. Then
							it starts Kiteline and shows the pairing code.
						</p>
					</Step>
				</Steps>
				<Table
					head={["To", "Run"]}
					rows={[
						["See what it's doing", <code key="c">journalctl --user -u kiteline -f</code>],
						["Show the pairing code", <code key="c">kiteline pair</code>],
						["Change its settings", <code key="c">kiteline service install --port 4546</code>],
						["Check on it", <code key="c">kiteline service</code>],
						["Stop running it", <code key="c">kiteline service uninstall</code>],
					]}
				/>
				<Callout tone="note">
					It works with systemd, which most Linux computers use. On a Mac or on Windows, keep{" "}
					<code>kiteline</code> running in a terminal for now.
				</Callout>
				<p>
					Set a service up by hand, as earlier versions of these docs had you do?{" "}
					<code>kiteline service install --force</code> replaces it, and keeps your file beside it as{" "}
					<code>kiteline.service.bak</code>.
				</p>
				<H3 id="laptops">On a laptop</H3>
				<p>A laptop also has to stay awake. To keep it running with the lid closed while it's plugged in:</p>
				<Code
					code={
						"sudo mkdir -p /etc/systemd/logind.conf.d\nprintf '[Login]\\nHandleLidSwitchExternalPower=ignore\\n' | sudo tee /etc/systemd/logind.conf.d/kiteline-lid.conf\nsudo systemctl kill -s HUP systemd-logind"
					}
				/>
				<p>On battery, closing the lid still puts it to sleep.</p>
			</Section>

			<Section id="update" title="Update" lead="Install the latest version, then restart.">
				<Code
					code={
						"npm install -g kiteline@latest\nsystemctl --user restart kiteline   # if it runs in the background"
					}
				/>
				<p>
					With npx, <code>npx kiteline@latest</code> runs the newest. Restarting stops running sessions; each
					one continues when you send it a message. Your phone picks up the new version by itself.
				</p>
			</Section>

			<Section
				id="config"
				title="Configuration"
				lead="Everything has a sensible default. Change a setting with an option when you start Kiteline, or with an environment variable."
			>
				<Code code="kiteline --port 4546 --host 127.0.0.1" />
				<p>
					The first three have options: <code>--port</code>, <code>--host</code> and <code>--public-url</code>
					. Every setting also works as an environment variable, as in <code>PORT=4546 kiteline</code>.{" "}
					<code>kiteline --help</code> lists what it takes.
				</p>
				<Table
					head={["Setting", "Default", "What it does"]}
					rows={[
						[<code key="k">PORT</code>, "4545", "The port Kiteline listens on"],
						[
							<code key="k">HOST</code>,
							"0.0.0.0",
							"Who can reach it. 127.0.0.1 means only this computer, for use with Tailscale Serve",
						],
						[
							<code key="k">KITELINE_PUBLIC_URL</code>,
							"none",
							"The address your phone uses, such as your Tailscale address. The QR code points here",
						],
						[
							<code key="k">KITELINE_TOKEN</code>,
							"generated",
							"A fixed pairing code, instead of the saved one",
						],
						[
							<code key="k">KITELINE_HOME</code>,
							"~/.kiteline",
							"Where Kiteline keeps its pairing code, session list and last pairing link",
						],
						[
							<code key="k">CLAUDE_PATH</code>,
							"built in",
							"A different claude program to use instead of the one Kiteline brings",
						],
						[
							<code key="k">KITELINE_ALLOW_BYPASS</code>,
							"true",
							"Set to false to take Bypass mode off the menu for everyone",
						],
						[<code key="k">KITELINE_MAX_SESSIONS</code>, "6", "How many sessions can run at once"],
						[
							<code key="k">KITELINE_IDLE_MINUTES</code>,
							"20",
							"Minutes before an idle session goes to sleep",
						],
						[
							<code key="k">KITELINE_DEBUG</code>,
							"off",
							"Log requests, errors and Claude Code's own output, to help track down a problem",
						],
					]}
				/>
				<p>
					The background service keeps the settings it was set up with; run{" "}
					<code>kiteline service install</code> again with new ones to change them. Running from a clone,{" "}
					<code>apps/server/.env</code> works as well.
				</p>
			</Section>

			<Section
				id="security"
				title="Security"
				lead="Kiteline can run commands on your computer, so it only lets in the devices you've paired."
			>
				<ul>
					<li>
						The pairing code is random, and saved in <code>~/.kiteline/auth.json</code> where only you can
						read it. It travels in the part of the link after <code>#</code>, which browsers never send to any
						server.
					</li>
					<li>
						Each paired device keeps a cookie, made from the pairing code, that Kiteline checks on every
						request. Without it, nothing works.
					</li>
					<li>
						Ten wrong codes from one address lock that address out for ten minutes. Behind Tailscale Serve,
						all your devices share an address, so a lockout applies to all of them.
					</li>
					<li>
						The pairing link is printed when Kiteline starts, so it also ends up in the service log. Treat
						that log like the link.
					</li>
				</ul>
				<H3 id="unpair">Unpair devices</H3>
				<p>
					To unpair one device, open Settings on it and tap "Unpair this device". To unpair every device at
					once, make a new pairing code:
				</p>
				<Code
					code={
						"systemctl --user stop kiteline     # if it runs in the background\nkiteline --new-token               # then stop it with Ctrl C\nsystemctl --user start kiteline"
					}
				/>
				<p>
					This does nothing if you set a fixed <code>KITELINE_TOKEN</code>; change that instead.
				</p>
				<Callout tone="note">
					Claude Code runs as usual on your computer, with your files and your login. Kiteline itself sends
					nothing anywhere: your phone talks straight to your computer.
				</Callout>
			</Section>

			<Section id="how-it-works" title="How it works" lead="For the curious.">
				<p>
					Kiteline starts Claude Code with Anthropic's Claude Agent SDK, one Claude Code process for each live
					session. Your messages go to that process, and its replies, steps and requests stream back to your
					phone as they happen.
				</p>
				<p>
					When Claude Code asks permission for something, Kiteline holds the question, shows it on every
					device with that session open, and answers with your choice.
				</p>
				<p>
					History comes from Claude Code's own session files in <code>~/.claude/projects</code>, which is why
					a session you started in a terminal shows up on your phone, and the other way round. Kiteline also
					tells Claude you're reading on a phone, so its replies come out short and easy to scan.
				</p>
			</Section>

			<Section id="troubleshooting" title="Troubleshooting">
				<Details id="cant-reach" summary="“Can't reach your computer”">
					<p>
						Kiteline isn't running, or your phone can't see the computer. Check that Kiteline is running (in
						its terminal, or with <code>systemctl --user status kiteline</code>), that your phone is on the
						same Wi-Fi or has Tailscale switched on, and that you're opening the right address. Then tap "Try
						again".
					</p>
				</Details>
				<Details id="port-in-use" summary="“Kiteline didn't start: port 4545 is already in use”">
					<p>
						Kiteline is probably already running, as the background service. There's nothing to start: show
						the pairing code with <code>kiteline pair</code>. If something else has the port, start Kiteline
						on another one with <code>--port 4546</code>.
					</p>
				</Details>
				<Details id="pair-again" summary="My phone shows “Pair this phone” again">
					<p>
						Pairing belongs to the address you opened, so a new address (say, your Tailscale one) needs one
						more scan. It also happens after "Unpair this device", after a new pairing code, or after 400
						days. Scan the code again; <code>kiteline pair</code> shows it.
					</p>
				</Details>
				<Details id="code-mismatch" summary="“That code doesn't match”">
					<p>
						The link was cut short, or it's from before a new pairing code was made. Copy the link from{" "}
						<code>kiteline pair</code> again.
					</p>
				</Details>
				<Details id="too-many" summary="“Too many wrong codes”">
					<p>
						Wait ten minutes, then pair with a fresh link from <code>kiteline pair</code>.
					</p>
				</Details>
				<Details id="no-install" summary="There's no “Add to Home Screen” or “Install app”">
					<p>
						Phones only install from secure addresses. Open Kiteline at its <code>https://</code>{" "}
						<a href="#anywhere">Tailscale address</a>, not at <code>http://192.168…</code>.
					</p>
				</Details>
				<Details id="too-many-sessions" summary="“6 sessions are already running”">
					<p>
						Stop one you're done with: open it, tap ⋯, then "Stop the Claude Code process". Or raise{" "}
						<a href="#config">KITELINE_MAX_SESSIONS</a>.
					</p>
				</Details>
				<Details id="login-errors" summary="Errors about logging in or an API key">
					<p>
						Claude Code isn't signed in on the computer. Run <code>claude</code> in a terminal there, sign in
						(or run <code>/login</code>), then send your message again.
					</p>
				</Details>
				<Details id="install-fails" summary="npx kiteline or npm install fails">
					<p>
						Check <code>node --version</code>: Kiteline needs Node.js 22.18 or newer. Update Node, then try
						again. The first install also downloads Claude Code's engine, about 150 MB, so a slow or dropped
						connection can stop it part way; running it again picks up where it left off.
					</p>
				</Details>
				<Details id="not-found" summary="“kiteline: command not found”">
					<p>
						It isn't installed yet, or npm's folder for commands isn't on your PATH. Run it with{" "}
						<code>npx kiteline</code>, or install it with <code>npm install -g kiteline</code> and open a new
						terminal.
					</p>
				</Details>
				<Details id="pair-not-run" summary="kiteline pair says Kiteline hasn't run yet">
					<p>
						Start it once with <code>kiteline</code> (or as a service); <code>kiteline pair</code> shows the
						code of the last time it started.
					</p>
				</Details>
				<Details id="missing-session" summary="A session from my terminal is missing">
					<p>
						Kiteline lists your 200 most recent sessions. Try searching for a word from it, or its folder.
					</p>
				</Details>
			</Section>

			<Section id="faq" title="Questions">
				<Details summary="Does my code leave my computer?">
					<p>
						Not because of Kiteline: your phone talks straight to your computer, and nothing passes through
						anyone else's server. Claude Code itself works exactly as it does in your terminal.
					</p>
				</Details>
				<Details summary="Does it cost anything?">
					<p>
						Kiteline is free and open source. What Claude Code does counts against your Claude plan or API key
						as usual; the line under a finished turn shows the cost Claude Code reported.
					</p>
				</Details>
				<Details summary="Can I use more than one phone?">
					<p>
						Yes. Pair each one. Every device with a session open sees its requests, and whichever answers
						first wins.
					</p>
				</Details>
				<Details summary="Will my phone notify me when Claude needs me?">
					<p>
						Not yet. Waiting requests show on your session list, and the tab's title changes to "(1) Needs
						you".
					</p>
				</Details>
				<Details summary="Can I keep using Claude Code in my terminal?">
					<p>
						Yes, they're the same sessions. Just don't drive one session from both at the same time: close it
						in the terminal before replying from your phone.
					</p>
				</Details>
				<Details summary="Does it work on iPhone and Android?">
					<p>
						It works in any modern mobile browser, and installs as an app over https. So far it's been tested
						most in Chrome at phone size; <a href={`${REPO}/issues`}>reports</a> from real devices are very
						welcome.
					</p>
				</Details>
				<Details summary="What about macOS and Windows?">
					<p>
						Kiteline has been tested on Linux. It runs anywhere Node.js and Claude Code do, but the
						background-service steps here are for Linux.
					</p>
				</Details>
				<Details summary="Is it made by Anthropic?">
					<p>No. Kiteline is an independent, MIT-licensed project, and isn't affiliated with Anthropic.</p>
				</Details>
			</Section>
		</>
	);
}
