import { db } from "../db";
import { territories } from "../db/schema";
import { getGame } from "../db/queries";
import { eq, and, sql } from "drizzle-orm";

export function drawLand(gameId: string, playerId: string) {
  // 1. Check phase
  const game = getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "ACQUIRE") {
    throw new Error("Can only draw land in ACQUIRE phase");
  }

  // 3. Pick random land from deck
  // SQLite random: ORDER BY RANDOM()
  // Drizzle equivalent: orderBy(sql`RANDOM()`)
  const land = db
    .select()
    .from(territories)
    .where(
      and(eq(territories.game_id, gameId), eq(territories.location, "DECK"))
    )
    .orderBy(sql`RANDOM()`)
    .limit(1)
    .get();

  if (!land) {
    throw new Error("No land cards left in deck");
  }

  // 4. Update land to board/owned
  db.update(territories)
    .set({ location: "BOARD", owner_id: playerId })
    .where(eq(territories.id, land.id))
    .run();

  return land;
}
