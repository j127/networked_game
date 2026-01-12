import * as schema from "./schema";

const dbPath = process.env.KOTT_DB_PATH || "game.sqlite";
const dbUrl =
  process.env.KOTT_DB_URL ||
  (dbPath === ":memory:" ? "file::memory:?cache=shared" : `file:${dbPath}`);

const libsql = await import("@libsql/client");
const libsqlDrizzle = await import("drizzle-orm/libsql");
const libsqlMigrator = await import("drizzle-orm/libsql/migrator");

const client = libsql.createClient({ url: dbUrl });
export const db = libsqlDrizzle.drizzle(client, { schema });

export async function initDB() {
  await client.execute("PRAGMA foreign_keys = ON;");
  await libsqlMigrator.migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database initialized and migrated");
}
