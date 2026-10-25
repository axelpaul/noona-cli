# noona-cli

Command-line tool and MCP server for the [Noona](https://noona.is) booking marketplace: search businesses, list their services, find open time slots, and book or cancel appointments.

> Unofficial — not affiliated with Noona.

It talks to Noona's documented Marketplace API (`https://api.noona.is`, [docs](https://docs.noona.is/docs/marketplace)). The OpenAPI specs are vendored under [`reference/`](reference/), and [`FINDINGS.md`](FINDINGS.md) has notes on how the API behaves in practice.

## Install

Requires [Bun](https://bun.sh) 1.1 or newer.

```sh
bun add -g github:axelpaul/noona-cli      # install
bun add -g github:axelpaul/noona-cli      # update (re-run; pulls the latest default branch)
bun remove -g noona-cli                   # uninstall
```

This installs the `noona` command into `~/.bun/bin`.

Prefer a single binary with no Bun? Download one for your platform (`noona-linux-x64`, `noona-darwin-arm64`, `noona-windows-x64.exe`, ...) from the [Releases page](https://github.com/axelpaul/noona-cli/releases), check it against `SHA256SUMS`, make it executable and put it on your `PATH`.

## Authentication

Searching businesses, listing services and checking open slots are public and need no login.

Booking, listing your bookings, cancelling and `whoami` need a Noona account token. Get one with:

- **Phone code** (default): `noona login` asks for your phone number, Noona sends an SMS code, you type it in.
  Non-interactive: `noona login --phone 5555555 --cc 354`, then `noona login --phone 5555555 --cc 354 --code 123456`.
- **A token you already have**: `noona login --token <jwt>` or `export NOONA_TOKEN=<jwt>`.
- **Google/Apple**: `noona login --provider google --id-token <id_token>`.

The token is stored in the config directory (see [Configuration](#configuration)) with mode `0600`. `noona logout` removes it.

The token is sent as the raw `Authorization` header value, without a `Bearer ` prefix (Noona rejects the prefix).

## CLI usage

```sh
noona search "hár" --limit 5                       # find businesses
noona services example-salon                       # services at one business
noona slots example-salon --service <service_id>   # open slots, next 7 days
noona slots example-salon --service <id> --from 2030-01-01 --days 3

noona login                                        # SMS code login
noona book example-salon --service <id> --at 2030-01-01T10:00    # asks before booking
noona bookings                                     # your bookings
noona bookings --id <event_id>                     # one booking in full
noona cancel <event_id>                            # asks before cancelling
```

A business is identified by its **url_name** (the slug in `noona.is/<url_name>`) or its **id**; both work wherever `<company>` appears. `--at` is wall-clock time in the business's own timezone.

| Command | Login | Changes data | What it does |
|---------|-------|--------------|--------------|
| `search [query]` | no | no | Find businesses (`--lat --lng --radius`, `--type`, `--sort popular\|distance`, `--limit`). |
| `services <company>` | no | no | List bookable services with duration and starting price. |
| `slots <company> --service <id>` | no | no | Open time slots (`--from`, `--to`, `--days`, `--employee`; comma-separate several service ids). |
| `book <company> --service <id> --at <time>` | yes | yes | Hold the slot and confirm the booking (`--employee`, `--guests`, `--name`, `--email`, `--phone`, `--cc`, `--comment`, `--yes`). |
| `bookings [--id <event_id>]` | yes | no | List your bookings, or one in full. |
| `cancel <event_id>` | yes | yes | Cancel a booking (`--reason`, `--yes`). |
| `login` / `logout` / `whoami` | – | – | Session management. |
| `doctor` | no | no | Check API reachability and token validity. |
| `schema [command]` | no | no | Print the JSON shape a command returns. |
| `serve` | – | – | Start the MCP server on stdio. |
| `--version`, `--help` | | | |

Output and scripting:

- `--json` gives machine-readable output (automatic when stdout is piped); `--pretty` forces human output; `--raw` prints the unmodified API payload.
- Exit codes: `0` ok, `1` error, `2` login required, `3` refused (a mutation without `--yes` in non-interactive mode), `64` usage error.
- `book` and `cancel` ask for confirmation unless `--yes` is given, and refuse outright in `--json` mode without `--yes`.

## MCP server

`noona serve` runs an MCP server over stdio. Each tool calls the same code as the matching CLI command and returns the same JSON as `--json`.

| Tool | Read/write | Description |
|------|-----------|-------------|
| `search_businesses` | read | Search businesses (query, location, type, sort, limit). Public. |
| `list_services` | read | Services at a business with duration and starting price. Public. |
| `list_slots` | read | Open time slots for a business, by service/employee, up to 31 days. Public. |
| `list_bookings` | read | The logged-in user's bookings. Needs login. |
| `get_booking` | read | One booking in full by event id. Needs login. |
| `whoami` | read | The logged-in user's profile. Needs login. |
| `doctor` | read | API reachability, login and token checks. |
| `create_booking` | write | Book an appointment. Returns a preview unless `confirm: true`. |
| `cancel_booking` | write | Cancel a booking. `confirmEventId` must repeat `eventId`. |

Write tools are hidden unless the server is started with `NOONA_MCP_ENABLE_WRITES=1`. Even then, `create_booking` only books when called with `confirm: true` (call it first without, show the preview to the user), and `cancel_booking` only cancels when `confirmEventId` exactly matches `eventId`.

Not exposed over MCP: `login`/`logout` (interactive SMS flow; log in once in a terminal or pass `NOONA_TOKEN`) and `schema` (MCP tools already describe their inputs).

**Claude Code**

```sh
claude mcp add noona -- noona serve
# with writes enabled and a token:
claude mcp add noona -e NOONA_MCP_ENABLE_WRITES=1 -e NOONA_TOKEN=<jwt> -- noona serve
```

**Claude Desktop, Cursor and other JSON-configured clients**

```json
{
  "mcpServers": {
    "noona": {
      "command": "noona",
      "args": ["serve"]
    }
  }
}
```

GUI apps often don't have `~/.bun/bin` on their `PATH`. If the server fails to start, use the absolute path from `which noona` as `command`. Pass environment variables with an `env` block:

```json
{
  "mcpServers": {
    "noona": {
      "command": "/absolute/path/to/noona",
      "args": ["serve"],
      "env": { "NOONA_MCP_ENABLE_WRITES": "1" }
    }
  }
}
```

If you've run `noona login`, the server picks up the stored token; otherwise set `NOONA_TOKEN` in `env`.

## Configuration

| Env var | Meaning |
|---------|---------|
| `NOONA_TOKEN` | Account token (overrides the stored session). |
| `NOONA_PHONE` / `NOONA_CC` | Default phone number and country code for `login` (country code defaults to 354). |
| `NOONA_BASE_URL` | Override the API base URL (default `https://api.noona.is`). |
| `NOONA_CONFIG_DIR` | Override the config directory. |
| `NOONA_MCP_ENABLE_WRITES` | Set to `1` to expose `create_booking` and `cancel_booking` over MCP. |
| `NO_COLOR` | Disable colored output. |

Files live in `$XDG_CONFIG_HOME/noona-cli/` (default `~/.config/noona-cli/`):

- `auth.json`: the stored token and basic user info (mode `0600`).
- `config.json`: optional `baseUrl` and `phoneCountryCode`.

An existing `~/.config/noona/` from older versions is still used if the new directory doesn't exist.

## Development

```sh
bun install
bun run check          # biome lint + tsc + tests
bun run dev -- <cmd>   # watch mode
bun src/index.ts <cmd> # run from source
bun run build          # standalone binary at dist/noona
```

Code layout: `src/lib/api.ts` is the HTTP client, `src/lib/ops.ts` holds the operations shared by the CLI commands (`src/commands/`) and the MCP server (`src/mcp/server.ts`).

Releases: pushing a `v*` tag runs `.github/workflows/release.yml`, which builds binaries for Linux, macOS and Windows and attaches them with `SHA256SUMS` to a GitHub release.

## License

MIT
