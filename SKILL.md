---
name: noona
description: "Noona booking-marketplace CLI. Use whenever the user wants to book or manage appointments through Noona (noona.is) — find a business (hair salon, barber, beauty, clinic, restaurant, etc.), see what services it offers, check open time slots, make a booking, list their upcoming bookings, or cancel one. Noona is an Icelandic booking platform used across Europe; this drives its official Marketplace API at api.noona.is. Headless and agent-friendly (JSON output, stable shapes, doctor + schema commands). Search/services/slots are public (no login); booking, listing your bookings, and cancelling need `noona login` (phone SMS code). Read-only except book/cancel, which are mutating and confirm first."
homepage: https://github.com/axelpaul/noona-cli
metadata:
  {
    "openclaw":
      {
        "emoji": "💇📅",
        "requires": { "bins": ["noona", "bun"] },
        "install":
          [
            {
              "id": "git",
              "kind": "manual",
              "label": "Clone + bun link",
              "steps":
                [
                  "git clone https://github.com/axelpaul/noona-cli ~/code/noona-cli",
                  "cd ~/code/noona-cli && bun install && bun link",
                ],
            },
          ],
      },
  }
---

# noona

Headless CLI for the **Noona** booking marketplace, driving the official
Marketplace API at `https://api.noona.is`.

## When to use

Reach for `noona` whenever the user wants to **book or manage an appointment
through Noona**: find a salon/barber/clinic/restaurant, see its services and
prices, check availability, book, review their bookings, or cancel.

## The booking flow

```
noona search "<query>" --json          # 1. find the business → note its url_name/id
noona services <company> --json        # 2. list services → note the service id + minutes
noona slots <company> --service <id> --json   # 3. find an open slot (date + HH:MM)
noona book <company> --service <id> --at <YYYY-MM-DDTHH:MM> --yes   # 4. book it
noona bookings --json                  # review
noona cancel <event_id> --yes          # cancel
```

`<company>` is a **url_name** (the `noona.is/<url_name>` slug) or a company **id** —
both work. `--at` is a wall-clock time; it's interpreted in the business's own
timezone automatically.

## Auth

- `search`, `services`, `slots` are **public** — no login required.
- `book`, `bookings`, `cancel`, `whoami` need a token: run `noona login`
  (phone → SMS code), or set `$NOONA_TOKEN`, or `noona login --token <jwt>`.

## Agent notes

- Add `--json` for machine output (auto when piped). `--raw` = unmodified API payload.
- `noona schema <command> --json` → exact response shape. Call once to learn the contract.
- `noona doctor --json` → pre-flight (API reachable + auth state).
- Exit codes: `0` ok · `1` error · `2` auth required · `3` refused (mutation
  without `--yes`) · `64` usage.
- `book` and `cancel` are **mutating**: they confirm interactively, and in
  non-interactive `--json` mode they refuse unless you pass `--yes`. Always show
  the user the chosen slot before passing `--yes`.

## Caveat

The login token-delivery and the reserve→confirm booking bodies are built from
Noona's OpenAPI spec; the public discovery/availability path is verified live,
but the authenticated booking path should be confirmed against a real account on
first use (`--raw` shows the exact payloads). See `FINDINGS.md`.
