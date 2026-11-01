import type { RunManager } from "./agent/manager";

export type Pairing = {
	/** The link that pairs a device, with the token in its fragment. */
	url: string;
	/** Every address this server answers on, for display. */
	urls: string[];
	svg: string;
};

export type Context = {
	authed: boolean;
	manager: RunManager;
	pairing: Pairing;
	allowBypass: boolean;
	version: string;
};
