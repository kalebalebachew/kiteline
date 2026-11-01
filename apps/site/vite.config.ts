import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// GitHub Pages serves the site under /kiteline/; SITE_BASE overrides it.
// Two pages: the home page, and the docs at /docs/.
export default defineConfig({
	base: process.env.SITE_BASE ?? "/",
	plugins: [react()],
	server: { host: true },
	build: {
		rolldownOptions: {
			input: { home: page("./index.html"), docs: page("./docs/index.html") },
		},
	},
});
