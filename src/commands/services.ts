// noona services <company> — list bookable services (event types) for a business.
// <company> is a url_name (the noona.is slug) or a company id. Public.

import { companyName, lowestPrice } from "../lib/api.ts";
import { minutes, money } from "../lib/format.ts";
import { color, die, isJsonMode, printJson } from "../lib/output.ts";
import { resolveCompany } from "../lib/resolve.ts";
import { publicClient } from "../lib/session.ts";

interface ServicesFlags {
	company?: string;
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
}

export async function servicesCommand(flags: ServicesFlags): Promise<void> {
	const json = isJsonMode(flags);
	if (!flags.company) die("Usage: noona services <url_name|company_id>", 64, json);

	const client = publicClient();
	const { id, company } = await resolveCompany(client, flags.company);
	const eventTypes = await client.listEventTypes(id);

	if (flags.raw) return printJson(eventTypes);

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

	if (json) {
		return printJson({
			company: { id, name: company ? companyName(company) : null },
			returned: rows.length,
			services: rows,
		});
	}
	if (company) console.log(color.bold(companyName(company)));
	if (rows.length === 0) {
		console.log(color.dim("No services listed."));
		return;
	}
	for (const s of rows) {
		const price = s.price_from != null ? money(s.price_from, s.currency ?? "ISK") : "—";
		console.log(
			`${color.bold(s.title ?? "(untitled)")}  ${color.dim(minutes(s.minutes))}  ${price}`,
		);
		console.log(`  ${color.dim("id:")} ${s.id}`);
	}
	console.log(color.dim("\nNext: `noona slots <company> --service <service_id>`"));
}
