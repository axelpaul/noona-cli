// NoonaClient — typed wrapper around the Noona Marketplace API.
//
// Built from the official OpenAPI spec (reference/marketplace-openapi.yaml).
// Base URL: https://api.noona.is
//
// Auth: a JWT bearer token in `Authorization: Bearer <token>` (scheme
// "Marketplace-Authentication"). Discovery/availability reads are PUBLIC and
// need no token; only user-account reads and writes (the user profile, creating
// a reservation/booking, payments, vouchers) require it.
//
// Getting a token (two documented paths):
//   1. Phone OTP:  POST /v1/marketplace/user/verify_phone_number  → SMS code
//                  POST /v1/marketplace/user/verified             → user (+ token)
//   2. Social:     POST /v1/marketplace/user/login  {provider, id_token}
//
// NOTE: the spec documents the user object in the verified/login *body* but not
// where the JWT is delivered. We extract it defensively from response headers,
// Set-Cookie, and common body fields. If your account's flow differs, capture
// the token once and pass it via `noona login --token <jwt>` or $NOONA_TOKEN.

import type {
	Company,
	Employee,
	Event,
	EventType,
	MarketplaceUser,
	TimeSlotDay,
	TimeSlotReservation,
} from "./types.ts";

export const DEFAULT_TIMEOUT_MS = 30_000;
const PROD_BASE = "https://api.noona.is";

/** Base URL: $NOONA_BASE_URL wins, else the stored config value, else production. */
export function defaultBaseUrl(configBase?: string): string {
	return (process.env.NOONA_BASE_URL || configBase || PROD_BASE).replace(/\/$/, "");
}

// Identify as the Noona mobile client. The API accepts arbitrary UAs today, but
// matching the app keeps us off any future WAF heuristics.
export const USER_AGENT = "Noona/iOS marketplace noona-cli";

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public body?: unknown,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export class AuthError extends ApiError {
	constructor(message = "Authentication required") {
		super(message, 401);
		this.name = "AuthError";
	}
}

export interface NoonaClientOptions {
	baseUrl?: string;
	token?: string;
	timeoutMs?: number;
}

export interface LoginResult {
	user: MarketplaceUser;
	token?: string;
	/** Where we found the token, for diagnostics: "body" | "header:..." | "cookie" | undefined. */
	tokenSource?: string;
}

export interface CompanySearch {
	search?: string;
	limit?: number;
	skip?: number;
	lat?: number;
	lng?: number;
	radius?: number;
	companyTypeId?: string;
	sortBy?: "popular" | "distance";
}

export interface TimeSlotQuery {
	startDate: string; // YYYY-MM-DD
	endDate: string; // YYYY-MM-DD
	eventTypeIds?: string[];
	employeeId?: string;
	capacity?: number;
}

export class NoonaClient {
	private baseUrl: string;
	private token: string | undefined;
	private timeoutMs: number;

	constructor(opts: NoonaClientOptions = {}) {
		this.baseUrl = (opts.baseUrl ?? defaultBaseUrl()).replace(/\/$/, "");
		this.token = opts.token;
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	hasToken(): boolean {
		return Boolean(this.token);
	}

	// --- low-level HTTP -----------------------------------------------------

	private headers(extra: Record<string, string> = {}): Record<string, string> {
		const h: Record<string, string> = {
			Accept: "application/json",
			"User-Agent": USER_AGENT,
			...extra,
		};
		if (this.token) h.Authorization = `Bearer ${this.token}`;
		return h;
	}

	private async raw(
		method: string,
		path: string,
		opts: { body?: string; headers?: Record<string, string> } = {},
	): Promise<Response> {
		const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
		const signal = this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined;
		return fetch(url, {
			method,
			headers: this.headers(opts.headers),
			body: opts.body,
			redirect: "follow",
			signal,
		});
	}

	private async parse<T>(res: Response, method: string, path: string): Promise<T> {
		const text = await res.text();
		let parsed: unknown;
		if (text.length > 0) {
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = text;
			}
		}
		if (!res.ok) {
			if (res.status === 401 || res.status === 403) {
				throw new AuthError(`${method} ${path}: ${res.status} ${truncate(text, 200)}`);
			}
			const apiMsg =
				parsed && typeof parsed === "object" && "message" in parsed
					? String((parsed as { message: unknown }).message)
					: truncate(text, 200);
			throw new ApiError(`${method} ${path}: ${res.status} ${apiMsg}`, res.status, parsed);
		}
		return parsed as T;
	}

