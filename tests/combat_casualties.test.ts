import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";

describe("combat casualties", () => {
  it("keeps Sword Master alive after one hit", async () => {
    process.env.KOTT_DB_PATH = `/tmp/kott-combat-casualties-${Date.now()}-${Math.random()}.sqlite`;
    const { db, initDB } = await import("../src/db/index");
    const { games, players, territories, things } = await import("../src/db/schema");
    const { assignCasualties } = await import("../src/game/combat");

    await initDB();

    const gameId = "game-1";
    const attackerId = "attacker-1";
    const defenderId = "defender-1";
    const territoryId = "territory-1";
    const swordId = "unit-sword";
    const defenderUnitId = "unit-defender";

    await db
      .insert(games)
      .values({ id: gameId, status: "ACTIVE", current_phase: "WAR" })
      .run();
    await db
      .insert(players)
      .values([
        { id: attackerId, game_id: gameId, name: "Attacker", color: "red" },
        { id: defenderId, game_id: gameId, name: "Defender", color: "blue" },
      ])
      .run();
    await db
      .insert(territories)
      .values({
        id: territoryId,
        game_id: gameId,
        owner_id: defenderId,
        terrain_type: "PLAINS",
      })
      .run();
    await db
      .insert(things)
      .values([
        {
          id: swordId,
          game_id: gameId,
          owner_id: attackerId,
          location: "BOARD",
          territory_id: territoryId,
          template_id: "sword_master",
        },
        {
          id: defenderUnitId,
          game_id: gameId,
          owner_id: defenderId,
          location: "BOARD",
          territory_id: territoryId,
          template_id: "bear",
        },
      ])
      .run();

    const combatState = {
      attackerId,
      defenderId,
      territoryId,
      attackerUnitIds: [swordId],
      defenderUnitIds: [defenderUnitId],
      defenderAllUnitIds: [defenderUnitId],
      stage: "RANGED",
      logs: [],
      fortRemaining: 0,
      combatType: "PVP",
      pendingCasualties: [
        {
          playerId: attackerId,
          hits: 1,
          stage: "RANGED",
          availableUnitIds: [swordId],
        },
      ],
      pendingStage: "RANGED",
      unitDamage: {},
    };

    await db
      .update(games)
      .set({ combat_state: JSON.stringify(combatState) })
      .where(eq(games.id, gameId))
      .run();

    await assignCasualties(gameId, attackerId, [swordId]);

    const updated = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .get();
    const updatedState = JSON.parse(updated?.combat_state as string);
    expect(updatedState.attackerUnitIds).toContain(swordId);
    expect(updatedState.unitDamage[swordId]).toBe(1);
    expect(updatedState.stage).toBe("MELEE");
  });
});
