import { db } from "./index";
import { games, players } from "./schema";
import { eq, and } from "drizzle-orm";
// import type { Player } from "./schema"; // Unused
// Actually, let's export types from schema.ts using InferSelectModel
import type { InferSelectModel } from "drizzle-orm";

export type Game = InferSelectModel<typeof games>;
export type PlayerType = InferSelectModel<typeof players>;

export function createGame(): string {
  const id = crypto.randomUUID();
  db.insert(games).values({ id, status: "LOBBY" }).run();
  return id;
}

export function getGame(gameId: string): Game | null {
  const result = db.select().from(games).where(eq(games.id, gameId)).get();
  return result || null;
}

export function addPlayer(
  gameId: string,
  playerId: string,
  name: string,
  color: string
): PlayerType {
  // Check if player already exists
  const existing = db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.game_id, gameId)))
    .get();

  if (existing) return existing;

  db.insert(players)
    .values({
      id: playerId,
      game_id: gameId,
      name,
      color,
      gold: 0,
      prestige: 0,
      is_eliminated: 0,
    })
    .run();

  // Return the newly created player object (or fetch it)
  // Drizzle with SQLite doesn't return inserted row by default in .run() unless using returning() which bun-sqlite might not fully support in run(), but .returning() works in queries.
  // Let's try .returning().get()
  const newPlayer = db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .get();
  if (!newPlayer) throw new Error("Failed to create player");
  return newPlayer;
}

export async function getPlayersInGame(gameId: string): Promise<PlayerType[]> {
  if (db.query?.players) {
    const raw = await db.query.players.findMany({
      where: eq(players.game_id, gameId),
      with: {
        territories: {
          with: {
            units: true,
          },
        },
        things: true,
      },
      // Note: In Drizzle, relations are not recursive by default unless specified.
      // However, if there are back-references in the result (e.g. unit -> owner -> unit), stringify fails.
      // We manually map to ensure a clean tree.
    });

    return (raw as any[]).map((p) => ({
      id: p.id,
      game_id: p.game_id,
      name: p.name,
      color: p.color,
      gold: p.gold,
      prestige: p.prestige,
      is_eliminated: p.is_eliminated,
      territories: p.territories?.map((t: any) => ({
        id: t.id,
        game_id: t.game_id,
        owner_id: t.owner_id,
        location: t.location,
        terrain_type: t.terrain_type,
        fortification_level: t.fortification_level,
        settlement_type: t.settlement_type,
        units: t.units?.map((u: any) => ({
          id: u.id,
          template_id: u.template_id,
          location: u.location,
          // Omit back-references
        })),
      })),
      things: p.things?.map((t: any) => ({
        id: t.id,
        game_id: t.game_id,
        owner_id: t.owner_id,
        location: t.location,
        template_id: t.template_id,
        is_face_up: t.is_face_up,
      })),
    })) as PlayerType[];
  }
  return db.select().from(players).where(eq(players.game_id, gameId)).all();
}

export function startGame(gameId: string) {
  db.update(games)
    .set({ status: "ACTIVE", current_phase: "INCOME" })
    .where(eq(games.id, gameId))
    .run();
}
