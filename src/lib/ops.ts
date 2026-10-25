// Shared operations used by both the CLI commands and the MCP server.
//
// Each function talks to the API through NoonaClient and returns the shaped
// result (the same object the CLI prints with --json) plus the raw payload for
// --raw. Nothing here prints or exits, so the MCP server can call it safely.

import { companyName, lowestPrice, type NoonaClient } from "./api.ts";
import { addDays, addMinutesISO, today, toInstantISO } from "./format.ts";
import { resolveCompany } from "./resolve.ts";
import type {
	Company,
	Event,
	EventType,
	MarketplaceUser,
	TimeSlotDay,
	TimeSlotReservation,
} from "./types.ts";

/** Bad input from the caller. The CLI maps this to exit code 64. */
export class UsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}

// --- search -----------------------------------------------------------------

export interface SearchInput {
	query?: string;
	lat?: number;
	lng?: number;
	radius?: number;
	type?: string;
	sort?: "popular" | "distance";
	limit?: number;
}

export async function searchBusinesses(client: NoonaClient, input: SearchInput) {
	const limit = input.limit ?? 20;
	const companies = await client.listCompanies({
		search: input.query,
		limit,
		lat: input.lat,
		lng: input.lng,
		radius: input.radius,
		companyTypeId: input.type,
		sortBy: input.sort,
	});
	const rows = companies.slice(0, limit).map((c) => ({
		id: c.id,
		name: companyName(c),
		url_name: c.connections?.url_name ?? null,
		vertical: c.vertical ?? null,
		address: c.connections?.location?.formatted_address ?? null,
		types: (c.profile?.company_types ?? []).map((t) => t.name).filter(Boolean),
	}));
	return {
		raw: companies,
		result: { query: input.query ?? null, returned: rows.length, companies: rows },
	};
}

// --- services ---------------------------------------------------------------

export async function listServices(client: NoonaClient, companyRef: string) {
	const { id, company } = await resolveCompany(client, companyRef);
	const eventTypes = await client.listEventTypes(id);
	const rows = eventTypes.map((et) => {
		const p = lowestPrice(et);
		return {
			id: et.id,
			title: et.title ?? null,
			minutes: et.minutes ?? null,
			price_from: p.amount ?? null,
			currency: p.currency ?? null,
			variations: et.variations?.length ?? 0,
		};
	});
	return {
		raw: eventTypes,
		company,
		result: {
			company: { id, name: company ? companyName(company) : null },
			returned: rows.length,
			services: rows,
		},
	};
}

// --- slots ------------------------------------------------------------------

export interface SlotsInput {
	company: string;
	serviceIds?: string[];
	employee?: string;
	from?: string; // YYYY-MM-DD
	to?: string; // YYYY-MM-DD
	days?: number;
}

export async function findSlots(client: NoonaClient, input: SlotsInput) {
	const { id, company } = await resolveCompany(client, input.company);
	const startDate = input.from ?? today();
	const endDate = input.to ?? addDays(startDate, input.days ?? 7);
	const eventTypeIds = input.serviceIds?.length ? input.serviceIds : undefined;
	const slotDays: TimeSlotDay[] = await client.getTimeSlots(id, {
		startDate,
		endDate,
		eventTypeIds,
		employeeId: input.employee,
	});
	const availableDays = slotDays
		.filter((d) => d.slots && d.slots.length > 0)
		.map((d) => ({ date: d.date, status: d.status, times: d.slots.map((s) => s.time) }));
	const totalSlots = availableDays.reduce((n, d) => n + d.times.length, 0);
	return {
		raw: slotDays,
		company,
		result: {
			company: { id, name: company ? companyName(company) : null },
			range: { from: startDate, to: endDate },
			service_ids: eventTypeIds ?? null,
			available_days: availableDays.length,
			total_slots: totalSlots,
			days: availableDays,
		},
	};
}

// --- account ----------------------------------------------------------------

export async function whoami(client: NoonaClient) {
	const u: MarketplaceUser = await client.getUser();
	return {
		raw: u,
		result: {
			id: u.id ?? null,
			name: u.name ?? null,
			phone: u.phone_number ? `+${u.phone_country_code ?? ""} ${u.phone_number}`.trim() : null,
			phone_verified: u.phone_number_verified ?? null,
			email: u.email ?? null,
			kennitala: u.kennitala ?? null,
			favorite_companies: u.favorite_companies?.length ?? 0,
		},
	};
}

export function companyLabel(c: Company | string | undefined): string | null {
	if (!c) return null;
	if (typeof c === "string") return c;
	return companyName(c);
}

export function serviceLabels(ets: (EventType | string)[] | undefined): string[] {
	if (!ets) return [];
	return ets.map((e) => (typeof e === "string" ? e : (e.title ?? e.id))).filter(Boolean);
}

export async function listBookings(client: NoonaClient) {
	const events = await client.listEvents();
	const rows = events.map((e) => ({
		id: e.id,
		starts_at: e.starts_at ?? null,
		ends_at: e.ends_at ?? null,
		status: e.status ?? null,
		confirmed: e.confirmed ?? null,
		company: companyLabel(e.company),
		services: serviceLabels(e.event_types),
	}));
	return { raw: events, result: { returned: rows.length, bookings: rows } };
}

// --- book -------------------------------------------------------------------

