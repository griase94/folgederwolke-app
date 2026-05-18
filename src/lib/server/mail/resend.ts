/**
 * Resend mail provider — STUB (Phase 2).
 *
 * When MAIL_PROVIDER=resend is set before DNS verification is complete,
 * this stub throws immediately so the misconfiguration is obvious rather
 * than silent.
 *
 * To implement: install `resend` package, replace body with Resend SDK call,
 * set RESEND_API_KEY env var.
 */

import type { MailProvider } from "./provider.js";

export const resend: MailProvider = {
  async send() {
    throw new Error(
      "RESEND_NOT_CONFIGURED — set MAIL_PROVIDER=smtp for v1. " +
        "Resend support is a Phase-2 enhancement (flip MAIL_PROVIDER=resend " +
        "once DNS is verified and RESEND_API_KEY is set).",
    );
  },
};
