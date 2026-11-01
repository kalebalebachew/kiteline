import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves the site under /kiteline/; SITE_BASE overrides it.
export default defineConfig({
	base: process.env.SITE_BASE ?? "/",
	plugins: [react()],
	server: { host: true },
});