export interface BookInput {
	company: string;
	service: string;
	/** Wall-clock "YYYY-MM-DDTHH:MM" in the business's timezone, or an ISO instant with offset. */
	at: string;
	employee?: string;
	guests?: number;
	name?: string;
	email?: string;
	phone?: string;
	cc?: string;
	comment?: string;
}

export interface BookingPlan {
	companyId: string;
	timeZone?: string;
	service: EventType;
	startsAt: string;
	endsAt: string;
	employee?: string;
	guests?: number;
	comment?: string;
	customer: {
		customer_name?: string;
		ssn?: string;
		license_plate?: string;
		email?: string;
		phone_number?: string;
		phone_country_code?: string;
	};
	/** Human/agent-facing summary of what will be booked. */
	summary: {
		company: { id: string; name: string | null };
		service: { id: string; title: string | null; minutes: number };
		starts_at: string;
		ends_at: string;
		time_zone: string | null;
		employee: string | null;
		guests: number | null;
		customer_name: string | null;
	};
}

/** Resolve company + service and compute the booking times. No writes. */
export async function planBooking(
	authed: NoonaClient,
	pub: NoonaClient,
	input: BookInput,
): Promise<BookingPlan> {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.at)) {
		throw new UsageError(`Invalid time "${input.at}". Use YYYY-MM-DDTHH:MM.`);
	}
	const { id: companyId, company } = await resolveCompany(pub, input.company);
	const tz = company?.connections?.location?.time_zone;

	const eventTypes = await pub.listEventTypes(companyId);
	const svc = eventTypes.find((e) => e.id === input.service);
	if (!svc) throw new UsageError(`Service ${input.service} not found for this company.`);
	if (svc.minutes == null) throw new Error("Service has no duration; booking it is not supported.");

	const startsAt = toInstantISO(input.at, tz);
	if (Number.isNaN(Date.parse(startsAt))) throw new UsageError(`Invalid time "${input.at}".`);
	const endsAt = addMinutesISO(startsAt, svc.minutes);

	// Customer identity: explicit input wins, else fall back to the logged-in profile.
	const me = await authed.getUser().catch(() => null);
	const customer = {
		customer_name: input.name ?? me?.name,
		ssn: me?.kennitala,
		license_plate: me?.license_plate,
		email: input.email ?? me?.email,
		phone_number: input.phone ?? me?.phone_number,
		phone_country_code: input.cc ?? me?.phone_country_code,
	};

	return {
		companyId,
		timeZone: tz,
		service: svc,
		startsAt,
		endsAt,
		employee: input.employee,
		guests: input.guests,
		comment: input.comment,
		customer,
		summary: {
			company: { id: companyId, name: company ? companyName(company) : null },
			service: { id: svc.id, title: svc.title ?? null, minutes: svc.minutes },
			starts_at: startsAt,
			ends_at: endsAt,
			time_zone: tz ?? null,
			employee: input.employee ?? null,
			guests: input.guests ?? null,
			customer_name: customer.customer_name ?? null,
		},
	};
}

/** Hold the slot (POST /time_slot_reservations), then confirm it (POST /events). */
export async function executeBooking(
	client: NoonaClient,
	plan: BookingPlan,
): Promise<{ reservation: TimeSlotReservation; event: Event; result: Record<string, unknown> }> {
	const reservation = await client.createReservation({
		company: plan.companyId,
		event_types: [plan.service.id],
		starts_at: plan.startsAt,
		ends_at: plan.endsAt,
		employee: plan.employee,
		number_of_guests: plan.guests,
		time_zone: plan.timeZone,
	});

	const event = await client.createEvent({
		time_slot_reservation: reservation.id,
		company: plan.companyId,
		event_types: [{ id: plan.service.id }],
		starts_at: plan.startsAt,
		ends_at: plan.endsAt,
		employee: plan.employee,
		...plan.customer,
		comment: plan.comment,
		number_of_guests: plan.guests,
	});

	return {
		reservation,
		event,
		result: {
			booked: true,
			event_id: event.id,
			status: event.status ?? null,
			confirmed: event.confirmed ?? null,
			starts_at: event.starts_at ?? plan.startsAt,
			ends_at: event.ends_at ?? plan.endsAt,
			company: plan.summary.company,
			service: plan.summary.service,
		},
	};
}

// --- cancel -----------------------------------------------------------------

/**
 * Cancel a booking. The cancel POST echoes the event but not always a usable
 * `status`, so success isn't gated on it: a 2xx means accepted, and we confirm
 * by checking that the booking dropped off the active list.
 */
export async function cancelBooking(client: NoonaClient, eventId: string, reason?: string) {
	const updated = await client.cancelEvent(eventId, reason);
	let verifiedRemoved: boolean | null = null;
	try {
		const active = await client.listEvents();
		verifiedRemoved = !active.some((e) => e.id === eventId);
	} catch {
		verifiedRemoved = null; // verification call failed; fall back to the accepted POST
	}
	const cancelled = updated.status === "cancelled" || verifiedRemoved !== false;
	return {
		raw: { event: updated, verified_removed: verifiedRemoved },
		result: {
			cancelled,
			event_id: updated.id ?? eventId,
			status: updated.status ?? null,
			verified_removed: verifiedRemoved,
		},
	};
}
