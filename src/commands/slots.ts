// noona slots <company> --service <id> — list open time slots. Public.
// Defaults to the next 7 days from today.

import { companyName } from "../lib/api.ts";
import { addDays, today } from "../lib/format.ts";
import { color, die, isJsonMode, printJson } from "../lib/output.ts";
import { resolveCompany } from "../lib/resolve.ts";
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

	const client = publicClient();
	const { id, company } = await resolveCompany(client, flags.company);

	const startDate = flags.from ?? today();
	const days = flags.days ? Math.max(1, Number.parseInt(flags.days, 10)) : 7;
	const endDate = flags.to ?? addDays(startDate, days);

	const eventTypeIds = flags.service
		? flags.service
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		: undefined;

	const slotDays = await client.getTimeSlots(id, {
		startDate,
		endDate,
		eventTypeIds,
		employeeId: flags.employee,
	});

	if (flags.raw) return printJson(slotDays);

	const availableDays = slotDays
		.filter((d) => d.slots && d.slots.length > 0)
		.map((d) => ({ date: d.date, status: d.status, times: d.slots.map((s) => s.time) }));
	const totalSlots = availableDays.reduce((n, d) => n + d.times.length, 0);

	if (json) {
		return printJson({
			company: { id, name: company ? companyName(company) : null },
			range: { from: startDate, to: endDate },
			service_ids: eventTypeIds ?? null,
			available_days: availableDays.length,
			total_slots: totalSlots,
			days: availableDays,
		});
	}
	if (company) console.log(color.bold(companyName(company)));
	console.log(color.dim(`${startDate} → ${endDate}`));
	if (availableDays.length === 0) {
		console.log(color.yellow("No open slots in this range."));
		return;
	}
	for (const d of availableDays) {
		console.log(`${color.bold(d.date)}  ${color.green(`${d.times.length} slots`)}`);
		console.log(`  ${d.times.join("  ")}`);
	}
	console.log(color.dim("\nNext: `noona book <company> --service <id> --at <YYYY-MM-DDTHH:MM>`"));
}
