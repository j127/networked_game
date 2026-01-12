export type ThingKind =
  | "CHARACTER"
  | "MAGIC"
  | "TREASURE"
  | "SETTLEMENT"
  | "MINE"
  | "SPECIAL";

export interface ThingTemplate {
  id: string;
  name: string;
  combat: number;
  abilities: string[]; // R=Ranged, C=Charge, MAGIC=*, FLYING=∞
  kind: ThingKind;
  terrain?: string; // FOREST, PLAINS, MOUNTAIN, SWAMP, DESERT
  settlementType?: string; // CITY, VILLAGE, MINE_GOLD, MINE_SILVER, MINE_COPPER
  goldValue?: number; // Treasures or settlement/mine value
}

const baseTemplates: ThingTemplate[] = [
  // Desert
  { id: "sphinx", name: "Sphinx", combat: 4, abilities: ["MAGIC"], kind: "CHARACTER", terrain: "DESERT" },
  { id: "old_dragon", name: "Old Dragon", combat: 4, abilities: ["FLYING"], kind: "CHARACTER", terrain: "DESERT" },
  { id: "dust_devil", name: "Dust Devil", combat: 4, abilities: ["FLYING"], kind: "CHARACTER", terrain: "DESERT" },
  { id: "baby_dragon", name: "Baby Dragon", combat: 3, abilities: ["FLYING"], kind: "CHARACTER", terrain: "DESERT" },
  { id: "yellow_knight", name: "Yellow Knight", combat: 3, abilities: ["C"], kind: "CHARACTER", terrain: "DESERT" },
  { id: "sand_worm", name: "Sand Worm", combat: 3, abilities: [], kind: "CHARACTER", terrain: "DESERT" },
  { id: "camel_corps", name: "Camel Corps", combat: 3, abilities: [], kind: "CHARACTER", terrain: "DESERT" },
  { id: "griffon", name: "Griffon", combat: 2, abilities: ["FLYING"], kind: "CHARACTER", terrain: "DESERT" },
  { id: "dervish", name: "Dervish", combat: 2, abilities: [], kind: "CHARACTER", terrain: "DESERT" },
  { id: "nomads_2", name: "Nomads", combat: 2, abilities: [], kind: "CHARACTER", terrain: "DESERT" },
  { id: "nomads_1", name: "Nomads", combat: 1, abilities: [], kind: "CHARACTER", terrain: "DESERT" },
  { id: "buzzards", name: "Buzzards", combat: 1, abilities: ["FLYING"], kind: "CHARACTER", terrain: "DESERT" },
  { id: "vultures", name: "Vultures", combat: 1, abilities: ["FLYING"], kind: "CHARACTER", terrain: "DESERT" },
  { id: "skeletons", name: "Skeletons", combat: 1, abilities: [], kind: "CHARACTER", terrain: "DESERT" },

  // Mountain
  { id: "cyclops", name: "Cyclops", combat: 5, abilities: [], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "giant_ranged", name: "Giant", combat: 4, abilities: ["R"], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "troll", name: "Troll", combat: 4, abilities: [], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "blue_knight", name: "Blue Knight", combat: 3, abilities: ["C"], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "giant_roc", name: "Giant Roc", combat: 3, abilities: ["FLYING"], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "dwarves_r3", name: "Dwarves", combat: 3, abilities: ["R"], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "dwarves_3", name: "Dwarves", combat: 3, abilities: [], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "dwarves_r2", name: "Dwarves", combat: 2, abilities: ["R"], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "dwarves_2", name: "Dwarves", combat: 2, abilities: [], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "great_eagle", name: "Great Eagle", combat: 2, abilities: ["FLYING"], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "ogres", name: "Ogres", combat: 2, abilities: [], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "mountain_men", name: "Mountain Men", combat: 2, abilities: [], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "great_hawk", name: "Great Hawk", combat: 1, abilities: ["FLYING"], kind: "CHARACTER", terrain: "MOUNTAIN" },
  { id: "goblins", name: "Goblins", combat: 1, abilities: [], kind: "CHARACTER", terrain: "MOUNTAIN" },

  // Plains
  { id: "great_hunter", name: "Great Hunter", combat: 4, abilities: ["R"], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "wolf_pack", name: "Wolf Pack", combat: 4, abilities: [], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "lion_pride", name: "Lion Pride", combat: 4, abilities: [], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "buffalo_herd_4", name: "Buffalo Herd", combat: 4, abilities: [], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "white_knight", name: "White Knight", combat: 3, abilities: ["C"], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "buffalo_herd_3", name: "Buffalo Herd", combat: 3, abilities: [], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "plains_eagle", name: "Plains Eagle", combat: 2, abilities: ["FLYING"], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "ranger", name: "Ranger", combat: 2, abilities: ["FLYING"], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "tribesmen", name: "Tribesmen", combat: 2, abilities: [], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "villain", name: "Villain", combat: 2, abilities: [], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "centaur", name: "Centaur", combat: 2, abilities: [], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "gypsies", name: "Gypsies", combat: 2, abilities: [], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "gypsies_magic", name: "Gypsies", combat: 1, abilities: ["MAGIC"], kind: "CHARACTER", terrain: "PLAINS" },
  { id: "farmers", name: "Farmers", combat: 1, abilities: [], kind: "CHARACTER", terrain: "PLAINS" },

  // Magic
  { id: "lucky_charm", name: "Lucky Charm", combat: 0, abilities: [], kind: "MAGIC" },
  { id: "dust_of_defense", name: "Dust of Defense", combat: 0, abilities: [], kind: "MAGIC" },
  { id: "talisman", name: "Talisman", combat: 0, abilities: [], kind: "MAGIC" },
  { id: "golem", name: "Golem", combat: 0, abilities: [], kind: "MAGIC" },
  { id: "scroll_mist", name: "Scroll - Mist", combat: 0, abilities: [], kind: "MAGIC" },
  { id: "scroll_dispell", name: "Scroll - Dispell", combat: 0, abilities: [], kind: "MAGIC" },
  { id: "scroll_fire_wall", name: "Scroll - Fire Wall", combat: 0, abilities: [], kind: "MAGIC" },
  { id: "magic_sword", name: "Magic Sword", combat: 0, abilities: [], kind: "MAGIC" },
  { id: "magic_bow", name: "Magic Bow", combat: 0, abilities: [], kind: "MAGIC" },

  // Settlements
  { id: "city", name: "City", combat: 0, abilities: [], kind: "SETTLEMENT", settlementType: "CITY", goldValue: 2 },
  { id: "village", name: "Village", combat: 0, abilities: [], kind: "SETTLEMENT", settlementType: "VILLAGE", goldValue: 1 },

  // Mines
  { id: "mine_gold", name: "Gold Mine", combat: 0, abilities: [], kind: "MINE", settlementType: "MINE_GOLD", goldValue: 4 },
  { id: "mine_silver", name: "Silver Mine", combat: 0, abilities: [], kind: "MINE", settlementType: "MINE_SILVER", goldValue: 2 },
  { id: "mine_copper", name: "Copper Mine", combat: 0, abilities: [], kind: "MINE", settlementType: "MINE_COPPER", goldValue: 1 },

  // Treasures
  { id: "treasure_chest", name: "Treasure Chest", combat: 0, abilities: [], kind: "TREASURE", goldValue: 40 },
  { id: "treasure_diamond", name: "Diamond", combat: 0, abilities: [], kind: "TREASURE", goldValue: 20 },
  { id: "treasure_emerald", name: "Emerald", combat: 0, abilities: [], kind: "TREASURE", goldValue: 20 },
  { id: "treasure_sapphire", name: "Sapphire", combat: 0, abilities: [], kind: "TREASURE", goldValue: 10 },
  { id: "treasure_ruby", name: "Ruby", combat: 0, abilities: [], kind: "TREASURE", goldValue: 10 },
  { id: "treasure_nugget", name: "Gold Nugget", combat: 0, abilities: [], kind: "TREASURE", goldValue: 5 },

  // Special Characters
  { id: "arch_mage", name: "Arch Mage", combat: 6, abilities: ["MAGIC"], kind: "SPECIAL" },
  { id: "elf_lord", name: "Elf Lord", combat: 6, abilities: ["R"], kind: "SPECIAL" },
  { id: "dwarf_king", name: "Dwarf King", combat: 5, abilities: [], kind: "SPECIAL" },
  { id: "guilliame_tell", name: "Guilliame Tell", combat: 5, abilities: ["R"], kind: "SPECIAL" },
  { id: "sir_launcelot", name: "Sir Launcelot", combat: 5, abilities: ["C"], kind: "SPECIAL" },
  { id: "arch_cleric", name: "Arch Cleric", combat: 5, abilities: ["MAGIC"], kind: "SPECIAL" },
  { id: "sword_master", name: "Sword Master", combat: 4, abilities: [], kind: "SPECIAL" },
  { id: "grand_duke", name: "Grand Duke", combat: 4, abilities: [], kind: "SPECIAL" },
  { id: "baron_munchausen", name: "Baron Munchausen", combat: 4, abilities: [], kind: "SPECIAL" },
  { id: "master_thief", name: "Master Thief", combat: 4, abilities: [], kind: "SPECIAL" },
  { id: "assassin_primus", name: "Assassin Primus", combat: 4, abilities: [], kind: "SPECIAL" },
];

