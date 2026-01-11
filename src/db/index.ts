import { Database } from "bun:sqlite";

const db = new Database("game.sqlite");

export function initDB() {
  // enable foreign keys
  db.run("PRAGMA foreign_keys = ON;");

  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'LOBBY', -- LOBBY, ACTIVE, FINISHED
      turn_player_index INTEGER DEFAULT 0,
      current_phase TEXT DEFAULT 'SETUP', -- INCOME, EVENTS, ACQUIRE, COMBAT, END
      combat_state TEXT, -- JSON blob storing current battle details if in combat
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      game_id TEXT,
      name TEXT,
      color TEXT,
      gold INTEGER DEFAULT 0,
      prestige INTEGER DEFAULT 0,
      is_eliminated BOOLEAN DEFAULT 0,
      FOREIGN KEY(game_id) REFERENCES games(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS territories (
      id TEXT PRIMARY KEY,
      game_id TEXT,
      owner_id TEXT, -- NULL if unowned
      terrain_type TEXT, -- FOREST, PLAINS, MOUNTAIN, SWAMP, DESERT
      fortification_level INTEGER DEFAULT 0, -- 0=None, 1=Tower, 2=Keep, 3=Castle, 4=Citadel
      settlement_type TEXT, -- NULL, 'VILLAGE', 'CITY', 'MINE_GOLD', 'MINE_SILVER', 'MINE_COPPER'
      FOREIGN KEY(game_id) REFERENCES games(id),
      FOREIGN KEY(owner_id) REFERENCES players(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS things (
      id TEXT PRIMARY KEY,
      game_id TEXT,
      owner_id TEXT, -- NULL if in the "Cup" (Deck)
      location TEXT, -- 'DECK', 'HAND', 'BOARD', 'DISCARD', 'BANK'
      territory_id TEXT, -- NULL if in Hand/Deck. Points to territory if on board.
      template_id TEXT,
      is_face_up BOOLEAN DEFAULT 0,
      FOREIGN KEY(game_id) REFERENCES games(id),
      FOREIGN KEY(owner_id) REFERENCES players(id),
      FOREIGN KEY(territory_id) REFERENCES territories(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("Database initialized");
}

export { db };
