// noona book <company> --service <id> --at <YYYY-MM-DDTHH:MM> — create a booking.
// Mutating; confirms first unless --yes. Requires auth.
//
// Flow (per the Marketplace spec, verified against a real account): hold a slot
// with POST /time_slot_reservations, then confirm with POST /events referencing
// that reservation. See src/lib/ops.ts.

import { dateTime } from "../lib/format.ts";
import { executeBooking, planBooking } from "../lib/ops.ts";
import { color, die, isJsonMode, printJson } from "../lib/output.ts";
import { confirm } from "../lib/prompt.ts";
import { authedClient, publicClient } from "../lib/session.ts";

interface BookFlags {
	company?: string;
	service?: string;
	at?: string;
	employee?: string;
	guests?: string;
	name?: string;
	email?: string;
	phone?: string;
	cc?: string;
	comment?: string;
	yes?: boolean;
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
}

export async function bookCommand(flags: BookFlags): Promise<void> {
	const json = isJsonMode(flags);
	if (!flags.company || !flags.service || !flags.at) {
		die("Usage: noona book <url_name|company_id> --service <id> --at <YYYY-MM-DDTHH:MM>", 64, json);
	}

	const client = authedClient(json);
	const plan = await planBooking(client, publicClient(), {
		company: flags.company,
		service: flags.service,
		at: flags.at,
		employee: flags.employee,
		guests: flags.guests ? Math.max(1, Number.parseInt(flags.guests, 10)) : undefined,
		name: flags.name,
		email: flags.email,
		phone: flags.phone,
		cc: flags.cc,
		comment: flags.comment,
	});
	const s = plan.summary;

	if (!flags.yes) {
		if (json) {
			die(
				"Refusing to book without --yes in non-interactive mode. Review the plan first.",
				3,
				true,
			);
		}
		console.log(color.bold("About to book:"));
		console.log(`  ${s.service.title ?? s.service.id} @ ${s.company.name ?? s.company.id}`);
		console.log(
			`  ${dateTime(s.starts_at)} → ${dateTime(s.ends_at)} ${s.time_zone ? color.dim(`(${s.time_zone})`) : ""}`,
		);
		console.log(`  as ${plan.customer.customer_name ?? plan.customer.phone_number ?? "you"}`);
		const ok = await confirm("Confirm booking?", false);
		if (!ok) {
			console.log(color.yellow("Cancelled."));
			return;
		}
	}

	const { reservation, event, result } = await executeBooking(client, plan);
	if (flags.raw) return printJson({ reservation, event });
	if (json) return printJson(result);
	console.log(color.green(`✓ Booked — event ${event.id}`));
	console.log(`  ${s.service.title ?? s.service.id} @ ${s.company.name ?? s.company.id}`);
	console.log(
		`  ${dateTime(event.starts_at ?? s.starts_at)} → ${dateTime(event.ends_at ?? s.ends_at)}`,
	);
	console.log(`  ${color.dim("status:")} ${event.status ?? "—"}`);
}