export const THING_TEMPLATES: Record<string, ThingTemplate> = Object.fromEntries(
  baseTemplates.map((t) => [t.id, t])
);

export const LAND_DECK_DISTRIBUTION = [
  { type: "DESERT", count: 8 },
  { type: "FOREST", count: 8 },
  { type: "PLAINS", count: 8 },
  { type: "MOUNTAIN", count: 8 },
  { type: "SWAMP", count: 8 },
];

export const LAND_INSTRUCTION_TILES = [
  { type: "FIGHT", count: 2 },
  { type: "PUBLIC_AUCTION", count: 4 },
  { type: "FOR_SALE", count: 1, value: 1 },
  { type: "FOR_SALE", count: 1, value: 2 },
  { type: "FOR_SALE", count: 1, value: 3 },
  { type: "FOR_SALE", count: 1, value: 4 },
  { type: "FOR_SALE", count: 1, value: 5 },
  { type: "FOR_SALE", count: 1, value: 6 },
  { type: "FOR_SALE", count: 1, value: 8 },
  { type: "FOR_SALE", count: 1, value: 10 },
];

export const PLAYING_DECK_DISTRIBUTION: { templateId: string; count: number }[] = [
  // Desert
  { templateId: "sphinx", count: 1 },
  { templateId: "old_dragon", count: 1 },
  { templateId: "dust_devil", count: 1 },
  { templateId: "baby_dragon", count: 1 },
  { templateId: "yellow_knight", count: 1 },
  { templateId: "sand_worm", count: 1 },
  { templateId: "camel_corps", count: 1 },
  { templateId: "griffon", count: 1 },
  { templateId: "dervish", count: 2 },
  { templateId: "nomads_2", count: 1 },
  { templateId: "nomads_1", count: 2 },
  { templateId: "buzzards", count: 1 },
  { templateId: "vultures", count: 2 },
  { templateId: "skeletons", count: 3 },

  // Mountain
  { templateId: "cyclops", count: 1 },
  { templateId: "giant_ranged", count: 1 },
  { templateId: "troll", count: 1 },
  { templateId: "blue_knight", count: 1 },
  { templateId: "giant_roc", count: 1 },
  { templateId: "dwarves_r3", count: 1 },
  { templateId: "dwarves_3", count: 1 },
  { templateId: "dwarves_r2", count: 1 },
  { templateId: "dwarves_2", count: 1 },
  { templateId: "great_eagle", count: 1 },
  { templateId: "ogres", count: 1 },
  { templateId: "mountain_men", count: 2 },
  { templateId: "great_hawk", count: 1 },
  { templateId: "goblins", count: 4 },

  // Plains
  { templateId: "great_hunter", count: 1 },
  { templateId: "wolf_pack", count: 1 },
  { templateId: "lion_pride", count: 1 },
  { templateId: "buffalo_herd_4", count: 1 },
  { templateId: "white_knight", count: 1 },
  { templateId: "buffalo_herd_3", count: 1 },
  { templateId: "plains_eagle", count: 1 },
  { templateId: "ranger", count: 1 },
  { templateId: "tribesmen", count: 2 },
  { templateId: "villain", count: 1 },
  { templateId: "centaur", count: 1 },
  { templateId: "gypsies", count: 1 },
  { templateId: "gypsies_magic", count: 1 },
  { templateId: "farmers", count: 4 },

  // Magic
  { templateId: "lucky_charm", count: 1 },
  { templateId: "dust_of_defense", count: 1 },
  { templateId: "talisman", count: 1 },
  { templateId: "golem", count: 1 },
  { templateId: "scroll_mist", count: 1 },
  { templateId: "scroll_dispell", count: 1 },
  { templateId: "scroll_fire_wall", count: 1 },
  { templateId: "magic_sword", count: 1 },
  { templateId: "magic_bow", count: 1 },

  // Settlements
  { templateId: "city", count: 5 },
  { templateId: "village", count: 9 },

  // Mines
  { templateId: "mine_gold", count: 1 },
  { templateId: "mine_silver", count: 2 },
  { templateId: "mine_copper", count: 2 },

  // Treasures
  { templateId: "treasure_chest", count: 1 },
  { templateId: "treasure_diamond", count: 1 },
  { templateId: "treasure_emerald", count: 1 },
  { templateId: "treasure_sapphire", count: 1 },
  { templateId: "treasure_ruby", count: 1 },
  { templateId: "treasure_nugget", count: 1 },
];

