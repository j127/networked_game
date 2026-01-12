import { db } from "../db";
import { territories, players, games, things } from "../db/schema";
import { getGame } from "../db/queries";
import { eq, and, sql, inArray } from "drizzle-orm";
import { THING_TEMPLATES } from "./data";
import { startFightCombat } from "./combat";

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
    if (!options.accept) {
      await db
        .update(territories)
        .set({ location: "DECK", owner_id: null })
        .where(eq(territories.id, land.id))
        .run();
    } else {
      const defenderIds: string[] = [];
      const nonCharacterIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        const tile = await db
          .select()
          .from(things)
          .where(and(eq(things.game_id, gameId), eq(things.location, "DECK")))
          .orderBy(sql`RANDOM()`)
          .limit(1)
          .get();
        if (!tile) break;

        await db
          .update(things)
          .set({ location: "DISCARD" })
          .where(eq(things.id, tile.id))
          .run();

        const template = THING_TEMPLATES[tile.template_id || ""];
        const isCharacter = template?.kind === "CHARACTER";
        if (!isCharacter) {
          nonCharacterIds.push(tile.id);
          continue;
        }

        await db
          .update(things)
          .set({ location: "FIGHT", territory_id: land.id, owner_id: null })
          .where(eq(things.id, tile.id))
          .run();
        defenderIds.push(tile.id);
      }

      if (nonCharacterIds.length > 0) {
        await db
          .update(things)
          .set({ location: "DECK", owner_id: null, territory_id: null })
          .where(inArray(things.id, nonCharacterIds))
          .run();
      }

      if (defenderIds.length === 0) {
        await db
          .update(territories)
          .set({ location: "BOARD", owner_id: playerId })
          .where(eq(territories.id, land.id))
          .run();
      } else {
        const attackers = await db
          .select()
          .from(things)
          .where(and(eq(things.owner_id, playerId), eq(things.location, "BOARD")))
          .all();
        const attackerIds = attackers.map((unit) => unit.id);
        if (attackerIds.length === 0) {
          await db
            .update(territories)
            .set({ owner_id: null, location: "DECK" })
            .where(eq(territories.id, land.id))
            .run();
          await db
            .update(things)
            .set({ location: "DECK", owner_id: null, territory_id: null })
            .where(inArray(things.id, defenderIds))
            .run();
        } else {
          await startFightCombat(gameId, playerId, land.id, defenderIds, attackerIds);
        }
      }
    }
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
