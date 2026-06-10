# noona

Headless, agent-friendly CLI for the **Noona** booking marketplace
([noona.is](https://noona.is)) — search businesses, list their services, find
open time slots, and book / cancel appointments from your terminal.

Built with [Bun](https://bun.sh) against Noona's **official Marketplace API**
(`https://api.noona.is`, [docs](https://docs.noona.is/docs/marketplace)). The
OpenAPI specs are vendored under [`reference/`](reference/).

## Install

```bash
bun install
bun run build        # produces a standalone ./noona binary
# or run straight from source:
bun src/index.ts <command>
```

## Quick start

```bash
noona search "hair" --limit 5            # find businesses (public)
noona services hairharmony               # list a business's services (public)
noona slots hairharmony --service <id>   # open slots, next 7 days (public)

noona login --phone 7654321 --cc 354     # SMS one-time-code login
noona book hairharmony --service <id> --at 2026-06-11T10:00 --yes
noona bookings                           # your bookings
noona cancel <event_id> --yes
```

A business is identified by its **url_name** (the slug in `noona.is/<url_name>`)
or its **id**; both work wherever `<company>` appears.

## Auth

Discovery and availability (`search`, `services`, `slots`) are **public** — no
login needed. Booking and account commands need a JWT bearer token.

Get one with:

- **Phone OTP** (default): `noona login` → sends an SMS code → enter it.
- **A token you already have**: `noona login --token <jwt>` or `export NOONA_TOKEN=<jwt>`.
- **Social**: `noona login --provider google --id-token <id_token>`.

The token is stored at `~/.config/noona/auth.json` (mode `0600`).

> ⚠️ The phone/social login response delivers the JWT in a spot the public spec
> doesn't pin down; `login` extracts it defensively from response headers,
> cookies, and body. If your account's flow differs, capture the app's bearer
> token once and use `--token` / `$NOONA_TOKEN`. See `FINDINGS.md`.

## Agent usage

- Every command takes `--json` for machine output (auto-enabled when piped).
- `noona schema <command> --json` returns the exact response shape — call it
  once to learn the contract.
- `noona doctor --json` is a pre-flight: API reachability + auth/token validity.
- `--raw` dumps the unmodified API payload.
- Exit codes: `0` ok · `1` error · `2` auth required · `3` refused (e.g. a
  mutation without `--yes` in non-interactive mode) · `64` usage error.

Mutating commands (`book`, `cancel`) confirm interactively unless `--yes`, and
refuse outright in non-interactive `--json` mode without `--yes`.

## Config & env

| Env | Meaning |
|-----|---------|
| `NOONA_TOKEN` | Bearer token (overrides the stored session). |
| `NOONA_PHONE` / `NOONA_CC` | Default phone + country code for `login`. |
| `NOONA_BASE_URL` | Override the API base (default `https://api.noona.is`). |

## Commands

| Command | Auth | Mutating | What |
|---------|------|----------|------|
| `search <query>` | – | – | Find businesses (`--lat/--lng/--radius`, `--sort`, `--limit`). |
| `services <company>` | – | – | List bookable services for a business. |
| `slots <company> --service <id>` | – | – | Open time slots (`--from`, `--days`, `--employee`). |
| `book <company> --service <id> --at <ISO>` | ✓ | ✓ | Reserve + confirm a booking. |
| `bookings [--id <event_id>]` | ✓ | – | List your bookings / one in detail. |
| `cancel <event_id>` | ✓ | ✓ | Cancel a booking. |
| `login` / `logout` / `whoami` | – / – / ✓ | – | Session management. |
| `doctor` / `schema` / `version` | – | – | Diagnostics + agent hooks. |

## Dev

```bash
bun run check        # biome lint + tsc --noEmit
bun run dev <cmd>    # watch mode
```
