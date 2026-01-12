import * as schema from "./schema";

const dbPath = process.env.KOTT_DB_PATH || "game.sqlite";
const isBun = typeof (process as typeof process & { versions?: { bun?: string } })
  .versions?.bun !== "undefined";

let sqlite: any;
let migrateFn: (db: any) => void;
let drizzleFn: (sqlite: any, config: { schema: typeof schema }) => any;

if (isBun) {
  const bunSqlite = await import("bun:sqlite");
  const bunDrizzle = await import("drizzle-orm/bun-sqlite");
  const bunMigrator = await import("drizzle-orm/bun-sqlite/migrator");
  sqlite = new bunSqlite.Database(dbPath);
  migrateFn = (db) => bunMigrator.migrate(db, { migrationsFolder: "./drizzle" });
  drizzleFn = bunDrizzle.drizzle;
} else {
  const libsql = await import("@libsql/client");
  const libsqlDrizzle = await import("drizzle-orm/libsql");
  const libsqlMigrator = await import("drizzle-orm/libsql/migrator");
  const url =
    dbPath === ":memory:" ? "file::memory:?cache=shared" : `file:${dbPath}`;
  sqlite = libsql.createClient({ url });
  migrateFn = (db) => libsqlMigrator.migrate(db, { migrationsFolder: "./drizzle" });
  drizzleFn = libsqlDrizzle.drizzle;
}

export const db = drizzleFn(sqlite, { schema });

export async function initDB() {
  // enable foreign keys
  if (isBun && sqlite?.exec) {
    sqlite.exec("PRAGMA foreign_keys = ON;");
  }

  if (isBun) {
    await Promise.resolve(migrateFn(db));
  } else {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile("./drizzle/0000_ordinary_sandman.sql", "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((stmt) => stmt.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await sqlite.execute(statement);
    }
  }

  console.log("Database initialized and migrated");
}
