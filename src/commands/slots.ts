// noona slots <company> --service <id> — list open time slots. Public.
// Defaults to the next 7 days from today.

import { findSlots } from "../lib/ops.ts";
import { color, die, isJsonMode, printJson } from "../lib/output.ts";
import { publicClient } from "../lib/session.ts";

interface SlotsFlags {
	company?: string;
	service?: string; // event_type_id (comma-separated allowed)
	employee?: string;
	from?: string; // YYYY-MM-DD
	to?: string; // YYYY-MM-DD
	days?: string;
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
}

export async function slotsCommand(flags: SlotsFlags): Promise<void> {
	const json = isJsonMode(flags);
	if (!flags.company) die("Usage: noona slots <url_name|company_id> --service <id>", 64, json);

	const { raw, result } = await findSlots(publicClient(), {
		company: flags.company,
		serviceIds: flags.service
			?.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
		employee: flags.employee,
		from: flags.from,
		to: flags.to,
		days: flags.days ? Math.max(1, Number.parseInt(flags.days, 10)) : undefined,
	});

	if (flags.raw) return printJson(raw);
	if (json) return printJson(result);

	if (result.company.name) console.log(color.bold(result.company.name));
	console.log(color.dim(`${result.range.from} → ${result.range.to}`));
	if (result.days.length === 0) {
		console.log(color.yellow("No open slots in this range."));
		return;
	}
	for (const d of result.days) {
		console.log(`${color.bold(d.date)}  ${color.green(`${d.times.length} slots`)}`);
		console.log(`  ${d.times.join("  ")}`);
	}
	console.log(color.dim("\nNext: `noona book <company> --service <id> --at <YYYY-MM-DDTHH:MM>`"));
}
