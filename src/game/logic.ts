import { db } from "../db";
import { games } from "../db/schema";
import { getGame, getPlayersInGame } from "../db/queries";
import { performIncomePhase } from "./income";
import { eq } from "drizzle-orm";

export const PHASES = ["INCOME", "EVENTS", "ACQUIRE", "WAR"] as const;

export function advancePhase(gameId: string) {
  const game = getGame(gameId);
  if (!game) throw new Error("Game not found");

  const currentPhaseIndex = PHASES.indexOf(game.current_phase as any);
  if (currentPhaseIndex === -1 && game.current_phase !== "SETUP") {
    throw new Error(`Invalid phase ${game.current_phase}`);
  }

  let nextPhaseIndex = currentPhaseIndex + 1;

  if (nextPhaseIndex >= PHASES.length) {
    // End of Turn
    endTurn(gameId);
  } else {
    const nextPhase = PHASES[nextPhaseIndex];
    if (nextPhase) {
      db.update(games)
        .set({ current_phase: nextPhase })
        .where(eq(games.id, gameId))
        .run();

      // Hook for entering specific phases
      if (nextPhase === "INCOME") {
        performIncomePhase(gameId);
      }

      return nextPhase;
    }
    return nextPhase;
  }
}

export function endTurn(gameId: string) {
  const game = getGame(gameId);
  if (!game) throw new Error("Game not found");

  const players = getPlayersInGame(gameId);
  if (players.length === 0) return; // Should not happen

  const nextPlayerIndex = (game.turn_player_index + 1) % players.length;

  db.update(games)
    .set({
      turn_player_index: nextPlayerIndex,
      current_phase: "INCOME",
    })
    .where(eq(games.id, gameId))
    .run();

  // New turn starts with Income
  performIncomePhase(gameId);
}
