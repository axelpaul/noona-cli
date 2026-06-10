// Pure formatting helpers. Kept side-effect free so they're easy to unit test.

/** Format a number as money with a currency code, e.g. (1256, "ISK") → "1,256 ISK". */
export function money(amount: number | undefined | null, currency = "ISK"): string {
	if (amount == null || !Number.isFinite(amount)) return "—";
	const decimals = currency === "ISK" || currency === "JPY" ? 0 : 2;
	const n = amount.toLocaleString("en-US", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
	return `${n} ${currency}`;
}

/** A duration in minutes as "1h 30m" / "45m". */
export function minutes(m: number | undefined | null): string {
	if (m == null || !Number.isFinite(m)) return "—";
	const h = Math.floor(m / 60);
	const r = m % 60;
	if (h > 0) return r > 0 ? `${h}h ${r}m` : `${h}h`;
	return `${r}m`;
}

/** Render an ISO/parseable timestamp as "YYYY-MM-DD HH:MM" (local), or "—". */
export function dateTime(s: string | undefined | null): string {
	if (!s) return "—";
	const t = Date.parse(s);
	if (!Number.isFinite(t)) return s;
	const d = new Date(t);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Just the date portion: "YYYY-MM-DD". */
export function dateOnly(s: string | undefined | null): string {
	const dt = dateTime(s);
	return dt === "—" ? dt : dt.slice(0, 10);
}

/** Today's date as YYYY-MM-DD (local). */
export function today(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Add `days` to a YYYY-MM-DD string and return YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00`);
	d.setDate(d.getDate() + days);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Offset (minutes) of an IANA timezone at a given instant. */
function tzOffsetMinutes(timeZone: string, at: Date): number {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const p: Record<string, number> = {};
	for (const part of dtf.formatToParts(at)) {
		if (part.type !== "literal") p[part.type] = Number(part.value);
	}
	const asTz = Date.UTC(
		p.year ?? 1970,
		(p.month ?? 1) - 1,
		p.day ?? 1,
		p.hour ?? 0,
		p.minute ?? 0,
		p.second ?? 0,
	);
	return Math.round((asTz - at.getTime()) / 60000);
}

/**
 * Turn a wall-clock time into an absolute ISO instant.
 * - If `wall` already carries a zone (`Z` or `±HH:MM`), it's returned as-is (normalized).
 * - Otherwise it's interpreted in `timeZone` (IANA), or local time if none is given.
 * `wall` is "YYYY-MM-DDTHH:MM" (seconds optional).
 */
export function toInstantISO(wall: string, timeZone?: string): string {
	if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(wall)) return new Date(wall).toISOString();
	if (!timeZone) return new Date(wall).toISOString();
	const [datePart = "", timePart = "00:00"] = wall.split("T");
	const [y = 1970, mo = 1, d = 1] = datePart.split("-").map(Number);
	const [h = 0, mi = 0, s = 0] = timePart.split(":").map(Number);
	const guessUTC = Date.UTC(y, mo - 1, d, h, mi, s);
	const offset = tzOffsetMinutes(timeZone, new Date(guessUTC));
	return new Date(guessUTC - offset * 60000).toISOString();
}

/** Add `mins` minutes to an ISO instant, returning ISO. */
export function addMinutesISO(iso: string, mins: number): string {
	return new Date(Date.parse(iso) + mins * 60000).toISOString();
}