	private get<T>(path: string): Promise<T> {
		return this.raw("GET", path).then((r) => this.parse<T>(r, "GET", path));
	}

	private post<T>(path: string, body?: unknown): Promise<T> {
		return this.raw("POST", path, {
			headers: body !== undefined ? { "Content-Type": "application/json" } : {},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		}).then((r) => this.parse<T>(r, "POST", path));
	}

	private del<T>(path: string): Promise<T> {
		return this.raw("DELETE", path).then((r) => this.parse<T>(r, "DELETE", path));
	}

	// --- auth ---------------------------------------------------------------

	/** Step 1 of phone login: request an SMS code. Public. */
	requestPhoneCode(phoneNumber: string, countryCode: string): Promise<{ next_retry_at?: string }> {
		return this.post("/v1/marketplace/user/verify_phone_number", {
			phone_number: phoneNumber,
			phone_country_code: countryCode,
		});
	}

	/** Step 2 of phone login: submit the SMS code. Returns the user and, if we
	 * can find it, the bearer token (from body or response headers/cookies). */
	async verifyPhoneCode(
		phoneNumber: string,
		countryCode: string,
		code: string,
	): Promise<LoginResult> {
		const res = await this.raw("POST", "/v1/marketplace/user/verified", {
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				phone_number: phoneNumber,
				phone_country_code: countryCode,
				verification_code: code,
			}),
		});
		const user = await this.parse<MarketplaceUser>(res, "POST", "/v1/marketplace/user/verified");
		const found = extractToken(res, user);
		if (found.token) this.token = found.token;
		return { user, token: found.token, tokenSource: found.source };
	}

	/** Apple/Google sign-in: exchange a provider ID token for a Noona session. */
	async socialLogin(
		provider: "google" | "apple",
		idToken: string,
		name?: string,
	): Promise<LoginResult> {
		const res = await this.raw("POST", "/v1/marketplace/user/login", {
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ provider, id_token: idToken, name }),
		});
		const user = await this.parse<MarketplaceUser>(res, "POST", "/v1/marketplace/user/login");
		const found = extractToken(res, user);
		if (found.token) this.token = found.token;
		return { user, token: found.token, tokenSource: found.source };
	}

	getUser(): Promise<MarketplaceUser> {
		return this.get<MarketplaceUser>("/v1/marketplace/user");
	}

	// --- discovery (public) -------------------------------------------------

	listCompanies(q: CompanySearch = {}): Promise<Company[]> {
		const p = new URLSearchParams();
		if (q.search) p.set("search", q.search);
		if (q.limit != null) p.set("limit", String(q.limit));
		if (q.skip != null) p.set("skip", String(q.skip));
		if (q.lat != null) p.set("lat", String(q.lat));
		if (q.lng != null) p.set("lng", String(q.lng));
		if (q.radius != null) p.set("radius", String(q.radius));
		if (q.companyTypeId) p.set("company_type_id", q.companyTypeId);
		if (q.sortBy) p.set("sort_by", q.sortBy);
		const qs = p.toString();
		return this.get<Company[]>(`/v1/marketplace/companies${qs ? `?${qs}` : ""}`);
	}

	/** Retrieve a single company by its url_name (the slug in noona.is/<url_name>). */
	getCompany(urlName: string): Promise<Company> {
		return this.get<Company>(`/v1/marketplace/companies/${encodeURIComponent(urlName)}`);
	}

	listEventTypes(companyId: string): Promise<EventType[]> {
		return this.get<EventType[]>(
			`/v1/marketplace/companies/${encodeURIComponent(companyId)}/event_types`,
		);
	}

	listEmployees(companyId: string): Promise<Employee[]> {
		return this.get<Employee[]>(
			`/v1/marketplace/companies/${encodeURIComponent(companyId)}/employees`,
		);
	}

	getTimeSlots(companyId: string, q: TimeSlotQuery): Promise<TimeSlotDay[]> {
		const p = new URLSearchParams({ start_date: q.startDate, end_date: q.endDate });
		if (q.eventTypeIds?.length) p.set("event_type_ids", q.eventTypeIds.join(","));
		if (q.employeeId) p.set("employee_id", q.employeeId);
		if (q.capacity != null) p.set("capacity", String(q.capacity));
		return this.get<TimeSlotDay[]>(
			`/v1/marketplace/companies/${encodeURIComponent(companyId)}/time_slots?${p.toString()}`,
		);
	}

	// --- booking (auth) -----------------------------------------------------

	/** Hold a slot. company/event_types/employee accept Noona "expandable" refs —
	 * a bare id string is enough. Returns the reservation (its id feeds createEvent). */
	createReservation(body: {
		company: string;
		event_types: string[];
		starts_at: string;
		ends_at: string;
		employee?: string;
		number_of_guests?: number;
		time_zone?: string;
	}): Promise<TimeSlotReservation> {
		return this.post<TimeSlotReservation>("/v1/marketplace/time_slot_reservations", body);
	}

	/** Confirm a booking against a held reservation. */
	createEvent(body: {
		time_slot_reservation: string;
		company: string;
		event_types: string[];
		starts_at: string;
		ends_at: string;
		employee?: string;
		customer_name?: string;
		email?: string;
		phone_number?: string;
		phone_country_code?: string;
		comment?: string;
		number_of_guests?: number;
	}): Promise<Event> {
		return this.post<Event>("/v1/marketplace/events", body);
	}

	listEvents(): Promise<Event[]> {
		return this.get<Event[]>("/v1/marketplace/events");
	}

	getEvent(eventId: string): Promise<Event> {
		return this.get<Event>(`/v1/marketplace/events/${encodeURIComponent(eventId)}`);
	}

	/** Update an event (POST, not PUT, per the spec). Used to cancel. */
	updateEvent(eventId: string, body: Record<string, unknown>): Promise<Event> {
		return this.post<Event>(`/v1/marketplace/events/${encodeURIComponent(eventId)}`, body);
	}

	cancelEvent(eventId: string, reason?: string): Promise<Event> {
		return this.updateEvent(eventId, {
			status: "cancelled",
			...(reason ? { cancel_reason: reason } : {}),
		});
	}

	deleteReservation(id: string): Promise<unknown> {
		return this.del(`/v1/marketplace/time_slot_reservations/${encodeURIComponent(id)}`);
	}
}

