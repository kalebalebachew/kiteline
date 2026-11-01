/** The docs' sections, in order, grouped for the sidebar. Each id is a section's h2 in content.tsx. */
export const NAV: { group: string; items: { id: string; title: string }[] }[] = [
	{
		group: "Get started",
		items: [
			{ id: "overview", title: "What Kiteline is" },
			{ id: "requirements", title: "What you need" },
			{ id: "install", title: "Install" },
			{ id: "pair", title: "Pair your phone" },
			{ id: "home-screen", title: "Add it to your home screen" },
		],
	},
	{
		group: "Use it",
		items: [
			{ id: "sessions", title: "Your sessions" },
			{ id: "new-session", title: "Start a session" },
			{ id: "watch", title: "Watch it work" },
			{ id: "approve", title: "Approve what it does" },
			{ id: "modes", title: "Permission modes" },
			{ id: "models", title: "Models" },
			{ id: "images", title: "Images" },
			{ id: "commands", title: "Slash commands" },
			{ id: "settings", title: "Settings" },
		],
	},
	{
		group: "Run it always",
		items: [
			{ id: "anywhere", title: "Reach it from anywhere" },
			{ id: "always-on", title: "Keep it running" },
			{ id: "update", title: "Update" },
		],
	},
	{
		group: "Reference",
		items: [
			{ id: "config", title: "Configuration" },
			{ id: "security", title: "Security" },
			{ id: "how-it-works", title: "How it works" },
		],
	},
	{
		group: "Help",
		items: [
			{ id: "troubleshooting", title: "Troubleshooting" },
			{ id: "faq", title: "Questions" },
		],
	},
];

export const GROUP_OF = Object.fromEntries(
	NAV.flatMap(({ group, items }) => items.map(({ id }) => [id, group])),
);
