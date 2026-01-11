import { db } from "../db";
import { DECK_DISTRIBUTION, THING_TEMPLATES } from "./data";

export function seedDeck(gameId: string) {
  const insertStmt = db.prepare(`
    INSERT INTO things (id, game_id, owner_id, location, template_id, is_face_up)
    VALUES (?, ?, NULL, 'DECK', ?, 0)
  `);

  const things = [];
  for (const item of DECK_DISTRIBUTION) {
    for (let i = 0; i < item.count; i++) {
      things.push({
        id: crypto.randomUUID(),
        gameId,
        templateId: item.templateId,
      });
    }
  }

  // Shuffle array (optional, but DB retrieval without order is "random" enough usually, but strictly speaking SQL doesn't guarantee random without ORDER BY RANDOM())
  // But we insert them all. When drawing, we should pick random or top.
  // If we just pick "WHERE location='DECK' LIMIT 1", it's effectively one of them.
  // Ideally we pick random when drawing.

  const transaction = db.transaction((items) => {
    for (const thing of items) {
      insertStmt.run(thing.id, thing.gameId, thing.templateId);
    }
  });

  transaction(things);
  return things.length;
}

export function initializeGameInternal(gameId: string) {
  // 1. Update Game Status
  db.run(
    "UPDATE games SET status = 'ACTIVE', current_phase = 'INCOME' WHERE id = ?",
    [gameId]
  );

  // 2. Seed Deck
  seedDeck(gameId);

  // 3. Initialize Map? (Territories from Land Deck?)
  // Specs say: "Phase 3: Acquire Tiles -> 1. Land Draw... Random from LAND_DECK".
  // "Territory Management: ... Assigning land tiles to players"
  // So map starts empty?
  // "Phase 1: Collection... 1. Income: Query all territories where owner_id = ?"
  // "The physical board (The Land Deck that has been played)"
  // So territories are cards too?
  // Instructions: "The 'Land Deck' that has been played -> territories table"
  // So we need a LAND_DECK too.

  // For now, I'll just seed the Unit Deck (Things).
}
