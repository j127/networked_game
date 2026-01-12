import { db } from "../db";
import { players, territories, logs, things } from "../db/schema";
import { eq, and } from "drizzle-orm";
// import { getPlayersInGame } from "../db/queries"; // Circular dependency risk? imports db/index -> schema -> queries -> db/index.
// Queries imports db/index.
// Income imports db/index.
// Schema doesn't import db.
// So getPlayersInGame is safe if queries doesn't import income.
import { getPlayersInGame } from "../db/queries";
import { THING_TEMPLATES } from "./data";

export async function performIncomePhase(gameId: string) {
  const playerList = await getPlayersInGame(gameId);

  for (const player of playerList) {
    const ownedTerritories = await db
      .select()
      .from(territories)
      .where(
        and(
          eq(territories.owner_id, player.id),
          eq(territories.game_id, gameId),
          eq(territories.location, "BOARD")
        )
      )
      .all();

    let income = 0;
    const landCount = ownedTerritories.length;
    if (landCount > 0) {
      income += landCount;
      for (const t of ownedTerritories) {
        income += t.fortification_level || 0;
        income += t.settlement_value || 0;
      }
    }

    const standingArmy = await db
      .select()
      .from(things)
      .where(and(eq(things.owner_id, player.id), eq(things.location, "BOARD")))
      .all();
    const hasDwarfKing = standingArmy.some(
      (unit) => THING_TEMPLATES[unit.template_id || ""]?.id === "dwarf_king"
    );
    if (hasDwarfKing) {
      income += 1;
    }

    await db
      .update(players)
      .set({ gold: player.gold + income })
      .where(eq(players.id, player.id))
      .run();

    const prestigeFromHoldings = calculateHoldingsPrestige(ownedTerritories);
    const prestigeFromGold = Math.floor((player.gold + income) / 10);
    const prestigeFromSpecials = standingArmy.filter((unit) => {
      const template = THING_TEMPLATES[unit.template_id || ""];
      return template?.kind === "SPECIAL";
    }).length;
    const prestigeTotal =
      prestigeFromHoldings + prestigeFromGold + prestigeFromSpecials;

    await db
      .update(players)
      .set({ prestige: prestigeTotal })
      .where(eq(players.id, player.id))
      .run();

    await db
      .insert(logs)
      .values({
        game_id: gameId,
        message: `Player ${player.name} received ${income} gold and has ${prestigeTotal} prestige.`,
      })
      .run();
  }
}

function calculateHoldingsPrestige(ownedTerritories: typeof territories.$inferSelect[]) {
  let total = ownedTerritories.length;
  for (const t of ownedTerritories) {
    total += t.fortification_level || 0;
    total += t.settlement_value || 0;
  }
  return total;
}
