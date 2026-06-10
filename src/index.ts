#!/usr/bin/env bun

// noona — CLI for the Noona booking marketplace (api.noona.is).

import pkg from "../package.json" with { type: "json" };
import { bookCommand } from "./commands/book.ts";
import { bookingsCommand } from "./commands/bookings.ts";
import { cancelCommand } from "./commands/cancel.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { loginCommand } from "./commands/login.ts";
import { logoutCommand } from "./commands/logout.ts";
import { schemaCommand } from "./commands/schema.ts";
import { searchCommand } from "./commands/search.ts";
import { servicesCommand } from "./commands/services.ts";
import { slotsCommand } from "./commands/slots.ts";
import { whoamiCommand } from "./commands/whoami.ts";
import { ApiError, AuthError } from "./lib/api.ts";
import { color } from "./lib/output.ts";

export const VERSION = pkg.version;

// --- arg parsing ----------------------------------------------------------

function getFlag(name: string): string | undefined {
	const argv = process.argv;
	const prefix = `--${name}=`;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a) continue;
		if (a === `--${name}`) return argv[i + 1];
		if (a.startsWith(prefix)) return a.slice(prefix.length);
	}
	return undefined;
}

function hasFlag(name: string): boolean {
	const argv = process.argv;
	const prefix = `--${name}=`;
	return argv.includes(`--${name}`) || argv.some((a) => a.startsWith(prefix));
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const command = positional[0];

const globalFlags = {
	json: hasFlag("json"),
	pretty: hasFlag("pretty"),
};

if (hasFlag("version") || command === "version") {
	if (globalFlags.json) console.log(JSON.stringify({ version: VERSION, name: pkg.name }));
	else console.log(`noona ${VERSION}`);
	process.exit(0);
}

// --- help -----------------------------------------------------------------

interface CommandSpec {
	name: string;
	description: string;
	usage?: string;
}

const COMMANDS: CommandSpec[] = [
	{
		name: "login",
		description: "Authenticate. Phone OTP by default; or --token <jwt> / --provider.",
		usage: "noona login [--phone <n> --cc <354>] [--token <jwt>]",
	},
	{ name: "logout", description: "Clear the local session." },
	{ name: "whoami", description: "Show the logged-in user (auth)." },
	{
		name: "search",
		description: "Find businesses on the marketplace (public).",
		usage: "noona search <query> [--lat --lng --radius] [--sort popular|distance] [--limit N]",
	},
	{
		name: "services",
		description: "List a business's bookable services (public).",
		usage: "noona services <url_name|company_id>",
	},
	{
		name: "slots",
		description: "List open time slots for a service (public). Defaults to next 7 days.",
		usage: "noona slots <company> --service <id> [--from YYYY-MM-DD --days N] [--employee <id>]",
	},
	{
		name: "book",
		description: "Create a booking (auth, mutating; confirms unless --yes).",
		usage:
			"noona book <company> --service <id> --at <YYYY-MM-DDTHH:MM> [--name --email --phone] [--yes]",
	},
	{
		name: "bookings",
		description: "List your bookings, or one in full with --id (auth).",
		usage: "noona bookings [--id <event_id>]",
	},
	{
		name: "cancel",
		description: "Cancel a booking (auth, mutating; confirms unless --yes).",
		usage: "noona cancel <event_id> [--reason <text>] [--yes]",
	},
	{ name: "doctor", description: "Pre-flight check: API reachable, auth, token validity." },
	{
		name: "schema",
		description: "Print the JSON response shape of a command. Agent hook.",
		usage: "noona schema [<command>]",
	},
	{ name: "version", description: "Print the CLI version." },
];

function printHelp(): void {
	if (globalFlags.json) {
		console.log(
			JSON.stringify(
				{ commands: COMMANDS, global_flags: ["--json", "--pretty", "--raw"] },
				null,
				2,
			),
		);
		return;
	}
	console.log(`${color.bold("noona")} — Noona booking marketplace from the terminal`);
	console.log("");
	console.log("Commands:");
	for (const c of COMMANDS) {
		console.log(`  ${color.bold(c.name.padEnd(10))} ${c.description}`);
	}
	console.log("");
	console.log(
		`Global: ${color.dim("--json")} (machine output), ${color.dim("--pretty")} (force human), ${color.dim("--raw")} (raw API payload)`,
	);
}

// --- dispatch -------------------------------------------------------------

async function main(): Promise<void> {
	if (!command || command === "help" || hasFlag("help")) {
		printHelp();
		return;
	}

	const raw = hasFlag("raw");

	switch (command) {
		case "login":
			return loginCommand({
				token: getFlag("token"),
				phone: getFlag("phone"),
				cc: getFlag("cc"),
				code: getFlag("code"),
				provider: getFlag("provider"),
				idToken: getFlag("id-token"),
				...globalFlags,
			});
		case "logout":
			return logoutCommand(globalFlags);
		case "whoami":
			return whoamiCommand({ raw, ...globalFlags });
		case "search":
			return searchCommand({
				query: positional[1],
				lat: getFlag("lat"),
				lng: getFlag("lng"),
				radius: getFlag("radius"),
				type: getFlag("type"),
				sort: getFlag("sort"),
				limit: getFlag("limit"),
				raw,
				...globalFlags,
			});
		case "services":
			return servicesCommand({ company: positional[1], raw, ...globalFlags });
		case "slots":
			return slotsCommand({
				company: positional[1],
				service: getFlag("service"),
				employee: getFlag("employee"),
				from: getFlag("from"),
				to: getFlag("to"),
				days: getFlag("days"),
				raw,
				...globalFlags,
			});
		case "book":
			return bookCommand({
				company: positional[1],
				service: getFlag("service"),
				at: getFlag("at"),
				employee: getFlag("employee"),
				guests: getFlag("guests"),
				name: getFlag("name"),
				email: getFlag("email"),
				phone: getFlag("phone"),
				cc: getFlag("cc"),
				comment: getFlag("comment"),
				yes: hasFlag("yes"),
				raw,
				...globalFlags,
			});
		case "bookings":
			return bookingsCommand({ id: getFlag("id"), raw, ...globalFlags });
		case "cancel":
			return cancelCommand({
				id: positional[1] ?? getFlag("id"),
				reason: getFlag("reason"),
				yes: hasFlag("yes"),
				raw,
				...globalFlags,
			});
		case "doctor":
			return doctorCommand(globalFlags);
		case "schema":
			return schemaCommand({ command: positional[1], ...globalFlags });
		default:
			console.error(color.red(`Unknown command: ${command}`));
			console.error(`Run ${color.bold("noona help")}.`);
			process.exit(64);
	}
}

main().catch((err: unknown) => {
	if (err instanceof AuthError) {
		if (globalFlags.json) console.error(JSON.stringify({ error: err.message, status: err.status }));
		else console.error(color.red(`Error: ${err.message}`));
		process.exit(2);
	}
	const msg = err instanceof Error ? err.message : String(err);
	if (globalFlags.json) {
		const status = err instanceof ApiError ? err.status : undefined;
		console.error(JSON.stringify({ error: msg, status }));
	} else {
		console.error(color.red(`Error: ${msg}`));
	}
	process.exit(1);
});
