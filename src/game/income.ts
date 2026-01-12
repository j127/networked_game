import { db } from "../db";
import { players, territories, logs } from "../db/schema";
import { eq, and } from "drizzle-orm";
// import { getPlayersInGame } from "../db/queries"; // Circular dependency risk? imports db/index -> schema -> queries -> db/index.
// Queries imports db/index.
// Income imports db/index.
// Schema doesn't import db.
// So getPlayersInGame is safe if queries doesn't import income.
import { getPlayersInGame } from "../db/queries";

export async function performIncomePhase(gameId: string) {
  const playerList = await getPlayersInGame(gameId);

  db.transaction(() => {
    for (const player of playerList) {
      // Base income
      const ownedTerritories = db
        .select()
        .from(territories)
        .where(
          and(
            eq(territories.owner_id, player.id),
            eq(territories.game_id, gameId)
          )
        )
        .all();

      let income = 0;
      if (ownedTerritories.length > 0) {
        income += 5;
        for (const t of ownedTerritories) {
          income += 1;
          if (t.settlement_type === "CITY") income += 2;
          if (t.settlement_type === "VILLAGE") income += 1;
          // MINE_GOLD is string check
          if (t.settlement_type === "MINE_GOLD") income += 5;
        }
      }

      // Update Gold
      db.update(players)
        .set({ gold: player.gold + income }) // player.gold is current snapshot? Yes.
        .where(eq(players.id, player.id))
        .run();

      // Log it
      db.insert(logs)
        .values({
          game_id: gameId,
          message: `Player ${player.name} received ${income} gold.`,
        })
        .run();
    }
  }) as unknown; // bun:sqlite transaction returns a function to execute, but drizzle transaction() executes immediately?
  // drizzle-orm/bun-sqlite: db.transaction(tx => ...) executes immediately.
}
