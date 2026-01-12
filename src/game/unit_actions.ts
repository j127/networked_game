import { db } from "../db";
import { things, players, territories } from "../db/schema";
import { getGame } from "../db/queries";
import { eq, and, sql } from "drizzle-orm";

export function drawThing(gameId: string, playerId: string) {
  const game = getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "ACQUIRE") {
    throw new Error("Can only draw units in ACQUIRE phase");
  }

  // Check Gold
  const player = db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .get();
  if (!player) throw new Error("Player not found");
  if ((player.gold || 0) < 5) throw new Error("Not enough gold (5 required)");

  // Pick random thing from deck
  const thing = db
    .select()
    .from(things)
    .where(and(eq(things.game_id, gameId), eq(things.location, "DECK")))
    .orderBy(sql`RANDOM()`)
    .limit(1)
    .get();

  if (!thing) throw new Error("No units left in deck");

  // Transaction: deduct gold, move thing to hand
  db.transaction(() => {
    db.update(players)
      .set({ gold: player.gold - 5 })
      .where(eq(players.id, playerId))
      .run();

    db.update(things)
      .set({ location: "HAND", owner_id: playerId })
      .where(eq(things.id, thing.id))
      .run();
  });

  return thing;
}

export function deployThing(
  gameId: string,
  playerId: string,
  thingId: string,
  territoryId: string
) {
  const game = getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "ACQUIRE") {
    throw new Error("Can only deploy units in ACQUIRE phase");
  }

  // 1. Verify Thing ownership and location
  const thing = db.select().from(things).where(eq(things.id, thingId)).get();
  if (!thing) throw new Error("Unit not found");
  if (thing.owner_id !== playerId) throw new Error("You don't own this unit");
  if (thing.location !== "HAND") throw new Error("Unit is not in hand");

  // 2. Verify Territory ownership
  const territory = db
    .select()
    .from(territories)
    .where(eq(territories.id, territoryId))
    .get();
  if (!territory) throw new Error("Territory not found");
  if (territory.owner_id !== playerId)
    throw new Error("You don't own this territory");

  // 3. Deploy
  db.update(things)
    .set({ location: "BOARD", territory_id: territoryId })
    .where(eq(things.id, thingId))
    .run();

  return thing;
}