export const SPECIAL_CHARACTER_IDS = baseTemplates
  .filter((t) => t.kind === "SPECIAL")
  .map((t) => t.id);

export const EVENTS_TABLE = [
  { firstDie: 1, secondDie: [1, 2], name: "Forest Fire", effect: "FOREST_FIRE" },
  { firstDie: 1, secondDie: [3, 4], name: "Prairie Fire", effect: "PRAIRIE_FIRE" },
  { firstDie: 1, secondDie: [5, 6], name: "No Event", effect: "NO_EVENT" },
  { firstDie: 2, secondDie: [1, 2], name: "Floods", effect: "FLOODS" },
  { firstDie: 2, secondDie: [3, 4], name: "Earthquakes", effect: "EARTHQUAKES" },
  { firstDie: 2, secondDie: [5, 6], name: "No Event", effect: "NO_EVENT" },
  { firstDie: 3, secondDie: [1, 2], name: "Sandstorms", effect: "SANDSTORMS" },
  { firstDie: 3, secondDie: [3, 4], name: "Willing Workers", effect: "WILLING_WORKERS" },
  { firstDie: 3, secondDie: [5, 6], name: "No Event", effect: "NO_EVENT" },
  { firstDie: 4, secondDie: [1, 2], name: "Good Omen", effect: "GOOD_OMEN" },
  { firstDie: 4, secondDie: [3, 4], name: "Mother Lode", effect: "MOTHER_LODE" },
  { firstDie: 4, secondDie: [5, 6], name: "No Event", effect: "NO_EVENT" },
  { firstDie: 5, secondDie: [1, 2], name: "Pennies From Heaven", effect: "PENNIES_FROM_HEAVEN" },
  { firstDie: 5, secondDie: [3, 4], name: "The D6 Tax Law", effect: "D6_TAX_LAW" },
  { firstDie: 5, secondDie: [5, 6], name: "No Event", effect: "NO_EVENT" },
  { firstDie: 6, secondDie: [1, 2, 3, 4], name: "Good Harvest", effect: "GOOD_HARVEST" },
  { firstDie: 6, secondDie: [5], name: "Black Plague", effect: "BLACK_PLAGUE" },
  { firstDie: 6, secondDie: [6], name: "Smallpox", effect: "SMALLPOX" },
];
