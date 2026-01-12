import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

const sqlite = new Database("game.sqlite");
export const db = drizzle(sqlite, { schema });

export function initDB() {
  // enable foreign keys
  sqlite.run("PRAGMA foreign_keys = ON;");

  // Run migrations
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database initialized and migrated");
}
