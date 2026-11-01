import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "./kit/stageshow.css";
import "./base.css";
import "./site.css";

import { installVirtualClock } from "./kit/clock";

// `?record` hands time to a recorder (scripts/record-demo.mjs), which steps
// the stage one frame at a time so every frame of the README animation is exact.
if (new URLSearchParams(window.location.search).has("record")) {
	installVirtualClock({ fps: 25 });
	// GitHub's README page is pure white.
	document.documentElement.style.background = "#ffffff";
	document.body.style.background = "#ffffff";
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

const [{ StrictMode, createElement }, { createRoot }, { App }] = await Promise.all([
	import("react"),
	import("react-dom/client"),
	import("./App"),
]);

createRoot(root).render(createElement(StrictMode, null, createElement(App)));
