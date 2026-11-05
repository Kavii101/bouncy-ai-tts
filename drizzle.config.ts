import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// SQLite in every environment. `drizzle/sqlite` is the live migration history;
// the 0000-0002 files at the top of `drizzle/` are the retired MySQL schema.
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: connectionString,
  },
});
