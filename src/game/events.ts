import { db } from "../db";
import { games, territories, logs } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { EVENTS_TABLE } from "./data";

export function performEventsPhase(gameId: string) {
    const roll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
    // Find event matching the roll
    const event = EVENTS_TABLE.find(e => e.roll === roll);
    
    let message = `Event Roll: ${roll}.`;
    
    if (event) {
        message += ` ${event.name}!`;
        applyEventEffect(gameId, event.effect);
    } else {
        message += ` clear skies.`;
    }

    db.insert(logs).values({
        game_id: gameId,
        message: message
    }).run();
}

function applyEventEffect(gameId: string, effect: string) {
    if (effect === "BURN_FOREST") {
        downgradeForts(gameId, "FOREST");
    } else if (effect === "BURN_PLAINS") {
        downgradeForts(gameId, "PLAINS");
    }
}

function downgradeForts(gameId: string, terrainType: string) {
    // Downgrade fortification level by 1 for all territories of this type
    const targets = db.select()
        .from(territories)
        .where(and(eq(territories.game_id, gameId), eq(territories.terrain_type, terrainType)))
        .all();

    for (const t of targets) {
        if ((t.fortification_level || 0) > 0) {
            db.update(territories)
              .set({ fortification_level: (t.fortification_level || 0) - 1 })
              .where(eq(territories.id, t.id))
              .run();
        }
    }
}
