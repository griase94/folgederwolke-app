import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside SvelteKit, so we read env via process.env directly
const url = process.env["DIRECT_DATABASE_URL"];
if (!url) {
  throw new Error("DIRECT_DATABASE_URL is required for drizzle-kit");
}

export default defineConfig({
  schema: "./src/lib/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
