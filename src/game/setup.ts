import { db } from "../db";
import { things, territories, players, games } from "../db/schema";
import {
  DECK_DISTRIBUTION,
  THING_TEMPLATES,
  LAND_DECK_DISTRIBUTION,
} from "./data";
import { eq } from "drizzle-orm";

export function seedLandDeck(gameId: string) {
  const lands = [];
  for (const item of LAND_DECK_DISTRIBUTION) {
    for (let i = 0; i < item.count; i++) {
      lands.push({
        id: crypto.randomUUID(),
        game_id: gameId,
        location: "DECK",
        terrain_type: (item as any).type.toUpperCase(),
      });
    }
  }

  db.insert(territories).values(lands).run();

  return lands.length;
}

export function seedDeck(gameId: string) {
  const deck = [];
  for (const item of DECK_DISTRIBUTION) {
    for (let i = 0; i < item.count; i++) {
      deck.push({
        id: crypto.randomUUID(),
        game_id: gameId,
        location: "DECK",
        template_id: item.templateId,
      });
    }
  }

  db.insert(things).values(deck).run();

  return deck.length;
}

export function initializeGameInternal(gameId: string) {
  // 1. Update Game Status
  db.update(games)
    .set({ status: "ACTIVE", current_phase: "INCOME" })
    .where(eq(games.id, gameId))
    .run();

  // 2. Seed Decks
  seedDeck(gameId);
  seedLandDeck(gameId);

  // 4. Give Starting Gold (e.g. 10)
  db.update(players).set({ gold: 10 }).where(eq(players.game_id, gameId)).run();
}
