/**
 * MailProvider abstraction.
 *
 * getMailProvider() returns a singleton switched on MAIL_PROVIDER env var.
 * SMTP is the v1 default; Resend is a Phase-2 stub that throws immediately.
 */

import { env } from "$lib/server/env.js";
import type { MailMessage } from "./types.js";

export interface MailProvider {
  send(msg: MailMessage): Promise<{ messageId: string }>;
}

let cached: MailProvider | undefined;

export async function getMailProvider(): Promise<MailProvider> {
  if (cached) return cached;
  if (env.MAIL_PROVIDER === "resend") {
    cached = (await import("./resend.js")).resend;
  } else {
    cached = (await import("./smtp.js")).smtp;
  }
  return cached;
}
