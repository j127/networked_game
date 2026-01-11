import { db } from "../db";
import { getGame, getPlayersInGame } from "../db/queries";

export const PHASES = ["INCOME", "EVENTS", "ACQUIRE", "WAR"] as const;

export function advancePhase(gameId: string) {
  const game = getGame(gameId);
  if (!game) throw new Error("Game not found");

  const currentPhaseIndex = PHASES.indexOf(game.current_phase as any);
  if (currentPhaseIndex === -1 && game.current_phase !== "SETUP") {
    throw new Error(`Invalid phase ${game.current_phase}`);
  }

  if (game.current_phase === "VARIOUS_SUB_PHASES_OF_WAR") {
    // Logic for war sub-phases logic if needed
    // But typically WAR is the high level phase.
  }

  let nextPhaseIndex = currentPhaseIndex + 1;

  if (nextPhaseIndex >= PHASES.length) {
    // End of Turn
    endTurn(gameId);
  } else {
    const nextPhase = PHASES[nextPhaseIndex];
    if (nextPhase) {
      db.run("UPDATE games SET current_phase = ? WHERE id = ?", [
        nextPhase,
        gameId,
      ]);
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

  db.run(
    `
    UPDATE games
    SET turn_player_index = ?,
        current_phase = 'INCOME'
    WHERE id = ?`,
    [nextPlayerIndex, gameId]
  );

  // Maybe auto-trigger Income calculation for next player?
  // "Phase 1: Collection... 1. Income: Server runs query..."
  // Yes, we could allow the player to click "Start Turn" or auto-calculate.
}

export function performIncomePhase(gameId: string, playerId: string) {
  // Check if it is this player's turn
  const game = getGame(gameId);
  if (!game) return;
  // TODO: Check player index match

  // Calculate gold based on territories
  // db.query('SELECT * FROM territories WHERE owner_id = ?')...
  // Update player gold
}
