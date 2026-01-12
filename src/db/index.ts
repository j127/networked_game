import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";

const sqlite = new Database("game.sqlite");
export const db = drizzle(sqlite, { schema });

export function initDB() {
  // enable foreign keys
  sqlite.run("PRAGMA foreign_keys = ON;");
  // Migrations are handled via 'drizzle-kit push' or 'migrate'
  // But for dev we can use push-schema script
  console.log("Database initialized (Drizzle)");
}
