import { db } from "../db";
import { things, territories, players, games } from "../db/schema";
import {
  PLAYING_DECK_DISTRIBUTION,
  THING_TEMPLATES,
  LAND_DECK_DISTRIBUTION,
  LAND_INSTRUCTION_TILES,
  SPECIAL_CHARACTER_IDS,
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
        terrain_type: item.type,
      });
    }
  }

  for (const instruction of LAND_INSTRUCTION_TILES) {
    for (let i = 0; i < instruction.count; i++) {
      lands.push({
        id: crypto.randomUUID(),
        game_id: gameId,
        location: "DECK",
        instruction_type: instruction.type,
        instruction_value: instruction.value ?? null,
      });
    }
  }

  db.insert(territories).values(lands).run();

  return lands.length;
}

export function seedDeck(gameId: string) {
  const deck = [];
  for (const item of PLAYING_DECK_DISTRIBUTION) {
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

export function seedSpecialCharacters(gameId: string) {
  const specials = SPECIAL_CHARACTER_IDS.map((id) => ({
    id: crypto.randomUUID(),
    game_id: gameId,
    location: "BANK",
    template_id: id,
  }));

  db.insert(things).values(specials).run();

  return specials.length;
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
  seedSpecialCharacters(gameId);

  // 4. Give Starting Gold (e.g. 10)
  db.update(players).set({ gold: 10 }).where(eq(players.game_id, gameId)).run();
}
