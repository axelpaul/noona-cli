import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("Noona MCP exposes public read-only tools", async () => {
	const client = new Client({ name: "noona-test", version: "0.1.0" });
	try {
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: ["src/index.ts", "serve"],
				cwd: process.cwd(),
				stderr: "pipe",
			}),
		);
		expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
			"services",
			"slots",
		]);
		const invalid = await client.callTool({
			name: "slots",
			arguments: { company: "max1d5", serviceId: "test", days: 30 },
		});
		expect(invalid.isError).toBe(true);
	} finally {
		await client.close();
	}
});

test("Noona cancellation tool requires opt-in and exact booking confirmation", async () => {
	const client = new Client({ name: "noona-write-test", version: "0.1.0" });
	try {
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: ["src/index.ts", "serve"],
				cwd: process.cwd(),
				stderr: "pipe",
				env: { ...process.env, NOONA_MCP_ENABLE_WRITES: "1" },
			}),
		);
		expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("booking_cancel");
		const rejected = await client.callTool({
			name: "booking_cancel",
			arguments: { eventId: "event-a", confirmEventId: "event-b" },
		});
		expect(rejected.isError).toBe(true);
	} finally {
		await client.close();
	}
});
