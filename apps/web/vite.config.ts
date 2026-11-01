import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const api = "http://localhost:4545";

export default defineConfig({
	server: {
		port: 4546,
		// Reachable from a phone on the same network or tailnet during development.
		host: true,
		proxy: { "/rpc": api, "/auth": api },
	},
	preview: { port: 4546, host: true, proxy: { "/rpc": api, "/auth": api } },
	resolve: {
		tsconfigPaths: true,
	},
	build: {
		rollupOptions: {
			output: {
				// Syntax grammars load on demand; keep them out of the offline precache.
				chunkFileNames: (chunk) =>
					chunk.moduleIds.some((id) => id.includes("/shiki/") || id.includes("/@shikijs/"))
						? "assets/lazy/[name]-[hash].js"
						: "assets/[name]-[hash].js",
			},
		},
	},
	plugins: [
		varlockVitePlugin({ ssrInjectMode: "auto-load" }),
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
		VitePWA({
			registerType: "autoUpdate",
			workbox: {
				globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
				globIgnores: ["**/assets/lazy/**"],
				navigateFallbackDenylist: [/^\/rpc/, /^\/auth/],
				runtimeCaching: [
					{
						urlPattern: ({ url }) => url.pathname.startsWith("/assets/lazy/"),
						handler: "CacheFirst",
						options: { cacheName: "kiteline-grammars", expiration: { maxEntries: 80 } },
					},
				],
			},
			manifest: {
				name: "Kiteline",
				short_name: "Kiteline",
				description: "Drive Claude Code on your computer from your phone.",
				theme_color: "#121319",
				background_color: "#121319",
				display: "standalone",
				orientation: "portrait",
				start_url: "/",
			},
			pwaAssets: { disabled: false, config: true },
			devOptions: { enabled: false },
		}),
	],
});
