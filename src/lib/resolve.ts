// Resolve a company reference (url_name slug OR raw id) to a company id.
//
// The Marketplace API only exposes get-company by url_name, while event_types /
// time_slots take the id. So: try to fetch by url_name; if that 404s, assume the
// caller already gave us an id and use it directly.

import { ApiError, type NoonaClient } from "./api.ts";
import type { Company } from "./types.ts";

export async function resolveCompany(
	client: NoonaClient,
	ref: string,
): Promise<{ id: string; company?: Company }> {
	try {
		const company = await client.getCompany(ref);
		return { id: company.id ?? ref, company };
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) return { id: ref };
		throw e;
	}
}
