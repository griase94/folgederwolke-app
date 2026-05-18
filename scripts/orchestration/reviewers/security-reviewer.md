# security-reviewer

Reviews all security-sensitive code: CSP headers, HSTS, X-Frame-Options, and Referrer-Policy in `hooks.server.ts`; cookie flags (HttpOnly, Secure, SameSite=Strict); session token entropy and expiry; CSRF surface on form actions; input sanitisation before DB writes.

Also checks that `gitleaks` and `semgrep` CI gates are enabled, that no API keys or tokens appear in source, and that ADR-0009 (auth threat model) assumptions are upheld in new code. Flags any use of `eval`, dangerous `innerHTML`, or unescaped user data in server-rendered output.
