// noona whoami — show the logged-in marketplace user.

import { whoami } from "../lib/ops.ts";
import { color, isJsonMode, printJson } from "../lib/output.ts";
import { authedClient } from "../lib/session.ts";

export async function whoamiCommand(flags: {
	raw?: boolean;
	json?: boolean;
	pretty?: boolean;
}): Promise<void> {
	const json = isJsonMode(flags);
	const { raw, result: out } = await whoami(authedClient(json));

	if (flags.raw) return printJson(raw);
	if (json) return printJson(out);
	console.log(color.bold(out.name ?? out.phone ?? out.id ?? "Noona user"));
	if (out.phone) console.log(`  ${color.dim("phone")}    ${out.phone}`);
	if (out.email) console.log(`  ${color.dim("email")}    ${out.email}`);
	if (out.kennitala) console.log(`  ${color.dim("kennitala")} ${out.kennitala}`);
	console.log(`  ${color.dim("favorites")} ${out.favorite_companies}`);
}
