/**
 * SMTP mail provider via nodemailer.
 *
 * Reads SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD from env.
 * secure=true when port 465 (SMTPS); otherwise STARTTLS is used.
 * A single Transport instance is reused across calls (connection pooling).
 */

import { env } from "$lib/server/env.js";
import nodemailer from "nodemailer";
import type { MailProvider } from "./provider.js";
import type { MailMessage } from "./types.js";

function createTransport() {
  const port = env.SMTP_PORT;
  const secure = port === 465;
  return nodemailer.createTransport({
    host: env.SMTP_HOST || "localhost",
    port,
    secure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  });
}

// Singleton transport — nodemailer manages the underlying TCP connection pool.
let _transport: ReturnType<typeof nodemailer.createTransport> | undefined;

function getTransport() {
  if (!_transport) _transport = createTransport();
  return _transport;
}

export const smtp: MailProvider = {
  async send(msg: MailMessage) {
    const transport = getTransport();
    const info = await transport.sendMail({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      headers: msg.headers,
    });
    return { messageId: info.messageId ?? "" };
  },
};
