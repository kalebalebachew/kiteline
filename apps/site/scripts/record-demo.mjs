// Records one loop of the hero demo as PNG frames, stepping the stage's
// virtual clock so every frame is exact, then encodes an animated WebP and a
// poster with ffmpeg.
//
//   node scripts/record-demo.mjs <site url> <out dir> [--scale 1.25]
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [base, out, ...rest] = process.argv.slice(2);
const scale = Number(rest[rest.indexOf("--scale") + 1]) || 1.25;
const FPS = 25;
const frames = join(out, "frames");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const port = 9335;
const chrome = spawn(
	"chromium",
	["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, "about:blank"],
	{ stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50; i++) {
	try {
		const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
		const page = list.find((t) => t.type === "page");
		if (page) {
			ws = new WebSocket(page.webSocketDebuggerUrl);
			break;
		}
	} catch {}
	await sleep(200);
}
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
	const m = JSON.parse(e.data);
	if (m.id && pending.has(m.id)) {
		pending.get(m.id)(m);
		pending.delete(m.id);
	}
});
const send = (method, params = {}) =>
	new Promise((r) => {
		const i = ++id;
		pending.set(i, r);
		ws.send(JSON.stringify({ id: i, method, params }));
	});
const evaluate = async (expression) =>
	(await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.result
		?.value;

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
	width: 1000,
	height: 720,
	deviceScaleFactor: scale,
	mobile: false,
});
await send("Page.navigate", { url: `${base}/?demo&record` });
await sleep(2500);
await evaluate("document.fonts.ready.then(() => true)");

const step = () =>
	evaluate(
		"window.__stageshow.clock.step(1).then(() => window.__stageshow.clock.settle()).then(() => document.querySelector('.ss-stage')?.dataset.mark ?? '')",
	);
const box = await evaluate(
	"(() => { const r = document.querySelector('#demo .ss-stage').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()",
);

// Find one loop: from the first 'ask' mark to the next one.
const marks = [];
for (let f = 0; f < FPS * 40; f++) {
	marks.push(await step());
	const asks = marks.flatMap((m, i) => (m === "ask" && marks[i - 1] !== "ask" ? [i] : []));
	if (asks.length >= 2) break;
}
const asks = marks.flatMap((m, i) => (m === "ask" && marks[i - 1] !== "ask" ? [i] : []));
if (asks.length < 2) throw new Error("Couldn't find a full loop");
const period = asks[1] - asks[0];
// Land on the start of a loop: the frame a loop's opening wait begins.
const lead = Math.round(1.3 * FPS);
const toStart = asks[1] - lead - (marks.length - 1);
for (let f = 0; f < toStart; f++) await step();

for (let f = 0; f < period; f++) {
	const shot = await send("Page.captureScreenshot", { format: "png", clip: { ...box, scale: 1 } });
	writeFileSync(join(frames, `f${String(f).padStart(4, "0")}.png`), Buffer.from(shot.result.data, "base64"));
	await step();
}
ws.close();
chrome.kill();
console.log(`recorded ${period} frames (${(period / FPS).toFixed(1)}s at ${FPS}fps)`);

const webp = join(out, "kiteline-demo.webp");
const enc = spawnSync(
	"ffmpeg",
	[
		"-y",
		"-loglevel",
		"error",
		"-framerate",
		String(FPS),
		"-i",
		join(frames, "f%04d.png"),
		"-c:v",
		"libwebp_anim",
		"-lossless",
		"0",
		"-quality",
		"82",
		"-compression_level",
		"6",
		"-loop",
		"0",
		webp,
	],
	{ stdio: "inherit" },
);
if (enc.status !== 0) throw new Error("ffmpeg failed");
console.log(`wrote ${webp}`);
