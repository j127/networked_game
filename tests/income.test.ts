import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";

describe("income phase", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calculates gold and prestige from holdings and specials", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-income-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories, things } = await import("../src/db/schema");
    const { performIncomePhase } = await import("../src/game/income");

    await initDB();

    const gameId = "game-income";
    const playerId = "player-1";

    await db
      .insert(games)
      .values({ id: gameId, status: "ACTIVE", current_phase: "INCOME" })
      .run();
    await db
      .insert(players)
      .values({ id: playerId, game_id: gameId, name: "Test", color: "red", gold: 0 })
      .run();

    await db
      .insert(territories)
      .values([
        {
          id: "land-1",
          game_id: gameId,
          owner_id: playerId,
          location: "BOARD",
          terrain_type: "PLAINS",
          fortification_level: 2,
          settlement_type: "CITY",
          settlement_value: 2,
        },
        {
          id: "land-2",
          game_id: gameId,
          owner_id: playerId,
          location: "BOARD",
          terrain_type: "FOREST",
          fortification_level: 0,
          settlement_type: null,
          settlement_value: 0,
        },
      ])
      .run();

    await db
      .insert(things)
      .values({
        id: "dwarf-king",
        game_id: gameId,
        owner_id: playerId,
        location: "BOARD",
        template_id: "dwarf_king",
      })
      .run();

    await performIncomePhase(gameId);

    const updatedPlayer = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId))
      .get();
    expect(updatedPlayer?.gold).toBe(7);
    expect(updatedPlayer?.prestige).toBe(7);
  });
});
