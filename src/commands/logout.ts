// noona logout — clear the stored session.

import { color, isJsonMode, printJson } from "../lib/output.ts";
import { clearAuth } from "../lib/storage.ts";

export async function logoutCommand(flags: { json?: boolean; pretty?: boolean }): Promise<void> {
	clearAuth();
	if (isJsonMode(flags)) printJson({ step: "logged_out" });
	else console.log(color.green("✓ Logged out."));
}
