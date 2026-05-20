/**
 * RFC 5987-encoded Content-Disposition header. ASCII fallback for old clients
 * + UTF-8 percent-encoded version for modern browsers.
 */
export function formatContentDisposition(
  disposition: "inline" | "attachment",
  filename: string,
): string {
  const ascii = filename.replace(/[^\w\s\-.()_]/g, "_");
  const utf8 = encodeURIComponent(filename);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
