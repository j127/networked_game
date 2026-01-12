import { db } from "../db";
import { games, things, territories } from "../db/schema";
import { getGame, getPlayersInGame } from "../db/queries";
import { performIncomePhase } from "./income";
import { performEventsPhase } from "./events";
import { eq, and } from "drizzle-orm";

export const PHASES = ["INCOME", "EVENTS", "ACQUIRE", "WAR"] as const;

export async function advancePhase(gameId: string) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");

  const currentPhaseIndex = PHASES.indexOf(game.current_phase as any);
  if (currentPhaseIndex === -1 && game.current_phase !== "SETUP") {
    throw new Error(`Invalid phase ${game.current_phase}`);
  }

  let nextPhaseIndex = currentPhaseIndex + 1;

  if (nextPhaseIndex >= PHASES.length) {
    // End of Turn
    await endTurn(gameId);
  } else {
    const nextPhase = PHASES[nextPhaseIndex];
    if (nextPhase) {
      if (nextPhase === "WAR" && game.war_disabled) {
        await endTurn(gameId);
        return "INCOME";
      }

      const dispellExpired = game.magic_dispell_phase === game.current_phase;

      db.update(games)
        .set({
          current_phase: nextPhase,
          magic_dispell_player_id: dispellExpired
            ? null
            : game.magic_dispell_player_id,
          magic_dispell_phase: dispellExpired ? null : game.magic_dispell_phase,
        })
        .where(eq(games.id, gameId))
        .run();

      // Hook for entering specific phases
      if (nextPhase === "INCOME") {
        await performIncomePhase(gameId);
      } else if (nextPhase === "EVENTS") {
        await performEventsPhase(gameId);
      }

      return nextPhase;
    }
    return nextPhase;
  }
}

export async function endTurn(gameId: string) {
  const game = await getGame(gameId);
  if (!game) throw new Error("Game not found");

  const players = await getPlayersInGame(gameId);
  if (players.length === 0) return; // Should not happen

  const nextPlayerIndex = (game.turn_player_index + 1) % players.length;

  await cleanupWarMagic(gameId);

  db.update(games)
    .set({
      turn_player_index: nextPlayerIndex,
      current_phase: "INCOME",
      turn_number: (game.turn_number || 1) + 1,
      turn_free_draw_used: 0,
      turn_purchase_used: 0,
      land_draw_state: null,
      war_disabled: 0,
      magic_dispell_player_id: null,
      magic_dispell_phase: null,
    })
    .where(eq(games.id, gameId))
    .run();

  // New turn starts with Income
  await performIncomePhase(gameId);
}

async function cleanupWarMagic(gameId: string) {
  await db
    .update(things)
    .set({ location: "DECK", owner_id: null, territory_id: null })
    .where(
      and(eq(things.game_id, gameId), eq(things.template_id, "golem"))
    )
    .run();
  await db
    .update(territories)
    .set({ magic_fort_value: 0 })
    .where(eq(territories.game_id, gameId))
    .run();
}
