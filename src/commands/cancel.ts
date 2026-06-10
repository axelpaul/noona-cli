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

	// The cancel POST returns the event but not always a usable `status`, so we
	// don't gate success on it (that produced false "cancelled: false" reports).
	// A 2xx (no throw) means the cancellation was accepted; confirm it
	// authoritatively by checking the booking dropped off the active list.
	let verifiedRemoved: boolean | null = null;
	try {
		const active = await client.listEvents();
		verifiedRemoved = !active.some((e) => e.id === flags.id);
	} catch {
		verifiedRemoved = null; // verification call failed — fall back to the accepted POST
	}
	const cancelled = updated.status === "cancelled" || verifiedRemoved !== false;

	if (flags.raw) return printJson({ event: updated, verified_removed: verifiedRemoved });
	const out = {
		cancelled,
		event_id: updated.id ?? flags.id,
		status: updated.status ?? null,
		verified_removed: verifiedRemoved,
	};
	if (json) return printJson(out);
	if (cancelled) {
		console.log(color.green(`✓ Cancelled ${out.event_id}.`));
	} else {
		console.log(
			color.yellow(
				`Cancel request sent for ${out.event_id}, but it still shows in your bookings — re-check with \`noona bookings\`.`,
			),
		);
	}
}
