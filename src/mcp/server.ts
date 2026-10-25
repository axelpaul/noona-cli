// MCP stdio server for noona. Every tool calls the same code the CLI uses
// (src/lib/ops.ts, src/commands/doctor.ts). Nothing here writes to stdout
// except the MCP protocol itself.
//
// Write tools (create_booking, cancel_booking) are only registered when
// NOONA_MCP_ENABLE_WRITES=1, and each also needs an explicit confirmation
// argument in the call.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from "../../package.json" with { type: "json" };
import { overallStatus, runChecks } from "../commands/doctor.ts";
import {
	cancelBooking,
	executeBooking,
	findSlots,
	listBookings,
	listServices,
	planBooking,
	searchBusinesses,
	whoami,
} from "../lib/ops.ts";
import { publicClient, requireAuthedClient } from "../lib/session.ts";

export const WRITES_ENV = "NOONA_MCP_ENABLE_WRITES";

const result = (data: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const failure = (value: unknown) => ({
	isError: true,
	content: [
		{
			type: "text" as const,
			text: value instanceof Error ? value.message : String(value),
		},
	],
});

async function run(fn: () => Promise<unknown>) {
	try {
		return result(await fn());
	} catch (e) {
		return failure(e);
	}
}

const companyArg = z
	.string()
	.trim()
	.min(1)
	.max(100)
	.describe("Business url_name (the slug in noona.is/<url_name>) or company id.");
const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export function createServer(opts: { enableWrites?: boolean } = {}): McpServer {
	const enableWrites = opts.enableWrites ?? process.env[WRITES_ENV] === "1";
	const server = new McpServer({ name: "noona", version: pkg.version });

	server.registerTool(
		"search_businesses",
		{
			description:
				"Search businesses on the Noona marketplace (salons, barbers, clinics, restaurants...). Public, no login. Same as `noona search`.",
			inputSchema: {
				query: z.string().trim().max(200).optional().describe("Free-text search."),
				lat: z.number().min(-90).max(90).optional(),
				lng: z.number().min(-180).max(180).optional(),
				radius: z.number().positive().optional().describe("Search radius around lat/lng."),
				type: z.string().trim().max(100).optional().describe("Company type id filter."),
				sort: z.enum(["popular", "distance"]).optional(),
				limit: z.number().int().min(1).max(100).default(20),
			},
		},
		async (input) => run(async () => (await searchBusinesses(publicClient(), input)).result),
	);

	server.registerTool(
		"list_services",
		{
			description:
				"List a business's bookable services (id, title, minutes, starting price). Public. Same as `noona services`.",
			inputSchema: { company: companyArg },
		},
		async ({ company }) => run(async () => (await listServices(publicClient(), company)).result),
	);

	server.registerTool(
		"list_slots",
		{
			description:
				"List open time slots for a business, optionally filtered by service and employee. Defaults to the next 7 days. Public. Same as `noona slots`.",
			inputSchema: {
				company: companyArg,
				serviceIds: z
					.array(z.string().trim().min(1).max(100))
					.max(20)
					.optional()
					.describe("Service (event type) ids from list_services."),
				employeeId: z.string().trim().min(1).max(100).optional(),
				from: dateArg.optional().describe("Start date YYYY-MM-DD (default today)."),
				to: dateArg.optional().describe("End date YYYY-MM-DD (overrides days)."),
				days: z.number().int().min(1).max(31).default(7),
			},
		},
		async ({ company, serviceIds, employeeId, from, to, days }) =>
			run(
				async () =>
					(
						await findSlots(publicClient(), {
							company,
							serviceIds,
							employee: employeeId,
							from,
							to,
							days,
						})
					).result,
			),
	);

	server.registerTool(
		"list_bookings",
		{
			description:
				"List the logged-in user's bookings. Needs a login (NOONA_TOKEN or `noona login`). Same as `noona bookings`.",
			inputSchema: {},
		},
		async () => run(async () => (await listBookings(requireAuthedClient())).result),
	);

	server.registerTool(
		"get_booking",
		{
			description:
				"Get one of the user's bookings in full by event id. Needs a login. Same as `noona bookings --id`.",
			inputSchema: { eventId: z.string().trim().min(1).max(120) },
		},
		async ({ eventId }) => run(() => requireAuthedClient().getEvent(eventId)),
	);

	server.registerTool(
		"whoami",
		{
			description:
				"Show the logged-in Noona user's profile. Needs a login. Same as `noona whoami`.",
			inputSchema: {},
		},
		async () => run(async () => (await whoami(requireAuthedClient())).result),
	);

	server.registerTool(
		"doctor",
		{
			description:
				"Pre-flight check: API reachable, login present, token valid. Same as `noona doctor`.",
			inputSchema: {},
		},
		async () =>
			run(async () => {
				const checks = await runChecks();
				return { status: overallStatus(checks), checks, writes_enabled: enableWrites };
			}),
	);

	if (enableWrites) {
		server.registerTool(
			"create_booking",
			{
				description:
					"Book an appointment (real booking). Holds the slot and confirms it, like `noona book --yes`. Call first with confirm=false (default) to get a preview; call again with confirm=true to book. Show the preview to the user before confirming. Needs a login.",
				inputSchema: {
					company: companyArg,
					serviceId: z.string().trim().min(1).max(100).describe("Service id from list_services."),
					at: z
						.string()
						.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Use YYYY-MM-DDTHH:MM")
						.describe(
							"Start time YYYY-MM-DDTHH:MM in the business's local timezone (a slot from list_slots).",
						),
					employeeId: z.string().trim().min(1).max(100).optional(),
					guests: z.number().int().min(1).max(100).optional(),
					name: z.string().trim().max(200).optional().describe("Defaults to the profile name."),
					email: z.string().trim().max(200).optional().describe("Defaults to the profile email."),
					phone: z.string().trim().max(30).optional().describe("Defaults to the profile phone."),
					countryCode: z
						.string()
						.trim()
						.max(5)
						.optional()
						.describe("Phone country code, e.g. 354."),
					comment: z.string().max(1000).optional(),
					confirm: z
						.boolean()
						.default(false)
						.describe("Must be true to actually book. false returns a preview only."),
				},
			},
			async (input) =>
				run(async () => {
					const client = requireAuthedClient();
					const plan = await planBooking(client, publicClient(), {
						company: input.company,
						service: input.serviceId,
						at: input.at,
						employee: input.employeeId,
						guests: input.guests,
						name: input.name,
						email: input.email,
						phone: input.phone,
						cc: input.countryCode,
						comment: input.comment,
					});
					if (input.confirm !== true) {
						return {
							booked: false,
							preview: plan.summary,
							next: "Nothing was booked. Call create_booking again with confirm=true to book this.",
						};
					}
					return (await executeBooking(client, plan)).result;
				}),
		);

		server.registerTool(
			"cancel_booking",
			{
				description:
					"Cancel one of the user's bookings (real cancellation), like `noona cancel --yes`. confirmEventId must exactly repeat eventId. Needs a login.",
				inputSchema: {
					eventId: z.string().trim().min(1).max(120),
					confirmEventId: z.string().describe("Must exactly match eventId."),
					reason: z.string().max(500).optional(),
				},
			},
			async ({ eventId, confirmEventId, reason }) =>
				run(async () => {
					if (eventId !== confirmEventId) {
						throw new Error("confirmEventId must exactly match eventId. Nothing was cancelled.");
					}
					const client = requireAuthedClient();
					const booking = await client.getEvent(eventId);
					if (booking.status === "cancelled") {
						return { cancelled: true, event_id: eventId, already: true };
					}
					return (await cancelBooking(client, eventId, reason)).result;
				}),
		);
	}

	return server;
}

export async function serve(): Promise<void> {
	const server = createServer();
	await server.connect(new StdioServerTransport());
	console.error(
		`noona MCP server ${pkg.version} running on stdio (writes ${process.env[WRITES_ENV] === "1" ? "enabled" : "disabled"})`,
	);
}
