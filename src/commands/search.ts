// noona search — find businesses on the marketplace. Public (no auth).

import { companyName } from "../lib/api.ts";
import { color, die, isJsonMode, printJson } from "../lib/output.ts";
import { publicClient } from "../lib/session.ts";

interface SearchFlags {
	query?: string;
	lat?: string;
	lng?: string;
	radius?: string;
	type?: string;
	sort?: string;
	limit?: string;
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
}

function num(v: string | undefined, name: string, json: boolean): number | undefined {
	if (v === undefined) return undefined;
	const n = Number.parseFloat(v);
	if (!Number.isFinite(n)) die(`Invalid --${name}: ${v}`, 64, json);
	return n;
}

export async function searchCommand(flags: SearchFlags): Promise<void> {
	const json = isJsonMode(flags);
	const client = publicClient();
	const limit = flags.limit ? Math.max(1, Number.parseInt(flags.limit, 10)) : 20;

	const sort = flags.sort;
	if (sort && sort !== "popular" && sort !== "distance") {
		die("--sort must be 'popular' or 'distance'.", 64, json);
	}

	const companies = await client.listCompanies({
		search: flags.query,
		limit,
		lat: num(flags.lat, "lat", json),
		lng: num(flags.lng, "lng", json),
		radius: num(flags.radius, "radius", json),
		companyTypeId: flags.type,
		sortBy: sort as "popular" | "distance" | undefined,
	});

	if (flags.raw) return printJson(companies);

	const rows = companies.slice(0, limit).map((c) => ({
		id: c.id,
		name: companyName(c),
		url_name: c.connections?.url_name ?? null,
		vertical: c.vertical ?? null,
		address: c.connections?.location?.formatted_address ?? null,
		types: (c.profile?.company_types ?? []).map((t) => t.name).filter(Boolean),
	}));

	if (json) {
		return printJson({ query: flags.query ?? null, returned: rows.length, companies: rows });
	}
	if (rows.length === 0) {
		console.log(color.dim("No businesses found."));
		return;
	}
	for (const c of rows) {
		console.log(`${color.bold(c.name)}  ${color.dim(c.vertical ?? "")}`);
		if (c.address) console.log(`  ${color.dim(c.address)}`);
		console.log(`  ${color.dim("url_name:")} ${c.url_name ?? "—"}  ${color.dim("id:")} ${c.id}`);
	}
	console.log(color.dim(`\n${rows.length} shown — use \`noona services <url_name|id>\` next.`));
}
