# Noona API Recon — Findings

**Goal:** build a CLI an agent can use to interact with Noona (Icelandic booking service).
**Date:** 2026-06-10

## TL;DR

We do **not** need to decompile the app. Noona publishes **official, documented REST APIs** with
downloadable OpenAPI specs. The customer-facing **Marketplace API** is exactly what an agent CLI
needs (search businesses → pick a service → find open slots → reserve → book). Discovery/availability
endpoints work with **no authentication at all** (verified live). Only writes that belong to a user
account (creating a booking, payments, vouchers, the user profile) require a per-user **JWT bearer
token**, obtained via phone-number SMS OTP or Apple/Google sign-in.

**Verdict: highly feasible, and much cleaner than reversing the app.**

## API surface

| API | Base | Endpoints | Audience | Auth |
|-----|------|-----------|----------|------|
| Marketplace | `https://api.noona.is` | 79 | Customers booking services (our target) | JWT bearer in `Authorization` header; many reads are public |
| HQ | `https://api.noona.is` | 308 | Businesses managing their calendar | Basic (email/pw), Bearer, OAuth2 auth-code, **AgentTokenAuth** |

- Specs saved in `reference/marketplace-openapi.yaml` and `reference/hq-openapi.yaml`.
- Live spec URLs: `https://api.noona.is/marketplace/spec.yaml`, `https://api.noona.is/hq/spec.yaml`
- Docs: `https://docs.noona.is/docs/marketplace`, `https://docs.noona.is/docs/hq`

## Authentication (Marketplace)

Header: `Authorization: <jwt>` — the raw JWT as the header value, **not** prefixed
with `Bearer ` (scheme `Marketplace-Authentication`). *(Verified against a live
login: the `Bearer ` prefix is rejected.)*

Two ways to get the JWT:
1. **Phone OTP (best for a CLI — no Google/Apple needed):**
   - `POST /v1/marketplace/user/verify_phone_number` `{phone_number, phone_country_code, dispatch_id}` → sends SMS, returns `{next_retry_at}`. `dispatch_id` is a client-generated UUID and is **required** for the SMS to dispatch. *(public)*
   - `POST /v1/marketplace/user/verified` `{phone_number, phone_country_code, verification_code}` → creates/verifies the user. *(public)*
2. **Social login:** `POST /v1/marketplace/user/login` `{provider: google|apple, id_token, name}`.

> ✅ Verified live (phone OTP, real account): the JWT comes back in the `verified` response, and
> `verify_phone_number` **requires** a client-generated `dispatch_id` (UUID) for the SMS to send.
> The token is sent as the **raw** `Authorization` header value — a `Bearer ` prefix is rejected.

## Booking flow (Marketplace) — the CLI's core commands

```
1. Find business     GET  /v1/marketplace/companies            (search; public)
                      GET  /v1/marketplace/companies/{url_name} (detail; public)
2. List services     GET  /v1/marketplace/companies/{id}/event_types   (public)
   (event_type = a bookable service: duration, price, employees)
3. Find open slots   GET  /v1/marketplace/companies/{id}/time_slots
                          ?start_date=&end_date=&event_type_ids=&employee_id=   (public)
                      GET  /v1/marketplace/speedy_slots   (cross-company "soonest" search; auth)
4. Hold a slot       POST /v1/marketplace/time_slot_reservations   (auth)
5. Confirm booking   POST /v1/marketplace/events                   (auth)
6. Manage            GET/POST /v1/marketplace/events/{event_id}    (view / reschedule / cancel; auth)
```

**Verified live (full round-trip on a real account):** search → services → `time_slots`
(`{date, slots:[{time, employeeIds, spaceIds}], status}`) → reserve → **booked** → appeared in
`bookings` → **cancelled** (slot freed up again).

### `POST /events` (create booking) — key fields (verified)
- `time_slot_reservation` (id from step 4), `company` (id string — expandable), `starts_at`/`ends_at`.
- `event_types` must be **objects**, not bare ids: `[{ "id": "<event_type_id>" }]`. (Bare strings work
  for the reservation step but are rejected by `POST /events`.)
- `employee` / `space`: a slot is bound to one or the other — appointment slots carry `employeeIds`,
  resource/table slots carry `spaceIds` (seen empty `employeeIds` + a `spaceIds` for space-based venues).
- Customer: `customer_name`, `email`, `phone_number`, `phone_country_code`, `ssn` (= kennitala),
  `license_plate` (vehicle-service verticals), plus `comment`, `booking_question_answers`, `number_of_guests`.

### Cancel
`POST /v1/marketplace/events/{id}` with `{ status: "cancelled" }`. The response echoes the event but
**without a reliable `status` field** — don't gate success on it. Authoritative confirmation: the event
drops out of `GET /events` (and its slot becomes bookable again). The CLI treats a 2xx as accepted and
verifies removal from the list.

### Other useful endpoint groups
Cards/Payments, Vouchers + Voucher Templates, Waitlists, Booking Offers, Recommendations/Suggestions,
Categories (company_types, service_types, cuisines, dietaries, ambiences), Employees, Spaces, Items.

## Why we did NOT decompile the app

Attempted, then abandoned in favor of the official spec:
- **APK download blocked:** every mirror (APKPure, APKCombo→PureAPK, Aptoide, apkmonk) sits behind a
  Cloudflare JS challenge that `curl` can't pass. Pkg name confirmed: consumer app `com.timatorgmobile`
  ("Noona – Book anything"); business app `com.timatal.employees` (Noona HQ).
- **Emulator blocked in this env:** the existing AVD's disk images are mode `0600` owned by another
  user (`openclaw`); creating a fresh AVD fails because this account isn't in the `kvm` group and
  `sudo` needs a password. (A Playwright/Chromium install succeeded and could pass Cloudflare to fetch
  the APK if we ever want the app's exact client behavior — but the documented API makes it unnecessary.)

The app talks to this same documented backend, so the spec is authoritative.

## Recommended next steps for the CLI

1. Confirm token delivery: run the phone-OTP flow once with a real number, dump response headers.
2. Generate a typed client from `reference/marketplace-openapi.yaml`.
3. Implement an auth command (`login` via phone OTP) that stores the JWT locally.
4. Implement agent-friendly commands: `search`, `services <company>`, `slots <company> <service>`,
   `book`, `bookings`, `cancel`.
5. Match a realistic mobile `User-Agent` on requests.
