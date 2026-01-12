import { db } from "../db";
import { territories, players } from "../db/schema";
import { eq } from "drizzle-orm";
import { getGame } from "../db/queries";

const FORTIFICATION_COSTS = {
    1: 5, // Tower
    2: 10, // Keep
    3: 15, // Castle
    4: 20  // Citadel
};

export function buildStructure(gameId: string, playerId: string, territoryId: string) {
    const game = getGame(gameId);
    if (!game) throw new Error("Game not found");
    // Allow building in INCOME phase (Phase 1)
    if (game.current_phase !== "INCOME") throw new Error("Can only build during INCOME phase");

    const territory = db.select().from(territories).where(eq(territories.id, territoryId)).get();
    if (!territory) throw new Error("Territory not found");
    if (territory.owner_id !== playerId) throw new Error("You don't own this territory");

    const currentLevel = territory.fortification_level || 0;
    if (currentLevel >= 4) throw new Error("Max fortification reached");

    const nextLevel = currentLevel + 1;
    const cost = (FORTIFICATION_COSTS as any)[nextLevel];
    
    // Check Gold
    const player = db.select().from(players).where(eq(players.id, playerId)).get();
    if (!player) throw new Error("Player not found");
    if ((player.gold || 0) < cost) throw new Error(`Not enough gold. Need ${cost}`);

    // Deduct Gold and Upgrade
    db.transaction(() => {
        db.update(players)
          .set({ gold: (player.gold || 0) - cost })
          .where(eq(players.id, playerId))
          .run();
          
        db.update(territories)
          .set({ fortification_level: nextLevel })
          .where(eq(territories.id, territoryId))
          .run();
    });
    
    return { nextLevel, cost };
}
