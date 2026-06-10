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

Header: `Authorization: Bearer <jwt>` (scheme `Marketplace-Authentication`, JWT bearer).

Two ways to get the JWT:
1. **Phone OTP (best for a CLI — no Google/Apple needed):**
   - `POST /v1/marketplace/user/verify_phone_number` `{phone_number, phone_country_code}` → sends SMS, returns `{next_retry_at}`. *(public)*
   - `POST /v1/marketplace/user/verified` `{phone_number, phone_country_code, verification_code}` → creates/verifies the user. *(public)*
2. **Social login:** `POST /v1/marketplace/user/login` `{provider: google|apple, id_token, name}`.

> ⚠️ Open question: the spec's documented `verified`/`login` **response bodies** return the user object
> but do not show an explicit token field — the JWT is most likely delivered in a **response header**
> (e.g. `Authorization`) or `Set-Cookie`. Confirm by running the OTP flow once with a real number and
> dumping response headers. This is the only unverified link in the chain.

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

**Verified live (unauthenticated):** listed companies → got an appointment company → listed its
event_types → queried `time_slots` and received real bookable slots
(`{date, slots:[{time, employeeIds}], status}`).

### `POST /events` (create booking) — key fields
`time_slot_reservation` (id from step 4), `company`, `event_types`, `employee`,
`starts_at`/`ends_at`/`duration`, `number_of_guests`, customer info
(`customer_name`, `email`, `phone_number`, `phone_country_code`, `ssn` = kennitala),
`comment`, `booking_question_answers`.

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
