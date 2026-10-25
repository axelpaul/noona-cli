import { expect, test } from "bun:test";
import { ApiError, type NoonaClient } from "./api.ts";
import { cancelBooking, executeBooking, findSlots, planBooking, UsageError } from "./ops.ts";

// A stub client that records calls. Only the methods the ops touch are implemented.
function stub(overrides: Partial<Record<keyof NoonaClient, unknown>> = {}) {
	const calls: Array<[string, unknown]> = [];
	const base = {
		getCompany: async (ref: string) => {
			if (ref !== "example-salon") throw new ApiError("not found", 404);
			return {
				id: "company-1",
				profile: { store_name: "Dæmistofa" },
				connections: { url_name: "example-salon", location: { time_zone: "Atlantic/Reykjavik" } },
			};
		},
		listEventTypes: async () => [{ id: "svc-1", title: "Klipping", minutes: 30 }],
		getUser: async () => ({
			name: "Jón Jónsson",
			phone_number: "5555555",
			phone_country_code: "354",
		}),
		getTimeSlots: async (_id: string, q: unknown) => {
			calls.push(["getTimeSlots", q]);
			return [
				{ date: "2030-01-01", status: "open", slots: [{ time: "10:00" }, { time: "10:30" }] },
				{ date: "2030-01-02", status: "closed", slots: [] },
			];
		},
		createReservation: async (body: unknown) => {
			calls.push(["createReservation", body]);
			return { id: "res-1" };
		},
		createEvent: async (body: unknown) => {
			calls.push(["createEvent", body]);
			return { id: "event-1", status: "booked" };
		},
		cancelEvent: async (id: string) => {
			calls.push(["cancelEvent", id]);
			return { id };
		},
		listEvents: async () => [],
		...overrides,
	};
	return { client: base as unknown as NoonaClient, calls };
}

test("planBooking + executeBooking: reserve then confirm with event_types as objects", async () => {
	const { client, calls } = stub();
	const plan = await planBooking(client, client, {
		company: "example-salon",
		service: "svc-1",
		at: "2030-01-01T10:00",
	});
	expect(plan.summary.starts_at).toBe("2030-01-01T10:00:00.000Z");
	expect(plan.summary.ends_at).toBe("2030-01-01T10:30:00.000Z");
	expect(plan.summary.customer_name).toBe("Jón Jónsson");
	expect(calls).toHaveLength(0); // planning never writes

	const { result } = await executeBooking(client, plan);
	expect(result.event_id).toBe("event-1");
	expect(calls.map((c) => c[0])).toEqual(["createReservation", "createEvent"]);
	const event = calls[1]?.[1] as Record<string, unknown>;
	expect(event.time_slot_reservation).toBe("res-1");
	expect(event.event_types).toEqual([{ id: "svc-1" }]);
});

test("planBooking rejects unknown service and bad time", async () => {
	const { client } = stub();
	await expect(
		planBooking(client, client, {
			company: "example-salon",
			service: "nope",
			at: "2030-01-01T10:00",
		}),
	).rejects.toBeInstanceOf(UsageError);
	await expect(
		planBooking(client, client, { company: "example-salon", service: "svc-1", at: "soon" }),
	).rejects.toBeInstanceOf(UsageError);
});

test("findSlots keeps only open days and falls back to raw id", async () => {
	const { client, calls } = stub();
	const { result } = await findSlots(client, { company: "company-9", from: "2030-01-01", days: 2 });
	expect(result.company).toEqual({ id: "company-9", name: null });
	expect(result.range).toEqual({ from: "2030-01-01", to: "2030-01-03" });
	expect(result.total_slots).toBe(2);
	expect(result.days).toHaveLength(1);
	expect(calls[0]?.[1]).toMatchObject({ startDate: "2030-01-01", endDate: "2030-01-03" });
});

test("cancelBooking verifies removal from the active list", async () => {
	const { client } = stub();
	const { result } = await cancelBooking(client, "event-1");
	expect(result).toEqual({
		cancelled: true,
		event_id: "event-1",
		status: null,
		verified_removed: true,
	});
});
