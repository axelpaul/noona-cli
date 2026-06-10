// noona cancel <event_id> — cancel a booking. Mutating; confirms unless --yes. Auth.

import { dateTime } from "../lib/format.ts";
import { color, die, isJsonMode, printJson } from "../lib/output.ts";
import { confirm } from "../lib/prompt.ts";
import { authedClient } from "../lib/session.ts";

interface CancelFlags {
	id?: string;
	reason?: string;
	yes?: boolean;
	json?: boolean;
	pretty?: boolean;
	raw?: boolean;
}

export async function cancelCommand(flags: CancelFlags): Promise<void> {
	const json = isJsonMode(flags);
	if (!flags.id) die("Usage: noona cancel <event_id> [--reason <text>] [--yes]", 64, json);

	const client = authedClient(json);
	const ev = await client.getEvent(flags.id).catch(() => null);
	if (!ev) die(`No booking with id ${flags.id}.`, 1, json);
	if (ev.status === "cancelled") {
		if (json) return printJson({ cancelled: true, event_id: ev.id, already: true });
		console.log(color.yellow("Already cancelled."));
		return;
	}

	if (!flags.yes) {
		if (json) die("Refusing to cancel without --yes in non-interactive mode.", 3, true);
		console.log(`About to cancel ${color.bold(ev.id)} — ${dateTime(ev.starts_at)}`);
		const ok = await confirm("Cancel this booking?", false);
		if (!ok) {
			console.log(color.yellow("Left as-is."));
			return;
		}
	}

	const updated = await client.cancelEvent(flags.id, flags.reason);
	if (flags.raw) return printJson(updated);
	const out = {
		cancelled: updated.status === "cancelled",
		event_id: updated.id,
		status: updated.status ?? null,
	};
	if (json) return printJson(out);
	console.log(color.green(`✓ Cancelled ${out.event_id} (status: ${out.status ?? "—"}).`));
}
