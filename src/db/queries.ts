import { db } from "./index";

export function createGame(): string {
  const id = crypto.randomUUID();
  db.run("INSERT INTO games (id, status) VALUES (?, ?)", [id, "LOBBY"]);
  return id;
}

export interface Game {
  id: string;
  status: string;
  turn_player_index: number;
  current_phase: string;
  combat_state: string | null;
  created_at: string;
}

export function getGame(gameId: string): Game | null {
  return db
    .query("SELECT * FROM games WHERE id = ?")
    .get(gameId) as Game | null;
}

export function addPlayer(
  gameId: string,
  playerId: string,
  name: string,
  color: string
) {
  // Check if player already exists in this game to avoid duplicates if reconnecting with same storage
  const existing = db
    .query("SELECT * FROM players WHERE id = ? AND game_id = ?")
    .get(playerId, gameId);
  if (existing) return existing;

  db.run("INSERT INTO players (id, game_id, name, color) VALUES (?, ?, ?, ?)", [
    playerId,
    gameId,
    name,
    color,
  ]);
  return { id: playerId, game_id: gameId, name, color };
}

export function getPlayersInGame(gameId: string) {
  return db.query("SELECT * FROM players WHERE game_id = ?").all(gameId);
}

export function startGame(gameId: string) {
  db.run(
    "UPDATE games SET status = 'ACTIVE', current_phase = 'INCOME' WHERE id = ?",
    [gameId]
  );
}
