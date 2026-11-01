/**
 * Turns the rendered docs back into Markdown, for "Copy page": paste it into Claude and ask away.
 * It reads the page's own structure, so it never drifts from what's on screen.
 */
export function toMarkdown(root: HTMLElement): string {
	const out: string[] = [];
	for (const node of root.children) block(node as HTMLElement, out);
	return `${out
		.join("\n\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim()}\n`;
}

function inline(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ");
	if (!(node instanceof HTMLElement)) return "";
	if (node.classList.contains("doc-anchor") || node.getAttribute("aria-hidden") === "true") return "";
	const inner = [...node.childNodes].map(inline).join("");
	switch (node.tagName) {
		case "CODE":
		case "KBD":
			return `\`${node.textContent}\``;
		case "STRONG":
		case "B":
			return `**${inner.trim()}**`;
		case "EM":
			return `*${inner.trim()}*`;
		case "A": {
			const href = (node as HTMLAnchorElement).href;
			return href ? `[${inner.trim()}](${href})` : inner;
		}
		case "BR":
			return "\n";
		default:
			return inner;
	}
}

const text = (el: Element) => [...el.childNodes].map(inline).join("").replace(/ +/g, " ").trim();

function block(el: HTMLElement, out: string[]) {
	// A drawing that knows how to say itself in Markdown.
	if (el.dataset.md) {
		out.push(el.dataset.md);
		return;
	}
	if (el.dataset.alt) {
		out.push(`*[Figure: ${el.dataset.alt}]*`);
		return;
	}
	if (el.classList.contains("doc-code")) {
		out.push(`${el.dataset.label ? `${el.dataset.label}:\n` : ""}\`\`\`\n${el.dataset.code}\n\`\`\``);
		return;
	}
	if (el.classList.contains("doc-callout")) {
		out.push(`> **${el.dataset.label}:** ${text(el)}`);
		return;
	}
	if (el.classList.contains("doc-tabs")) {
		for (const panel of el.querySelectorAll<HTMLElement>("[role=tabpanel]")) {
			out.push(`**${panel.dataset.tab}**`);
			for (const child of panel.children) block(child as HTMLElement, out);
		}
		return;
	}
	switch (el.tagName) {
		case "H2":
			out.push(`## ${text(el)}`);
			return;
		case "H3":
			out.push(`### ${text(el)}`);
			return;
		case "H4":
			out.push(`**${text(el)}**`);
			return;
		case "P":
			out.push(text(el));
			return;
		case "UL":
		case "OL": {
			const ordered = el.tagName === "OL";
			const items = [...el.children].map((li, i) => {
				const parts: string[] = [];
				for (const child of li.children) block(child as HTMLElement, parts);
				const body = parts.length ? parts.join("\n\n") : text(li);
				return `${ordered ? `${i + 1}.` : "-"} ${body.replace(/\n/g, "\n   ")}`;
			});
			out.push(items.join("\n"));
			return;
		}
		case "DETAILS": {
			const summary = el.querySelector("summary");
			out.push(`**${summary ? text(summary) : ""}**`);
			const body = el.querySelector(".doc-details__body");
			if (body) for (const child of body.children) block(child as HTMLElement, out);
			return;
		}
		case "TABLE":
		case "DIV": {
			const table = el.tagName === "TABLE" ? el : el.querySelector(":scope > table");
			if (table) {
				const rows = [...table.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => text(c)));
				const [head, ...body] = rows;
				if (head) {
					out.push([head, head.map(() => "---"), ...body].map((r) => `| ${r.join(" | ")} |`).join("\n"));
				}
				return;
			}
			for (const child of el.children) block(child as HTMLElement, out);
			return;
		}
		case "SECTION":
			for (const child of el.children) block(child as HTMLElement, out);
			return;
		default:
			if (el.children.length) for (const child of el.children) block(child as HTMLElement, out);
			else if (text(el)) out.push(text(el));
	}
}
