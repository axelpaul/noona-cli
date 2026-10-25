// noona doctor — pre-flight: API reachable, auth state, token validity.
// Public checks pass without login; auth checks only run if a token is present.

import { AuthError, NoonaClient } from "../lib/api.ts";
import { color, isJsonMode, printJson } from "../lib/output.ts";
import { currentToken } from "../lib/session.ts";
import { loadAuth, loadConfig } from "../lib/storage.ts";

export type CheckStatus = "ok" | "warn" | "fail";
export interface Check {
	name: string;
	status: CheckStatus;
	detail?: string;
}

export async function doctorCommand(flags: { json?: boolean; pretty?: boolean }): Promise<void> {
	report(await runChecks(), isJsonMode(flags));
}

/** Run the pre-flight checks without printing. Shared with the MCP `doctor` tool. */
export async function runChecks(): Promise<Check[]> {
	const checks: Check[] = [];
	const cfg = loadConfig();
	const client = new NoonaClient({ baseUrl: cfg.baseUrl, token: currentToken() });

	// 1) Public API reachability — list company types (cheap, no auth).
	try {
		await client.listCompanies({ limit: 1 });
		checks.push({
			name: "api_reachable",
			status: "ok",
			detail: "GET /v1/marketplace/companies ok",
		});
	} catch (e) {
		checks.push({
			name: "api_reachable",
			status: "fail",
			detail: e instanceof Error ? e.message : String(e),
		});
	}

	// 2) Auth state.
	const token = currentToken();
	const auth = loadAuth();
	if (!token) {
		checks.push({
			name: "auth",
			status: "warn",
			detail: "No token — public commands work; `noona login` for bookings.",
		});
		return checks;
	}
	checks.push({
		name: "auth",
		status: "ok",
		detail: `Token present${auth?.user?.name ? ` (${auth.user.name})` : ""}${process.env.NOONA_TOKEN ? " [from $NOONA_TOKEN]" : ""}.`,
	});

	// 3) Token validity — GET /v1/marketplace/user.
	try {
		const me = await client.getUser();
		checks.push({
			name: "token_valid",
			status: "ok",
			detail: `Authenticated as ${me.name ?? me.phone_number ?? me.id ?? "?"}.`,
		});
	} catch (e) {
		checks.push({
			name: "token_valid",
			status: "fail",
			detail:
				e instanceof AuthError
					? "Server rejected the token (401/403). Run `noona login`."
					: e instanceof Error
						? e.message
						: String(e),
		});
	}

	return checks;
}

export function overallStatus(checks: Check[]): CheckStatus {
	return checks.some((c) => c.status === "fail")
		? "fail"
		: checks.some((c) => c.status === "warn")
			? "warn"
			: "ok";
}

function report(checks: Check[], json: boolean): void {
	const overall = overallStatus(checks);

	if (json) {
		printJson({ status: overall, checks });
		if (overall === "fail") process.exit(2);
		return;
	}

	const icon: Record<CheckStatus, string> = {
		ok: color.green("✓"),
		warn: color.yellow("!"),
		fail: color.red("✗"),
	};
	for (const c of checks) {
		console.log(`  ${icon[c.status]} ${color.bold(c.name)}  ${color.dim(c.detail ?? "")}`);
	}
	console.log("");
	if (overall === "ok") console.log(color.green("All checks passed."));
	else if (overall === "warn") console.log(color.yellow("Ready for public commands."));
	else {
		console.log(color.red("Checks failed."));
		process.exit(2);
	}
}
