import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "../base.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Docs } from "./Docs";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
	<StrictMode>
		<Docs />
	</StrictMode>,
);
