/**
 * dev-eml MailProvider — writes outgoing mail to .eml files on disk.
 *
 * Selected via MAIL_PROVIDER=dev-eml in .env.development. Lets you:
 *   - Open the .eml in any mail client (Mail.app, Thunderbird)
 *   - See magic-link URLs in the console (logged here for fast iteration)
 *
 * RFC 5322 minimal envelope — sufficient for human inspection, not for
 * production-grade MIME handling.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MailProvider } from "./provider.js";
import type { MailMessage } from "./types.js";

function formatEml(msg: MailMessage): string {
  const boundary = `==boundary-${Date.now()}==`;
  const lines = [
    `From: ${msg.from}`,
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    msg.text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    msg.html,
    "",
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n");
}

function extractMagicLink(text: string): string | null {
  const match = text.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

export function createDevEmlProvider(opts: { root: string }): MailProvider {
  return {
    async send(msg) {
      await mkdir(opts.root, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const safe = msg.subject.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60);
      const file = `${ts}-${safe}.eml`;
      const path = join(opts.root, file);
      await writeFile(path, formatEml(msg));

      const link = extractMagicLink(msg.text);
      if (link) {
        console.log(`[dev-eml] ${msg.subject} → ${msg.to}`);
        console.log(`[dev-eml] link: ${link}`);
      } else {
        console.log(`[dev-eml] wrote ${path}`);
      }

      return { messageId: `dev-eml-${ts}` };
    },
  };
}
