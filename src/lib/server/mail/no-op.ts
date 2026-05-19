/**
 * No-op MailProvider for tests.
 *
 * Returns success without touching SMTP. The sent_mails row is still written
 * by the caller in $lib/server/mail/index.ts (sendMail), so test assertions
 * against sent_mails continue to work (ADR-0005 idempotency unchanged).
 */

import type { MailProvider } from "./provider.js";

let counter = 0;

export const noOpProvider: MailProvider = {
  async send() {
    counter += 1;
    return { messageId: `noop-${Date.now()}-${counter}` };
  },
};
