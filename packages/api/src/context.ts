import type { RunManager } from "./agent/manager";
import type { Actor, Devices } from "./devices";

export type Context = {
	authed: boolean;
	/** Who's asking: a paired device, or the computer's own `kiteline` commands, as "terminal". */
	caller: Actor | null;
	manager: RunManager;
	devices: Devices;
	/** The link a one-time pairing code goes in, with its QR code. */
	pairingLink: (code: string) => { url: string; svg: string };
	allowBypass: boolean;
	version: string;
};