// --- helpers ----------------------------------------------------------------

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n)}…` : s;
}

const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

/** Find a JWT in the login response: headers first, then Set-Cookie, then body. */
function extractToken(res: Response, body: unknown): { token?: string; source?: string } {
	for (const h of ["authorization", "x-auth-token", "x-access-token", "token"]) {
		const v = res.headers.get(h);
		if (v) {
			const m = v.match(JWT_RE);
			if (m) return { token: m[0], source: `header:${h}` };
		}
	}
	const cookie = res.headers.get("set-cookie");
	if (cookie) {
		const m = cookie.match(JWT_RE);
		if (m) return { token: m[0], source: "cookie" };
	}
	if (body && typeof body === "object") {
		for (const key of ["token", "access_token", "jwt", "auth_token", "id_token"]) {
			const v = (body as Record<string, unknown>)[key];
			if (typeof v === "string" && v) return { token: v, source: `body:${key}` };
		}
	}
	return {};
}

/** Best-effort display name for a company. */
export function companyName(c: Company): string {
	return c.profile?.store_name?.trim() || c.connections?.url_name || c.id;
}

/** Lowest "from" price across an event type's price ranges, if any. */
export function lowestPrice(et: EventType): { amount?: number; currency?: string } {
	const ranges = et.price_ranges ?? [];
	let best: { amount?: number; currency?: string } = {};
	for (const r of ranges) {
		if (r.from != null && (best.amount == null || r.from < best.amount)) {
			best = { amount: r.from, currency: r.currency };
		}
	}
	return best;
}
