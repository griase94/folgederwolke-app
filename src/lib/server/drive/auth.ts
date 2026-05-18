import { env } from "$lib/server/env.js";
import { OAuth2Client } from "google-auth-library";

let _client: OAuth2Client | null = null;

/**
 * Returns a singleton OAuth2Client with the refresh token set.
 * google-auth-library auto-refreshes the access token on expiry.
 * Used by the Drive/Docs/Sheets clients and by /healthz.
 */
export function getDriveAuth(): OAuth2Client {
  if (_client) return _client;

  _client = new OAuth2Client(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
  );

  _client.setCredentials({
    refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
  });

  return _client;
}
