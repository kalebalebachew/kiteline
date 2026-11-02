import { Unreachable } from "./control";
import { pairCommand } from "./pair-command";

/** `pnpm pair` in a clone: pair a phone with the Kiteline that's running. */
try {
	process.exitCode = (await pairCommand()) ? 0 : 1;
} catch (error) {
	if (!(error instanceof Unreachable)) throw error;
	console.error(`\n  ${error.message}\n`);
	process.exitCode = 1;
}
process.exit();
