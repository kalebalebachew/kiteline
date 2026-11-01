import type { HighlighterCore } from "shiki/core";

/**
 * A small, lazily loaded Shiki. Only the grammars a coding session tends to
 * show are wired in, and each loads the first time a block needs it.
 */
const GRAMMARS: Record<string, () => Promise<unknown>> = {
	typescript: () => import("shiki/langs/typescript.mjs"),
	tsx: () => import("shiki/langs/tsx.mjs"),
	javascript: () => import("shiki/langs/javascript.mjs"),
	jsx: () => import("shiki/langs/jsx.mjs"),
	json: () => import("shiki/langs/json.mjs"),
	shellscript: () => import("shiki/langs/shellscript.mjs"),
	python: () => import("shiki/langs/python.mjs"),
	css: () => import("shiki/langs/css.mjs"),
	html: () => import("shiki/langs/html.mjs"),
	markdown: () => import("shiki/langs/markdown.mjs"),
	yaml: () => import("shiki/langs/yaml.mjs"),
	toml: () => import("shiki/langs/toml.mjs"),
	sql: () => import("shiki/langs/sql.mjs"),
	go: () => import("shiki/langs/go.mjs"),
	rust: () => import("shiki/langs/rust.mjs"),
	diff: () => import("shiki/langs/diff.mjs"),
	dockerfile: () => import("shiki/langs/dockerfile.mjs"),
};

const ALIASES: Record<string, string> = {
	ts: "typescript",
	mts: "typescript",
	cts: "typescript",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	jsonc: "json",
	sh: "shellscript",
	bash: "shellscript",
	zsh: "shellscript",
	shell: "shellscript",
	console: "shellscript",
	py: "python",
	md: "markdown",
	mdx: "markdown",
	yml: "yaml",
	rs: "rust",
	patch: "diff",
	docker: "dockerfile",
	htm: "html",
};

export function grammarFor(lang: string | undefined | null) {
	if (!lang) return null;
	const key = lang.toLowerCase();
	const name = ALIASES[key] ?? key;
	return name in GRAMMARS ? name : null;
}

export function grammarForPath(path: string) {
	const file = path.split("/").pop() ?? "";
	if (/^dockerfile/i.test(file)) return "dockerfile";
	return grammarFor(file.includes(".") ? file.split(".").pop() : null);
}

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter() {
	highlighter ??= (async () => {
		const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
			import("shiki/core"),
			import("shiki/engine/javascript"),
		]);
		return createHighlighterCore({
			themes: [
				import("shiki/themes/github-light-default.mjs"),
				import("shiki/themes/github-dark-default.mjs"),
			],
			langs: [],
			engine: createJavaScriptRegexEngine(),
		});
	})();
	return highlighter;
}

const cache = new Map<string, string>();

export async function highlight(code: string, lang: string): Promise<string | null> {
	const name = grammarFor(lang);
	if (!name || code.length > 60_000) return null;
	const key = `${name}\u0000${code}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const shiki = await getHighlighter();
	if (!shiki.getLoadedLanguages().includes(name)) {
		const grammar = (await GRAMMARS[name]?.()) as { default: Parameters<HighlighterCore["loadLanguage"]>[0] };
		await shiki.loadLanguage(grammar.default);
	}
	const html = shiki.codeToHtml(code, {
		lang: name,
		themes: { light: "github-light-default", dark: "github-dark-default" },
		defaultColor: false,
	});
	if (cache.size > 200) cache.clear();
	cache.set(key, html);
	return html;
}
