type HighEntropy = { model?: string };
type UserAgentData = { getHighEntropyValues?: (hints: string[]) => Promise<HighEntropy> };

function deviceOf(ua: string) {
	if (/iPhone/.test(ua)) return "iPhone";
	if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
	if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
	if (/CrOS/.test(ua)) return "Chromebook";
	if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
	if (/Windows/.test(ua)) return "Windows PC";
	if (/Linux/.test(ua)) return "Linux computer";
	return "Device";
}

function browserOf(ua: string) {
	// A home screen app keeps its own pairing, apart from the browser it came from.
	if (window.matchMedia?.("(display-mode: standalone)").matches) return "home screen app";
	if (/EdgiOS|EdgA|Edg\//.test(ua)) return "Edge";
	if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
	if (/FxiOS|Firefox\//.test(ua)) return "Firefox";
	if (/OPR\/|Opera/.test(ua)) return "Opera";
	if (/CriOS|Chrome\//.test(ua)) return "Chrome";
	if (/Safari\//.test(ua)) return "Safari";
	return "browser";
}

/**
 * What this device calls itself when it asks to pair, "iPhone · Safari" or "Pixel 8 · Chrome", so the
 * person allowing it, and every list of paired devices after, can tell which one it is.
 */
export async function deviceName() {
	const ua = navigator.userAgent;
	let model = "";
	try {
		const data = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
		model = (await data?.getHighEntropyValues?.(["model"]))?.model?.trim() ?? "";
	} catch {
		// Not offered here; the user agent says enough.
	}
	return `${model || deviceOf(ua)} · ${browserOf(ua)}`;
}
