import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { addDays, today } from "../lib/format.ts";
import { resolveCompany } from "../lib/resolve.ts";
import { authedClient, publicClient } from "../lib/session.ts";

const server = new McpServer({ name: "noona", version: "0.1.0" });
const result = (data: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(data) }],
});
const error = (value: unknown) => ({
	isError: true,
	content: [
		{
			type: "text" as const,
			text: value instanceof Error ? value.message : "Noona lookup failed.",
		},
	],
});

server.registerTool(
	"services",
	{
		description: "List public bookable services at a business. Does not make bookings.",
		inputSchema: { company: z.string().trim().min(1).max(100) },
	},
	async ({ company }) => {
		try {
			const api = publicClient();
			const resolved = await resolveCompany(api, company);
			const services = await api.listEventTypes(resolved.id);
			return result({
				companyId: resolved.id,
				services: services
					.slice(0, 100)
					.map((service) => ({ id: service.id, title: service.title, minutes: service.minutes })),
			});
		} catch (e) {
			return error(e);
		}
	},
);

server.registerTool(
	"slots",
	{
		description:
			"List public appointment slots for one service, for at most 14 days. Does not make bookings.",
		inputSchema: {
			company: z.string().trim().min(1).max(100),
			serviceId: z.string().trim().min(1).max(100),
			from: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional(),
			days: z.number().int().min(1).max(14).default(7),
		},
	},
	async ({ company, serviceId, from, days }) => {
		try {
			const api = publicClient();
			const resolved = await resolveCompany(api, company);
			const startDate = from ?? today();
			const rows = await api.getTimeSlots(resolved.id, {
				startDate,
				endDate: addDays(startDate, days),
				eventTypeIds: [serviceId],
			});
			return result({
				companyId: resolved.id,
				serviceId,
				days: rows.map((day) => ({
					date: day.date,
					times: day.slots?.map((slot) => slot.time) ?? [],
				})),
			});
		} catch (e) {
			return error(e);
		}
	},
);

if (process.env.NOONA_MCP_ENABLE_WRITES === "1") {
	server.registerTool(
		"booking_cancel",
		{
			description:
				"Cancel one existing booking by exact event ID. Requires startup opt-in and matching confirmation. This is a real cancellation, not a preview.",
			inputSchema: {
				eventId: z.string().trim().min(1).max(120),
				confirmEventId: z.string(),
				reason: z.string().max(500).optional(),
			},
		},
		async ({ eventId, confirmEventId, reason }) => {
			try {
				if (eventId !== confirmEventId)
					throw new Error("confirmEventId must exactly match eventId.");
				const api = authedClient(true);
				const booking = await api.getEvent(eventId);
				if (booking.status === "cancelled")
					return result({ eventId, cancelled: true, alreadyCancelled: true });
				await api.cancelEvent(eventId, reason);
				try {
					const active = await api.listEvents();
					const verifiedRemoved = !active.some((event) => event.id === eventId);
					return result({
						eventId,
						cancellationAccepted: true,
						verifiedRemoved,
						...(verifiedRemoved
							? {}
							: {
									warning: "Booking remains on the active list; check its status before retrying.",
								}),
					});
				} catch {
					return result({
						eventId,
						cancellationAccepted: true,
						verifiedRemoved: null,
						warning:
							"Cancellation was accepted but verification failed; check the booking before retrying.",
					});
				}
			} catch (e) {
				return error(e);
			}
		},
	);
}

export async function serve(): Promise<void> {
	await server.connect(new StdioServerTransport());
}
