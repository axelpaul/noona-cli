// noona book <company> --service <id> --at <YYYY-MM-DDTHH:MM> — create a booking.
// Mutating; confirms first unless --yes. Requires auth.
//
// Flow (per the Marketplace spec): hold a slot with POST /time_slot_reservations,
// then confirm with POST /events referencing that reservation.
//
// NOTE: the reserve→confirm bodies are implemented from the OpenAPI spec but have
// not been exercised against a live account yet (needs a real phone login). Treat
// the first real booking as a verification run; --raw shows the exact payloads.

import { companyName } from "../lib/api.ts";
import { addMinutesISO, dateTime, toInstantISO } from "../lib/format.ts";
import { color, die, isJsonMode, printJson } from "../lib/output.ts";
import { confirm } from "../lib/prompt.ts";
import { resolveCompany } from "../lib/resolve.ts";
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
	// Company detail (timezone + service duration) comes from public endpoints.
	const pub = publicClient();
	const { id: companyId, company } = await resolveCompany(pub, flags.company);
	const tz = company?.connections?.location?.time_zone;

	// Look up the service to get its duration (for ends_at) and a nice label.
	const eventTypes = await pub.listEventTypes(companyId);
	const svc = eventTypes.find((e) => e.id === flags.service);
	if (!svc) die(`Service ${flags.service} not found for this company.`, 64, json);
	if (svc.minutes == null) {
		die("Service has no duration; pass an --at with explicit end is not supported yet.", 1, json);
	}

	const startsAt = toInstantISO(flags.at, tz);
	const endsAt = addMinutesISO(startsAt, svc.minutes ?? 0);
	const guests = flags.guests ? Math.max(1, Number.parseInt(flags.guests, 10)) : undefined;

	// Customer identity: flags win, else fall back to the logged-in profile.
	const me = await client.getUser().catch(() => null);
	const customer = {
		customer_name: flags.name ?? me?.name,
		ssn: me?.kennitala,
		license_plate: me?.license_plate,
		email: flags.email ?? me?.email,
		phone_number: flags.phone ?? me?.phone_number,
		phone_country_code: flags.cc ?? me?.phone_country_code,
	};

	const plan = {
		company: { id: companyId, name: company ? companyName(company) : null },
		service: { id: svc.id, title: svc.title ?? null, minutes: svc.minutes },
		starts_at: startsAt,
		ends_at: endsAt,
		employee: flags.employee ?? null,
		guests: guests ?? null,
		customer,
	};

	if (!flags.yes) {
		if (json) {
			die(
				"Refusing to book without --yes in non-interactive mode. Review the plan first.",
				3,
				true,
			);
		}
		console.log(color.bold("About to book:"));
		console.log(`  ${plan.service.title ?? svc.id} @ ${plan.company.name ?? companyId}`);
		console.log(`  ${dateTime(startsAt)} → ${dateTime(endsAt)} ${tz ? color.dim(`(${tz})`) : ""}`);
		console.log(`  as ${customer.customer_name ?? customer.phone_number ?? "you"}`);
		const ok = await confirm("Confirm booking?", false);
		if (!ok) {
			console.log(color.yellow("Cancelled."));
			return;
		}
	}

	// 1) Hold the slot.
	const reservation = await client.createReservation({
		company: companyId,
		event_types: [svc.id],
		starts_at: startsAt,
		ends_at: endsAt,
		employee: flags.employee,
		number_of_guests: guests,
		time_zone: tz,
	});

	// 2) Confirm the booking against the reservation.
	const event = await client.createEvent({
		time_slot_reservation: reservation.id,
		company: companyId,
		event_types: [{ id: svc.id }],
		starts_at: startsAt,
		ends_at: endsAt,
		employee: flags.employee,
		customer_name: customer.customer_name,
		ssn: customer.ssn,
		license_plate: customer.license_plate,
		email: customer.email,
		phone_number: customer.phone_number,
		phone_country_code: customer.phone_country_code,
		comment: flags.comment,
		number_of_guests: guests,
	});

	if (flags.raw) return printJson({ reservation, event });

	const out = {
		booked: true,
		event_id: event.id,
		status: event.status ?? null,
		confirmed: event.confirmed ?? null,
		starts_at: event.starts_at ?? startsAt,
		ends_at: event.ends_at ?? endsAt,
		company: plan.company,
		service: plan.service,
	};
	if (json) return printJson(out);
	console.log(color.green(`✓ Booked — event ${out.event_id}`));
	console.log(`  ${out.service.title ?? svc.id} @ ${out.company.name ?? companyId}`);
	console.log(`  ${dateTime(out.starts_at)} → ${dateTime(out.ends_at)}`);
	console.log(`  ${color.dim("status:")} ${out.status ?? "—"}`);
}
