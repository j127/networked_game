import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";

describe("magic items", () => {
  it("attaches magic sword to a unit", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-magic-sword-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories, things } = await import("../src/db/schema");
    const { useMagicItem } = await import("../src/game/magic");

    await initDB();

    const gameId = "game-magic";
    const playerId = "player-magic";
    const territoryId = "territory-magic";
    const unitId = "unit-magic";
    const swordId = "sword-magic";

    await db.insert(games).values({ id: gameId, status: "ACTIVE", current_phase: "WAR" }).run();
    await db.insert(players).values({ id: playerId, game_id: gameId, name: "Mage", color: "blue" }).run();
    await db
      .insert(territories)
      .values({ id: territoryId, game_id: gameId, owner_id: playerId, terrain_type: "PLAINS", location: "BOARD" })
      .run();
    await db
      .insert(things)
      .values([
        {
          id: unitId,
          game_id: gameId,
          owner_id: playerId,
          location: "BOARD",
          territory_id: territoryId,
          template_id: "bear",
        },
        {
          id: swordId,
          game_id: gameId,
          owner_id: playerId,
          location: "HAND",
          template_id: "magic_sword",
        },
      ])
      .run();

    await useMagicItem(gameId, playerId, swordId, { targetUnitId: unitId });

    const sword = await db
      .select()
      .from(things)
      .where(eq(things.id, swordId))
      .get();
    expect(sword?.attached_to_thing_id).toBe(unitId);
    expect(sword?.location).toBe("BOARD");
  });
});
