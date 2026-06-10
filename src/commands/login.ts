// noona login — get a marketplace session.
//
// Three ways in:
//   --token <jwt>            store a JWT you already have (e.g. captured from the app)
//   --provider google|apple --id-token <t>   social sign-in
//   (default)                phone OTP: send an SMS code, then enter it
//
// Phone resolves from --phone / $NOONA_PHONE and --cc / $NOONA_CC / config.

import type { LoginResult } from "../lib/api.ts";
import { NoonaClient } from "../lib/api.ts";
import { color, die, isJsonMode, printJson } from "../lib/output.ts";
import { ask } from "../lib/prompt.ts";
import { loadConfig, saveAuth } from "../lib/storage.ts";

interface LoginFlags {
	token?: string;
	phone?: string;
	cc?: string;
	code?: string;
	provider?: string;
	idToken?: string;
	json?: boolean;
	pretty?: boolean;
}

export async function loginCommand(flags: LoginFlags): Promise<void> {
	const json = isJsonMode(flags);
	const cfg = loadConfig();
	const client = new NoonaClient({ baseUrl: cfg.baseUrl });

	// 1) Direct token.
	if (flags.token) {
		const probe = new NoonaClient({ baseUrl: cfg.baseUrl, token: flags.token });
		let user: { id?: string; name?: string; phone_number?: string } = {};
		try {
			user = await probe.getUser();
		} catch {
			die("That token was rejected by GET /v1/marketplace/user.", 1, json);
		}
		saveAuth({
			token: flags.token,
			loggedInAt: new Date().toISOString(),
			user: { id: user.id, name: user.name, phone: user.phone_number },
		});
		return report(json, user, "token");
	}

	// 2) Social sign-in.
	if (flags.provider) {
		if (flags.provider !== "google" && flags.provider !== "apple") {
			die("--provider must be 'google' or 'apple'.", 64, json);
		}
		if (!flags.idToken) die("--id-token is required with --provider.", 64, json);
		let res: LoginResult;
		try {
			res = await client.socialLogin(flags.provider, flags.idToken);
		} catch (e) {
			die(`Social login failed: ${e instanceof Error ? e.message : String(e)}`, 1, json);
		}
		return persist(json, res);
	}

	// 3) Phone OTP.
	const phone = flags.phone ?? process.env.NOONA_PHONE ?? (await ask("Phone number: "));
	if (!phone) die("No phone number provided.", 64, json);
	const cc = flags.cc ?? process.env.NOONA_CC ?? cfg.phoneCountryCode ?? "354";

	if (!flags.code) {
		try {
			const r = await client.requestPhoneCode(phone, cc);
			if (!json) {
				console.log(color.dim(`SMS sent to +${cc} ${phone}.`));
				if (r.next_retry_at) console.log(color.dim(`(can resend after ${r.next_retry_at})`));
			}
		} catch (e) {
			die(`Could not send code: ${e instanceof Error ? e.message : String(e)}`, 1, json);
		}
	}

	const code = flags.code ?? (await ask("SMS code: "));
	if (!code) die("No verification code provided.", 64, json);

	let res: LoginResult;
	try {
		res = await client.verifyPhoneCode(phone, cc, code);
	} catch (e) {
		die(`Verification failed: ${e instanceof Error ? e.message : String(e)}`, 1, json);
	}
	persist(json, res);
}

function persist(json: boolean, res: LoginResult): void {
	if (!res.token) {
		const msg =
			"Verified, but no JWT was found in the response. Capture the app's bearer token " +
			"and rerun `noona login --token <jwt>` (or set $NOONA_TOKEN).";
		if (json) printJson({ step: "verified_no_token", user: res.user, hint: msg });
		else console.log(color.yellow(`! ${msg}`));
		// Still record the identity so whoami/doctor can report partial state.
		saveAuth({
			token: "",
			loggedInAt: new Date().toISOString(),
			user: { id: res.user.id, name: res.user.name, phone: res.user.phone_number },
		});
		process.exit(3);
	}
	saveAuth({
		token: res.token,
		loggedInAt: new Date().toISOString(),
		user: { id: res.user.id, name: res.user.name, phone: res.user.phone_number },
	});
	report(json, res.user, res.tokenSource ?? "ok");
}

function report(
	json: boolean,
	user: { id?: string; name?: string; phone_number?: string },
	source: string,
): void {
	if (json) {
		printJson({ step: "logged_in", token_source: source, user });
	} else {
		console.log(color.green(`✓ Logged in as ${user.name ?? user.phone_number ?? user.id ?? "?"}.`));
	}
}
