import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "system" | "light" | "dark";
type ThemeState = { theme: Theme; resolved: "light" | "dark"; setTheme: (theme: Theme) => void };

const ThemeContext = createContext<ThemeState | null>(null);
const query = "(prefers-color-scheme: dark)";

function readStored(key: string, fallback: Theme): Theme {
	try {
		const value = localStorage.getItem(key);
		return value === "light" || value === "dark" || value === "system" ? value : fallback;
	} catch {
		return fallback;
	}
}

/** Toggles `.dark` on <html>. index.html applies the stored choice before first paint. */
export function ThemeProvider({
	children,
	storageKey = "kiteline-theme",
	defaultTheme = "system",
}: {
	children: ReactNode;
	storageKey?: string;
	defaultTheme?: Theme;
}) {
	const [theme, setThemeState] = useState<Theme>(() => readStored(storageKey, defaultTheme));
	const [systemDark, setSystemDark] = useState(() => window.matchMedia(query).matches);

	useEffect(() => {
		const media = window.matchMedia(query);
		const onChange = () => setSystemDark(media.matches);
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, []);

	const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;

	useEffect(() => {
		const root = document.documentElement;
		root.classList.toggle("dark", resolved === "dark");
		root.style.colorScheme = resolved;
	}, [resolved]);

	const setTheme = useCallback(
		(next: Theme) => {
			setThemeState(next);
			try {
				localStorage.setItem(storageKey, next);
			} catch {
				// Storage blocked: the choice lasts for this visit.
			}
		},
		[storageKey],
	);

	const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const value = useContext(ThemeContext);
	if (!value) throw new Error("useTheme needs a ThemeProvider");
	return value;
}
