import { db } from "../db";
import { games } from "../db/schema";
import { getGame, getPlayersInGame } from "../db/queries";
import { performIncomePhase } from "./income";
import { performEventsPhase } from "./events";
import { eq } from "drizzle-orm";

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
      db.update(games)
        .set({ current_phase: nextPhase })
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

  db.update(games)
    .set({
      turn_player_index: nextPlayerIndex,
      current_phase: "INCOME",
      turn_number: (game.turn_number || 1) + 1,
      turn_free_draw_used: 0,
      turn_purchase_used: 0,
      land_draw_state: null,
    })
    .where(eq(games.id, gameId))
    .run();

  // New turn starts with Income
  await performIncomePhase(gameId);
}
