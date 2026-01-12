import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";

describe("game logic", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("advances phase correctly", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-advance-phase-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players } = await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { advancePhase } = await import("../src/game/logic");

    await initDB();

    const gameId = await createGame();
    await addPlayer(gameId, "player-1", "Test", "red");

    // Start game to set initial phase
    await db.update(games).set({ status: "ACTIVE", current_phase: "INCOME" }).where(eq(games.id, gameId)).run();

    // Advance from INCOME to EVENTS
    const nextPhase = await advancePhase(gameId);
    expect(nextPhase).toBe("EVENTS");

    // Check game state
    const game = await db.select().from(games).where(eq(games.id, gameId)).get();
    expect(game?.current_phase).toBe("EVENTS");
  });

  it("handles end of turn correctly", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-end-turn-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players } = await import("../src/db/schema");
    const { createGame, addPlayer } = await import("../src/db/queries");
    const { advancePhase } = await import("../src/game/logic");

    await initDB();

    const gameId = await createGame();
    await addPlayer(gameId, "player-1", "Test", "red");
    await addPlayer(gameId, "player-2", "Test2", "blue");

    // Start game and advance to final phase
    await db.update(games).set({
      status: "ACTIVE",
      current_phase: "WAR",
      turn_number: 1,
      turn_player_index: 0
    }).where(eq(games.id, gameId)).run();

    // Advance from WAR (should trigger end of turn)
    await advancePhase(gameId);

    // Check game state after end of turn
    const game = await db.select().from(games).where(eq(games.id, gameId)).get();
    expect(game?.current_phase).toBe("INCOME");
    expect(game?.turn_number).toBe(2);
    expect(game?.turn_player_index).toBe(1); // Should advance to next player
  });

  it("throws error for invalid phase", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-invalid-phase-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games } = await import("../src/db/schema");
    const { createGame } = await import("../src/db/queries");
    const { advancePhase } = await import("../src/game/logic");

    await initDB();

    const gameId = await createGame();

    // Set invalid phase
    await db.update(games).set({ current_phase: "INVALID" }).where(eq(games.id, gameId)).run();

    await expect(advancePhase(gameId)).rejects.toThrow("Invalid phase INVALID");
  });

  it("throws error for non-existent game", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-no-game-${Date.now()}-${Math.random()}.sqlite`;
    const { initDB } = await import("../src/db/index");
    const { advancePhase } = await import("../src/game/logic");

    await initDB();

    await expect(advancePhase("non-existent")).rejects.toThrow("Game not found");
  });
});
