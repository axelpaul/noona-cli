import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import pkg from "../../package.json" with { type: "json" };

// Isolated config dir and no token, so tests never touch a real session.
const configDir = mkdtempSync(join(tmpdir(), "noona-test-"));
afterAll(() => rmSync(configDir, { recursive: true, force: true }));

function baseEnv(extra: Record<string, string> = {}): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (v !== undefined && k !== "NOONA_TOKEN" && k !== "NOONA_MCP_ENABLE_WRITES") env[k] = v;
	}
	return { ...env, NOONA_CONFIG_DIR: configDir, ...extra };
}

async function connect(env: Record<string, string>): Promise<Client> {
	const client = new Client({ name: "noona-test", version: "0.0.0" });
	await client.connect(
		new StdioClientTransport({
			command: process.execPath,
			args: ["src/index.ts", "serve"],
			cwd: process.cwd(),
			stderr: "pipe",
			env,
		}),
	);
	return client;
}

const READ_TOOLS = [
	"doctor",
	"get_booking",
	"list_bookings",
	"list_services",
	"list_slots",
	"search_businesses",
	"whoami",
];

test("MCP exposes read tools only by default", async () => {
	const client = await connect(baseEnv());
	try {
		expect(client.getServerVersion()?.version).toBe(pkg.version);
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(READ_TOOLS);
		// Input validation: days is capped.
		const invalid = await client.callTool({
			name: "list_slots",
			arguments: { company: "example", days: 365 },
		});
		expect(invalid.isError).toBe(true);
		// Auth-only tools fail cleanly (no process exit) without a token.
		const noAuth = await client.callTool({ name: "list_bookings", arguments: {} });
		expect(noAuth.isError).toBe(true);
		expect(JSON.stringify(noAuth.content)).toContain("Not logged in");
	} finally {
		await client.close();
	}
});

test("write tools need NOONA_MCP_ENABLE_WRITES=1 and explicit confirmation", async () => {
	const client = await connect(baseEnv({ NOONA_MCP_ENABLE_WRITES: "1" }));
	try {
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual([...READ_TOOLS, "cancel_booking", "create_booking"].sort());
		const rejected = await client.callTool({
			name: "cancel_booking",
			arguments: { eventId: "event-a", confirmEventId: "event-b" },
		});
		expect(rejected.isError).toBe(true);
		expect(JSON.stringify(rejected.content)).toContain("must exactly match");
		const badTime = await client.callTool({
			name: "create_booking",
			arguments: { company: "example", serviceId: "svc", at: "tomorrow", confirm: true },
		});
		expect(badTime.isError).toBe(true);
	} finally {
		await client.close();
	}
});

test("CLI prints package version and lists serve in help", async () => {
	const version = Bun.spawnSync([process.execPath, "src/index.ts", "--version"]);
	expect(version.stdout.toString().trim()).toBe(`noona ${pkg.version}`);
	const help = Bun.spawnSync([process.execPath, "src/index.ts", "--help"], {
		env: { ...process.env, NO_COLOR: "1" },
	});
	expect(help.stdout.toString()).toContain("serve");
});
