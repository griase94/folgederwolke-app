/**
 * No-op MailProvider for tests.
 *
 * Returns success without touching SMTP. The sent_mails row is still written
 * by the caller in $lib/server/mail/index.ts (sendMail), so test assertions
 * against sent_mails continue to work (ADR-0005 idempotency unchanged).
 */

import type { MailProvider } from "./provider.js";
import type { MailMessage } from "./types.js";

let counter = 0;

/**
 * Test-only capture of the last MailMessage the no-op provider "sent". The
 * sent_mails row records the envelope but not attachments, so integration
 * tests read the wire message here to assert e.g. the Giro-QR CID image and
 * the invoice PDF actually rode along. Not used in production.
 */
let lastMail: MailMessage | null = null;
export function getLastNoOpMail(): MailMessage | null {
  return lastMail;
}

export const noOpProvider: MailProvider = {
  async send(msg: MailMessage) {
    counter += 1;
    lastMail = msg;
    return { messageId: `noop-${Date.now()}-${counter}` };
  },
};
