// Types for the Noona Marketplace API (https://api.noona.is).
//
// Modeled from the official OpenAPI spec (reference/marketplace-openapi.yaml)
// plus live responses. Marketplace objects are deeply nested and many fields are
// optional; we type only what the CLI reads, and keep `[k: string]: unknown` so
// `--raw` always has the full payload.

export interface AuthState {
	/** JWT token sent as the raw `Authorization` header value (no "Bearer " prefix). */
	token: string;
	loggedInAt: string;
	user?: {
		id?: string;
		name?: string;
		phone?: string;
	};
}

export interface UserConfig {
	baseUrl?: string;
	/** Default phone country code for `login` (e.g. "354"). */
	phoneCountryCode?: string;
}

// --- Marketplace user -------------------------------------------------------

export interface MarketplaceUser {
	id?: string;
	name?: string;
	phone_number?: string;
	phone_country_code?: string;
	phone_number_verified?: boolean;
	kennitala?: string;
	email?: string;
	favorite_companies?: string[];
	[k: string]: unknown;
}

// --- Companies --------------------------------------------------------------

export interface CompanyLocation {
	formatted_address?: string;
	time_zone?: string;
	lat_lng?: { lat?: number; lng?: number };
	country?: { long_name?: string; short_name?: string };
}

export interface CompanyProfile {
	store_name?: string;
	image?: string;
	phone_number?: string;
	phone_country_code?: string;
	company_types?: { id?: string; name?: string }[];
	[k: string]: unknown;
}

export interface CompanyConnections {
	url_name?: string;
	location?: CompanyLocation;
	contact_email?: string;
	opening_hours?: unknown;
	waitlist_enabled?: boolean;
	[k: string]: unknown;
}

export interface Company {
	id: string;
	vertical?: string;
	profile?: CompanyProfile;
	connections?: CompanyConnections;
	capabilities?: Record<string, unknown>;
	enterprise_id?: string;
	[k: string]: unknown;
}

// --- Event types (bookable services) ---------------------------------------

export interface PriceRange {
	from?: number;
	to?: number;
	currency?: string;
	[k: string]: unknown;
}

export interface EventType {
	id: string;
	title?: string;
	minutes?: number;
	company_id?: string;
	price_ranges?: PriceRange[];
	variations?: unknown[];
	connections?: Record<string, unknown>;
	[k: string]: unknown;
}

// --- Employees --------------------------------------------------------------

export interface Employee {
	id: string;
	name?: string;
	[k: string]: unknown;
}

// --- Availability -----------------------------------------------------------

export interface TimeSlot {
	time: string; // "HH:MM"
	employeeIds?: string[];
	spaceIds?: string[];
}

export interface TimeSlotDay {
	date: string; // "YYYY-MM-DD"
	status: string; // "available" | "not_available" | ...
	slots: TimeSlot[];
}

// --- Bookings (events) ------------------------------------------------------

export interface Event {
	id: string;
	starts_at?: string;
	ends_at?: string;
	status?: string;
	confirmed?: boolean;
	customer_name?: string;
	email?: string;
	phone_number?: string;
	phone_country_code?: string;
	comment?: string;
	company?: Company | string;
	event_types?: (EventType | string)[];
	employee?: Employee | string;
	[k: string]: unknown;
}

export interface TimeSlotReservation {
	id: string;
	starts_at?: string;
	ends_at?: string;
	time_zone?: string;
	[k: string]: unknown;
}
