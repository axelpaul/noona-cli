// noona whoami — show the logged-in marketplace user.

import { color, isJsonMode, printJson } from "../lib/output.ts";
import { authedClient } from "../lib/session.ts";

export async function whoamiCommand(flags: {
	raw?: boolean;
	json?: boolean;
	pretty?: boolean;
}): Promise<void> {
	const json = isJsonMode(flags);
	const client = authedClient(json);
	const u = await client.getUser();

	if (flags.raw) return printJson(u);

	const out = {
		id: u.id ?? null,
		name: u.name ?? null,
		phone: u.phone_number ? `+${u.phone_country_code ?? ""} ${u.phone_number}`.trim() : null,
		phone_verified: u.phone_number_verified ?? null,
		email: u.email ?? null,
		kennitala: u.kennitala ?? null,
		favorite_companies: u.favorite_companies?.length ?? 0,
	};

	if (json) return printJson(out);
	console.log(color.bold(out.name ?? out.phone ?? out.id ?? "Noona user"));
	if (out.phone) console.log(`  ${color.dim("phone")}    ${out.phone}`);
	if (out.email) console.log(`  ${color.dim("email")}    ${out.email}`);
	if (out.kennitala) console.log(`  ${color.dim("kennitala")} ${out.kennitala}`);
	console.log(`  ${color.dim("favorites")} ${out.favorite_companies}`);
}
