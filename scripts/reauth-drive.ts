/**
 * NOTE: RUN INTERACTIVELY ONCE — captures GOOGLE_OAUTH_REFRESH_TOKEN.
 * Paste the printed refresh token into your env file / Vercel env vars.
 *
 * Usage: tsx scripts/reauth-drive.ts
 *
 * Prerequisites:
 *   - GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in environment
 *   - A browser available (or copy the URL printed to stdout)
 */
import { OAuth2Client } from "google-auth-library";
import { execFile } from "node:child_process";
import * as readline from "node:readline";

const CLIENT_ID = process.env["GOOGLE_OAUTH_CLIENT_ID"];
const CLIENT_SECRET = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "ERROR: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set.",
  );
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent", // force re-consent to always get a refresh token
});

console.log("\n=== Google OAuth — Drive Authorisation ===\n");
console.log("Open this URL in your browser and authorise the app:\n");
console.log(authUrl);
console.log("\n");

// Try to open in browser automatically using execFile (no shell injection risk — URL is app-generated)
function tryOpenBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "darwin") execFile("open", [url]);
    else if (platform === "linux") execFile("xdg-open", [url]);
    else if (platform === "win32") execFile("cmd", ["/c", "start", "", url]);
  } catch {
    // Not fatal — user can copy the URL manually
  }
}

tryOpenBrowser(authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question(
  "Paste the authorisation code from the browser here: ",
  async (code) => {
    rl.close();
    try {
      const { tokens } = await oAuth2Client.getToken(code.trim());
      if (!tokens.refresh_token) {
        console.error(
          "\nERROR: No refresh token returned. Try revoking access at " +
            "https://myaccount.google.com/permissions and run this script again.",
        );
        process.exit(1);
      }
      console.log("\n=== SUCCESS ===");
      console.log(
        "Add this to your .env file / Vercel environment variables:\n",
      );
      console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log("\nDo NOT commit this value to git.\n");
    } catch (err) {
      console.error("\nERROR exchanging code for tokens:", err);
      process.exit(1);
    }
  },
);
