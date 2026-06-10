// Shared helper for authenticated commands: build a client from the stored
// token (or $NOONA_TOKEN) and bail cleanly when there's no session.

import { NoonaClient } from "./api.ts";
import { dieAuth } from "./output.ts";
import { loadAuth, loadConfig } from "./storage.ts";

/** Token from $NOONA_TOKEN (wins) or the stored auth file. */
export function currentToken(): string | undefined {
	return process.env.NOONA_TOKEN || loadAuth()?.token || undefined;
}

/** A client with no auth — fine for public discovery/availability commands. */
export function publicClient(): NoonaClient {
	return new NoonaClient({ baseUrl: loadConfig().baseUrl, token: currentToken() });
}

/** A client that requires a token; exits(2) if there isn't one. */
export function authedClient(json: boolean): NoonaClient {
	const token = currentToken();
	if (!token) dieAuth("not_logged_in", json);
	return new NoonaClient({ baseUrl: loadConfig().baseUrl, token });
}
