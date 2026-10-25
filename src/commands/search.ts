// noona search — find businesses on the marketplace. Public (no auth).

import { searchBusinesses } from "../lib/ops.ts";
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
	const limit = flags.limit ? Math.max(1, Number.parseInt(flags.limit, 10)) : 20;

	const sort = flags.sort;
	if (sort && sort !== "popular" && sort !== "distance") {
		die("--sort must be 'popular' or 'distance'.", 64, json);
	}

	const { raw, result } = await searchBusinesses(publicClient(), {
		query: flags.query,
		limit,
		lat: num(flags.lat, "lat", json),
		lng: num(flags.lng, "lng", json),
		radius: num(flags.radius, "radius", json),
		type: flags.type,
		sort: sort as "popular" | "distance" | undefined,
	});

	if (flags.raw) return printJson(raw);
	if (json) return printJson(result);

	const rows = result.companies;
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
