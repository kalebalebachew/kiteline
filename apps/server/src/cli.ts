#!/usr/bin/env node
import { parseArgs } from "node:util";

import pkg from "../package.json" with { type: "json" };
import { accent, bold, dim } from "./banner";
import { startedFromCli } from "./config";

const HELP = `
  ${accent("◆")}  ${bold("Kiteline")} ${dim(pkg.version)}
     Drive Claude Code on this computer from your phone.

  ${bold("Usage")}
    kiteline                     Start Kiteline; the first time, it shows a code to pair your phone
    kiteline pair                Pair a phone: a code that works once, then you allow the phone
    kiteline devices             See the paired devices, and when each was last used
    kiteline devices remove <name or id>
                                 Unpair one device; with --all, every one
    kiteline service install     Keep it running in the background, from startup (Linux)
    kiteline service uninstall   Take the background service away
    kiteline service             Say whether it's running in the background

  ${bold("Options")}
    -p, --port <number>          Port to listen on. Default 4545
        --host <address>         Address to listen on. Default 0.0.0.0, every network;
                                 127.0.0.1 keeps it to this computer, for Tailscale Serve
        --public-url <url>       The address your phone uses, like your Tailscale one;
                                 the pairing code points there
        --relay                  Reach this computer from anywhere, through Kiteline's relay.
                                 Sealed end to end: the relay passes your sessions on unread
        --force                  With service install: replace a service set up by hand
    -v, --version                Show the version
    -h, --help                   Show this

  The options also work as environment variables (PORT, HOST, KITELINE_PUBLIC_URL, KITELINE_RELAY), and a few
  more settings do too: ${accent("https://kiteline.seefun.dev/docs/#config")}
`;

function fail(message: string): never {
	console.error(`\n  ${accent("◆")}  ${message}\n`);
	process.exit(1);
}

const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
	fail(
		`Kiteline needs Node.js 22.18 or newer, and this is ${process.version}.\n     Get a newer one from ${accent("https://nodejs.org")}, then run it again.`,
	);
}

let parsed: ReturnType<typeof parse>;
function parse() {
	return parseArgs({
		allowPositionals: true,
		options: {
			port: { type: "string", short: "p" },
			host: { type: "string" },
			"public-url": { type: "string" },
			"new-token": { type: "boolean" },
			all: { type: "boolean" },
			relay: { type: "boolean" },
			force: { type: "boolean" },
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
		},
	});
}
try {
	parsed = parse();
} catch (error) {
	// Node's own wording talks about positional arguments; say what went wrong instead.
	const code = (error as { code?: string }).code;
	const message = error instanceof Error ? error.message : String(error);
	const option = /'(-[^']+)'/.exec(message)?.[1];
	if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" && option)
		fail(`Kiteline doesn't take ${option}. Run ${bold("kiteline --help")} to see what it does.`);
	if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
		const name = /--[\w-]+/.exec(message)?.[0] ?? "That option";
		fail(
			message.includes("argument missing")
				? `${name} needs a value after it, like ${name === "--port" ? "--port 4546" : `${name} <value>`}.`
				: `${name} doesn't take a value.`,
		);
	}
	fail(`${message}. Run ${bold("kiteline --help")} to see what it takes.`);
}
const { values, positionals } = parsed;

if (values.version) {
	console.log(pkg.version);
	process.exit(0);
}
if (values.help || positionals[0] === "help") {
	console.log(HELP);
	process.exit(0);
}

// A flag is the setting of the same name, so the server, `pair` and the service all read one place.
if (values.port !== undefined) process.env.PORT = values.port;
if (values.host !== undefined) process.env.HOST = values.host;
if (values["public-url"] !== undefined) process.env.KITELINE_PUBLIC_URL = values["public-url"];
if (values.relay) process.env.KITELINE_RELAY ||= "on";
startedFromCli();

const [command, action, ...rest] = positionals;
// Only a device's name can run to several words: `kiteline devices remove iPhone · Safari`.
if (rest.length && !(command === "devices" && action !== undefined))
	fail(`"${rest.join(" ")}" isn't something Kiteline takes. Run ${bold("kiteline --help")}.`);

/** The commands that talk to the Kiteline already running, with what to do when it isn't. */
async function talk<T>(run: () => Promise<T>) {
	const { Unreachable } = await import("./control");
	try {
		return await run();
	} catch (error) {
		if (error instanceof Unreachable) fail(error.message);
		throw error;
	}
}

switch (command) {
	case undefined:
	case "start":
		if (action) fail(`"${action}" isn't something Kiteline takes. Run ${bold("kiteline --help")}.`);
		await import("./index");
		break;
	case "pair": {
		if (action) fail(`"${action}" isn't something kiteline pair takes. Run ${bold("kiteline --help")}.`);
		const { pairCommand } = await import("./pair-command");
		process.exit((await talk(pairCommand)) ? 0 : 1);
		break;
	}
	case "devices": {
		const { devicesCommand } = await import("./devices-command");
		await talk(() => devicesCommand(action, rest.join(" "), { all: values.all === true }));
		process.exit(0);
		break;
	}
	case "service": {
		const { service } = await import("./service");
		await service(action, { force: values.force === true });
		break;
	}
	default:
		fail(`Kiteline doesn't know "${command}". Run ${bold("kiteline --help")} to see what it does.`);
}
