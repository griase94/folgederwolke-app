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
  switch (env.MAIL_PROVIDER) {
    case "no-op":
      cached = (await import("./no-op.js")).noOpProvider;
      break;
    case "dev-eml":
      cached = (await import("./dev-eml.js")).createDevEmlProvider({
        root: env.MAIL_EML_ROOT,
      });
      break;
    case "resend":
      cached = (await import("./resend.js")).resend;
      break;
    case "smtp":
    default:
      cached = (await import("./smtp.js")).smtp;
      break;
  }
  return cached;
}
