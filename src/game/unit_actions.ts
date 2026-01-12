import { db } from "../db";
import { things, players, territories, games } from "../db/schema";
import { getGame } from "../db/queries";
import { eq, and, sql } from "drizzle-orm";
import { THING_TEMPLATES } from "./data";

const PURCHASE_COSTS: Record<number, number> = {
  1: 2,
  2: 5,
  3: 10,
  4: 20,
};

export async function purchaseTiles(gameId: string, playerId: string, count: number) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "ACQUIRE") {
    throw new Error("Can only buy tiles in ACQUIRE phase");
  }
  if (!PURCHASE_COSTS[count]) throw new Error("Can only buy 1 to 4 tiles");
  if (game.turn_purchase_used) throw new Error("Already purchased tiles this turn");

  // Check Gold
  const player = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.game_id, gameId)))
    .get();
  if (!player) throw new Error("Player not found");
  const cost = PURCHASE_COSTS[count];
  if ((player.gold || 0) < cost) throw new Error(`Not enough gold (${cost} required)`);

  const drawnTiles = [];
  for (let i = 0; i < count; i++) {
    const thing = await db
      .select()
      .from(things)
      .where(and(eq(things.game_id, gameId), eq(things.location, "DECK")))
      .orderBy(sql`RANDOM()`)
      .limit(1)
      .get();
    if (!thing) break;
    drawnTiles.push(thing);
    await db
      .update(things)
      .set({ location: "HAND", owner_id: playerId })
      .where(eq(things.id, thing.id))
      .run();
  }

  if (drawnTiles.length === 0) throw new Error("No tiles left in deck");

  await db
    .update(players)
    .set({ gold: player.gold - cost })
    .where(eq(players.id, playerId))
    .run();
  await db
    .update(games)
    .set({ turn_purchase_used: 1 })
    .where(eq(games.id, gameId))
    .run();

  return drawnTiles;
}

export async function freeDrawTile(gameId: string, playerId: string) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "ACQUIRE") {
    throw new Error("Can only draw during ACQUIRE phase");
  }
  if (game.turn_free_draw_used) throw new Error("Free draw already used this turn");

  const player = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.game_id, gameId)))
    .get();
  if (!player) throw new Error("Player not found");

  const thing = await db
    .select()
    .from(things)
    .where(and(eq(things.game_id, gameId), eq(things.location, "DECK")))
    .orderBy(sql`RANDOM()`)
    .limit(1)
    .get();
  if (!thing) throw new Error("No tiles left in deck");

  await db
    .update(things)
    .set({ location: "HAND", owner_id: playerId })
    .where(eq(things.id, thing.id))
    .run();
  await db
    .update(games)
    .set({ turn_free_draw_used: 1 })
    .where(eq(games.id, gameId))
    .run();

  return thing;
}

export async function deployThing(
  gameId: string,
  playerId: string,
  thingId: string,
  territoryId: string
) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "ACQUIRE") {
    throw new Error("Can only deploy units in ACQUIRE phase");
  }

  // 1. Verify Thing ownership and location
  const thing = await db
    .select()
    .from(things)
    .where(and(eq(things.id, thingId), eq(things.game_id, gameId)))
    .get();
  if (!thing) throw new Error("Unit not found");
  if (thing.owner_id !== playerId) throw new Error("You don't own this unit");
  if (thing.location !== "HAND") throw new Error("Unit is not in hand");

  const template = THING_TEMPLATES[thing.template_id || ""];
  if (!template || (template.kind !== "CHARACTER" && template.kind !== "SPECIAL")) {
    throw new Error("Only character tiles can be deployed");
  }

  // 2. Verify Territory ownership
  const territory = await db
    .select()
    .from(territories)
    .where(
      and(eq(territories.id, territoryId), eq(territories.game_id, gameId))
    )
    .get();
  if (!territory) throw new Error("Territory not found");
  if (territory.location !== "BOARD")
    throw new Error("Territory not on board");
  if (territory.owner_id !== playerId)
    throw new Error("You don't own this territory");

  // 3. Deploy
  await db
    .update(things)
    .set({ location: "BOARD", territory_id: territoryId })
    .where(eq(things.id, thingId))
    .run();

  return thing;
}
