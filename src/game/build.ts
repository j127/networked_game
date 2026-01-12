import { db } from "../db";
import { territories, players, things } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getGame } from "../db/queries";
import { THING_TEMPLATES } from "./data";

const FORTIFICATION_COST = 10;

export async function buildStructure(
  gameId: string,
  playerId: string,
  territoryId: string
) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");
  // Allow building in INCOME phase (Phase 1)
  if (game.current_phase !== "INCOME")
    throw new Error("Can only build during INCOME phase");

  const territory = await db
    .select()
    .from(territories)
    .where(
      and(eq(territories.id, territoryId), eq(territories.game_id, gameId))
    )
    .get();
  if (!territory) throw new Error("Territory not found");
  if (territory.location !== "BOARD") throw new Error("Territory not on board");
  if (territory.owner_id !== playerId)
    throw new Error("You don't own this territory");

  const currentLevel = territory.fortification_level || 0;
  if (currentLevel >= 4) throw new Error("Max fortification reached");
  if ((territory.last_fort_build_turn || 0) >= (game.turn_number || 1)) {
    throw new Error("Only one fortification level may be built per land per turn");
  }

  const nextLevel = currentLevel + 1;
  const cost = FORTIFICATION_COST;

  // Check Gold
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .get();
  if (!player) throw new Error("Player not found");
  if ((player.gold || 0) < cost)
    throw new Error(`Not enough gold. Need ${cost}`);

  if (nextLevel === 4) {
    const existingGran = await db
      .select()
      .from(territories)
      .where(
        and(
          eq(territories.game_id, gameId),
          eq(territories.owner_id, playerId),
          eq(territories.fortification_level, 4)
        )
      )
      .all();
    if (existingGran.length > 0) {
      throw new Error("Only one Gran Muniment is allowed");
    }
  }

  // Deduct Gold and Upgrade
  await db.transaction(async () => {
    await db
      .update(players)
      .set({ gold: (player.gold || 0) - cost })
      .where(eq(players.id, playerId))
      .run();

    await db
      .update(territories)
      .set({
        fortification_level: nextLevel,
        last_fort_build_turn: game.turn_number || 1,
      })
      .where(eq(territories.id, territoryId))
      .run();
  });

  return { nextLevel, cost };
}

export async function buildSettlement(
  gameId: string,
  playerId: string,
  territoryId: string,
  thingId: string
) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "INCOME") {
    throw new Error("Can only build during INCOME phase");
  }

  const territory = await db
    .select()
    .from(territories)
    .where(
      and(eq(territories.id, territoryId), eq(territories.game_id, gameId))
    )
    .get();
  if (!territory) throw new Error("Territory not found");
  if (territory.location !== "BOARD") throw new Error("Territory not on board");
  if (territory.owner_id !== playerId)
    throw new Error("You don't own this territory");
  if ((territory.last_settlement_build_turn || 0) >= (game.turn_number || 1)) {
    throw new Error("Only one settlement may be built per land per turn");
  }

  const tile = await db
    .select()
    .from(things)
    .where(and(eq(things.id, thingId), eq(things.game_id, gameId)))
    .get();
  if (!tile) throw new Error("Tile not found");
  if (tile.owner_id !== playerId || tile.location !== "HAND") {
    throw new Error("Settlement tile must be in your hand");
  }

  const template = THING_TEMPLATES[tile.template_id || ""];
  if (!template || (template.kind !== "SETTLEMENT" && template.kind !== "MINE")) {
    throw new Error("Tile is not a settlement or mine");
  }

  if (template.kind === "MINE" && territory.terrain_type !== "MOUNTAIN") {
    throw new Error("Mines may only be placed on Mountains");
  }

  await db.transaction(async () => {
    await db
      .update(territories)
      .set({
        settlement_type: template.settlementType || null,
        settlement_value: template.goldValue || 0,
        last_settlement_build_turn: game.turn_number || 1,
      })
      .where(eq(territories.id, territoryId))
      .run();

    await db
      .update(things)
      .set({ location: "DISCARD" })
      .where(eq(things.id, thingId))
      .run();
  });

  return {
    settlementType: template.settlementType,
    settlementValue: template.goldValue || 0,
  };
}
