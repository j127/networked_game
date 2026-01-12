import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";

describe("purchase tiles", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("charges the correct cost and moves tiles to hand", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-purchase-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, things } = await import("../src/db/schema");
    const { purchaseTiles } = await import("../src/game/unit_actions");

    await initDB();

    const gameId = "game-buy";
    const playerId = "player-buy";

    await db
      .insert(games)
      .values({ id: gameId, status: "ACTIVE", current_phase: "ACQUIRE" })
      .run();
    await db
      .insert(players)
      .values({ id: playerId, game_id: gameId, name: "Buyer", color: "blue", gold: 10 })
      .run();
    await db
      .insert(things)
      .values([
        { id: "tile-1", game_id: gameId, location: "DECK", template_id: "farmers" },
        { id: "tile-2", game_id: gameId, location: "DECK", template_id: "farmers" },
      ])
      .run();

    const tiles = await purchaseTiles(gameId, playerId, 2);
    expect(tiles.length).toBe(2);

    const updatedPlayer = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId))
      .get();
    expect(updatedPlayer?.gold).toBe(5);

    const handTiles = await db
      .select()
      .from(things)
      .where(and(eq(things.owner_id, playerId), eq(things.location, "HAND")))
      .all();
    expect(handTiles.length).toBe(2);
  });
});
