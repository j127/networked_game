import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  status: text("status").default("LOBBY"), // LOBBY, ACTIVE, FINISHED
  turn_player_index: integer("turn_player_index").default(0),
  turn_number: integer("turn_number").default(1),
  current_phase: text("current_phase").default("SETUP"), // INCOME, EVENTS, ACQUIRE, COMBAT, END
  combat_state: text("combat_state"), // JSON blob
  land_draw_state: text("land_draw_state"), // JSON blob for land draw instructions
  turn_free_draw_used: integer("turn_free_draw_used").default(0),
  turn_purchase_used: integer("turn_purchase_used").default(0),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  game_id: text("game_id").references(() => games.id),
  name: text("name"),
  color: text("color"),
  gold: integer("gold").default(0),
  prestige: integer("prestige").default(0),
  is_eliminated: integer("is_eliminated").default(0), // 0 or 1 for boolean
});

export const territories = sqliteTable("territories", {
  id: text("id").primaryKey(),
  game_id: text("game_id").references(() => games.id),
  owner_id: text("owner_id").references(() => players.id),
  location: text("location").default("DECK"), // DECK, BOARD, DISCARD
  terrain_type: text("terrain_type"),
  instruction_type: text("instruction_type"), // FOR_SALE, PUBLIC_AUCTION, FIGHT
  instruction_value: integer("instruction_value"),
  fortification_level: integer("fortification_level").default(0),
  settlement_type: text("settlement_type"),
  settlement_value: integer("settlement_value").default(0),
  last_fort_build_turn: integer("last_fort_build_turn").default(0),
  last_settlement_build_turn: integer("last_settlement_build_turn").default(0),
});

export const things = sqliteTable("things", {
  id: text("id").primaryKey(),
  game_id: text("game_id").references(() => games.id),
  owner_id: text("owner_id").references(() => players.id),
  location: text("location"), // DECK, HAND, BOARD, DISCARD, BANK
  territory_id: text("territory_id").references(() => territories.id),
  template_id: text("template_id"),
  is_face_up: integer("is_face_up").default(0),
});

import { relations } from "drizzle-orm";

export const logs = sqliteTable("logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  game_id: text("game_id"),
  message: text("message"),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const playersRelations = relations(players, ({ one, many }) => ({
  game: one(games, {
    fields: [players.game_id],
    references: [games.id],
  }),
  territories: many(territories),
  things: many(things), // This targets things with owner_id
}));

export const territoriesRelations = relations(territories, ({ one, many }) => ({
  owner: one(players, {
    fields: [territories.owner_id],
    references: [players.id],
  }),
  game: one(games, {
    fields: [territories.game_id],
    references: [games.id],
  }),
  units: many(things, { relationName: "territory_units" }),
}));

export const thingsRelations = relations(things, ({ one }) => ({
  owner: one(players, {
    fields: [things.owner_id],
    references: [players.id],
  }),
  territory: one(territories, {
    fields: [things.territory_id],
    references: [territories.id],
    relationName: "territory_units",
  }),
}));
