// noona bookings — list your bookings (events), or one in full with --id. Requires auth.

import { companyName } from "../lib/api.ts";
import { dateTime } from "../lib/format.ts";
import { color, isJsonMode, printJson } from "../lib/output.ts";
import { authedClient } from "../lib/session.ts";
import type { Company, Event, EventType } from "../lib/types.ts";

function companyLabel(c: Company | string | undefined): string | null {
	if (!c) return null;
	if (typeof c === "string") return c;
	return companyName(c);
}

function serviceLabels(ets: (EventType | string)[] | undefined): string[] {
	if (!ets) return [];
	return ets.map((e) => (typeof e === "string" ? e : (e.title ?? e.id))).filter(Boolean);
}

export async function bookingsCommand(flags: {
	id?: string;
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
}): Promise<void> {
	const json = isJsonMode(flags);
	const client = authedClient(json);

	if (flags.id) {
		const ev = await client.getEvent(flags.id);
		if (flags.raw || json) return printJson(ev);
		printEvent(ev);
		return;
	}

	const events = await client.listEvents();
	if (flags.raw) return printJson(events);

	const rows = events.map((e) => ({
		id: e.id,
		starts_at: e.starts_at ?? null,
		ends_at: e.ends_at ?? null,
		status: e.status ?? null,
		confirmed: e.confirmed ?? null,
		company: companyLabel(e.company),
		services: serviceLabels(e.event_types),
	}));

	if (json) return printJson({ returned: rows.length, bookings: rows });
	if (rows.length === 0) {
		console.log(color.dim("No bookings."));
		return;
	}
	for (const r of rows) {
		const status = r.status === "cancelled" ? color.red(r.status) : color.green(r.status ?? "—");
		console.log(`${color.bold(dateTime(r.starts_at))}  ${status}`);
		console.log(`  ${r.services.join(", ") || "—"} @ ${r.company ?? "—"}`);
		console.log(`  ${color.dim("id:")} ${r.id}`);
	}
}

function printEvent(e: Event): void {
	console.log(color.bold(`Booking ${e.id}`));
	console.log(`  ${color.dim("when")}      ${dateTime(e.starts_at)} → ${dateTime(e.ends_at)}`);
	console.log(`  ${color.dim("status")}    ${e.status ?? "—"} (confirmed: ${e.confirmed ?? "—"})`);
	console.log(`  ${color.dim("company")}   ${companyLabel(e.company) ?? "—"}`);
	console.log(`  ${color.dim("services")}  ${serviceLabels(e.event_types).join(", ") || "—"}`);
	if (e.customer_name) console.log(`  ${color.dim("customer")}  ${e.customer_name}`);
	if (e.comment) console.log(`  ${color.dim("comment")}   ${e.comment}`);
}
