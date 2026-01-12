import { db } from "../db";
import { territories, players, games } from "../db/schema";
import { getGame } from "../db/queries";
import { eq, and, sql, inArray } from "drizzle-orm";

export async function drawLand(gameId: string, playerId: string) {
  // 1. Check phase
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (game.current_phase !== "ACQUIRE") {
    throw new Error("Can only draw land in ACQUIRE phase");
  }
  if (game.land_draw_state) {
    throw new Error("Resolve the previous land instruction before drawing again");
  }

  const instructionIds: string[] = [];
  let lastInstruction: { type: string; value?: number; tileId: string } | null =
    null;
  let land = null;

  while (!land) {
    const tile = await db
      .select()
      .from(territories)
      .where(
        and(eq(territories.game_id, gameId), eq(territories.location, "DECK"))
      )
      .orderBy(sql`RANDOM()`)
      .limit(1)
      .get();
    if (!tile) {
      throw new Error("No land cards left in deck");
    }

      if (tile.instruction_type) {
        instructionIds.push(tile.id);
        lastInstruction = {
          type: tile.instruction_type,
          value: tile.instruction_value ?? undefined,
          tileId: tile.id,
        };
      await db
        .update(territories)
        .set({ location: "DISCARD" })
        .where(eq(territories.id, tile.id))
        .run();
      continue;
    }

    land = tile;
  }

  if (!lastInstruction) {
    await db
      .update(territories)
      .set({ location: "BOARD", owner_id: playerId })
      .where(eq(territories.id, land.id))
      .run();
    return { status: "CLAIMED", land };
  }

  await db
    .update(territories)
    .set({ location: "DISCARD" })
    .where(eq(territories.id, land.id))
    .run();

  const state = {
    landId: land.id,
    instructionType: lastInstruction.type,
    instructionValue: lastInstruction.value ?? null,
    instructionTileId: lastInstruction.tileId,
    drawnInstructionIds: instructionIds,
  };

  await db
    .update(games)
    .set({ land_draw_state: JSON.stringify(state) })
    .where(eq(games.id, gameId))
    .run();

  return { status: "INSTRUCTION", instruction: state };
}

export async function resolveLandInstruction(
  gameId: string,
  playerId: string,
  options: { accept?: boolean; bidAmount?: number; winnerId?: string }
) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");
  if (!game.land_draw_state) throw new Error("No land instruction pending");

  const state = JSON.parse(game.land_draw_state) as {
    landId: string;
    instructionType: string;
    instructionValue: number | null;
    instructionTileId: string;
    drawnInstructionIds: string[];
  };

  const land = await db
    .select()
    .from(territories)
    .where(eq(territories.id, state.landId))
    .get();
  if (!land) throw new Error("Land tile not found");

  if (state.instructionType === "FOR_SALE") {
    const cost = state.instructionValue || 0;
    const player = await db
      .select()
      .from(players)
      .where(and(eq(players.id, playerId), eq(players.game_id, gameId)))
      .get();
    if (!player) throw new Error("Player not found");
    if (options.accept && (player.gold || 0) < cost) {
      throw new Error(`Not enough gold (${cost} required)`);
    }
    if (options.accept) {
      await db.transaction(async () => {
        await db
          .update(players)
          .set({ gold: (player.gold || 0) - cost })
          .where(eq(players.id, playerId))
          .run();
        await db
          .update(territories)
          .set({ location: "BOARD", owner_id: playerId })
          .where(eq(territories.id, land.id))
          .run();
      });
    } else {
      await db
        .update(territories)
        .set({ location: "DECK", owner_id: null })
        .where(eq(territories.id, land.id))
        .run();
    }
  } else if (state.instructionType === "PUBLIC_AUCTION") {
    const winnerId = options.winnerId || playerId;
    const bidAmount = options.bidAmount || 0;
    const winner = await db
      .select()
      .from(players)
      .where(and(eq(players.id, winnerId), eq(players.game_id, gameId)))
      .get();
    if (!winner) throw new Error("Winner not found");
    if ((winner.gold || 0) < bidAmount) {
      throw new Error("Winner cannot cover bid");
    }
    await db.transaction(async () => {
      await db
        .update(players)
        .set({ gold: (winner.gold || 0) - bidAmount })
        .where(eq(players.id, winnerId))
        .run();
      await db
        .update(territories)
        .set({ location: "BOARD", owner_id: winnerId })
        .where(eq(territories.id, land.id))
        .run();
    });
  } else if (state.instructionType === "FIGHT") {
    throw new Error("FIGHT land instruction not implemented yet");
  } else {
    throw new Error("Unknown land instruction");
  }

  const restoreIds = state.drawnInstructionIds.filter(
    (id) => id !== state.instructionTileId
  );
  if (restoreIds.length > 0) {
    await db
      .update(territories)
      .set({ location: "DECK" })
      .where(inArray(territories.id, restoreIds))
      .run();
  }
  await db
    .update(territories)
    .set({ location: "DECK" })
    .where(eq(territories.id, state.instructionTileId))
    .run();

  await db
    .update(games)
    .set({ land_draw_state: null })
    .where(eq(games.id, gameId))
    .run();

  return { success: true };
}
