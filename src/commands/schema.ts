// noona schema — print the JSON response shape for a command.
//
// Agents call `noona schema slots --json` once to learn the shape they'll get
// from `noona slots --json`. Hand-curated — this is the contract.

import { color, die, isJsonMode, printJson } from "../lib/output.ts";

interface SchemaFlags {
	json?: boolean;
	pretty?: boolean;
	command?: string;
}

interface CommandSchema {
	command: string;
	mutating: boolean;
	requires_auth: boolean;
	shape: unknown;
}

const SCHEMAS: Record<string, CommandSchema> = {
	whoami: {
		command: "whoami",
		mutating: false,
		requires_auth: true,
		shape: {
			id: "string | null",
			name: "string | null",
			phone: "string | null",
			phone_verified: "boolean | null",
			email: "string | null",
			kennitala: "string | null",
			favorite_companies: "number",
		},
	},
	search: {
		command: "search",
		mutating: false,
		requires_auth: false,
		shape: {
			query: "string | null",
			returned: "number",
			companies: [
				{
					id: "string",
					name: "string",
					url_name: "string | null",
					vertical: "string | null",
					address: "string | null",
					types: "string[]",
				},
			],
		},
	},
	services: {
		command: "services",
		mutating: false,
		requires_auth: false,
		shape: {
			company: { id: "string", name: "string | null" },
			returned: "number",
			services: [
				{
					id: "string",
					title: "string | null",
					minutes: "number | null",
					price_from: "number | null",
					currency: "string | null",
					variations: "number",
				},
			],
		},
	},
	slots: {
		command: "slots",
		mutating: false,
		requires_auth: false,
		shape: {
			company: { id: "string", name: "string | null" },
			range: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" },
			service_ids: "string[] | null",
			available_days: "number",
			total_slots: "number",
			days: [{ date: "YYYY-MM-DD", status: "string", times: "string[] (HH:MM)" }],
		},
	},
	book: {
		command: "book",
		mutating: true,
		requires_auth: true,
		shape: {
			booked: "boolean",
			event_id: "string",
			status: "string | null",
			confirmed: "boolean | null",
			starts_at: "string (ISO)",
			ends_at: "string (ISO)",
			company: { id: "string", name: "string | null" },
			service: { id: "string", title: "string | null", minutes: "number" },
		},
	},
	bookings: {
		command: "bookings",
		mutating: false,
		requires_auth: true,
		shape: {
			returned: "number",
			bookings: [
				{
					id: "string",
					starts_at: "string (ISO) | null",
					ends_at: "string (ISO) | null",
					status: "string | null",
					confirmed: "boolean | null",
					company: "string | null",
					services: "string[]",
				},
			],
		},
	},
	cancel: {
		command: "cancel",
		mutating: true,
		requires_auth: true,
		shape: {
			cancelled: "boolean",
			event_id: "string",
			status: "string | null",
			verified_removed: "boolean | null  (true = confirmed gone from bookings)",
		},
	},
	doctor: {
		command: "doctor",
		mutating: false,
		requires_auth: false,
		shape: {
			status: "'ok' | 'warn' | 'fail'",
			checks: [{ name: "string", status: "'ok' | 'warn' | 'fail'", detail: "string" }],
		},
	},
};

export async function schemaCommand(flags: SchemaFlags): Promise<void> {
	const json = isJsonMode(flags);

	if (!flags.command) {
		if (json) {
			printJson({ commands: Object.values(SCHEMAS) });
		} else {
			console.log(color.bold("Schemas available:"));
			for (const name of Object.keys(SCHEMAS)) console.log(`  ${name}`);
			console.log("");
			console.log(color.dim("Run `noona schema <command> --json` for the full shape."));
		}
		return;
	}

	const schema = SCHEMAS[flags.command];
	if (!schema) {
		die(`No schema for "${flags.command}". Known: ${Object.keys(SCHEMAS).join(", ")}`, 64, json);
	}
	if (json) return printJson(schema);
	console.log(color.bold(`noona ${schema.command}`));
	console.log(`  ${color.dim("mutating")}      ${schema.mutating}`);
	console.log(`  ${color.dim("requires_auth")} ${schema.requires_auth}`);
	console.log("");
	console.log(color.dim("Shape:"));
	console.log(JSON.stringify(schema.shape, null, 2));
}
