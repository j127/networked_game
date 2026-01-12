export interface ThingTemplate {
  id: string;
  name: string;
  combat: number;
  abilities: string[]; // R=Ranged, C=Charge, *=Magic, ∞=Flying
  terrain?: string; // FOREST, PLAINS, MOUNTAIN, SWAMP, DESERT
}

// Based on PDF Page 11 examples and inferred standard units
export const THING_TEMPLATES: Record<string, ThingTemplate> = {
  // Basic Units
  men_at_arms: {
    id: "men_at_arms",
    name: "Men-at-Arms",
    combat: 1,
    abilities: [],
    terrain: "PLAINS",
  },
  axemen: {
    id: "axemen",
    name: "Axemen",
    combat: 2,
    abilities: [],
    terrain: "MOUNTAIN",
  },
  swordsmen: {
    id: "swordsmen",
    name: "Swordsmen",
    combat: 2,
    abilities: [],
    terrain: "PLAINS",
  },
  archers: {
    id: "archers",
    name: "Archers",
    combat: 1,
    abilities: ["R"],
    terrain: "FOREST",
  },

  // Specific examples
  elf: { id: "elf", name: "Elf", combat: 2, abilities: [], terrain: "FOREST" },
  elf_lord: {
    id: "elf_lord",
    name: "Elf Lord",
    combat: 3,
    abilities: ["R"],
    terrain: "FOREST",
  },
  dwarf: {
    id: "dwarf",
    name: "Dwarf",
    combat: 2,
    abilities: [],
    terrain: "MOUNTAIN",
  },
  orc: { id: "orc", name: "Orc", combat: 2, abilities: [], terrain: "SWAMP" },
  goblin: {
    id: "goblin",
    name: "Goblin",
    combat: 1,
    abilities: [],
    terrain: "SWAMP",
  },

  // Monsters/Special
  dragon_old: {
    id: "dragon_old",
    name: "Old Dragon",
    combat: 4,
    abilities: ["FLYING", "MAGIC"],
    terrain: "DESERT",
  },
  giant_snake: {
    id: "giant_snake",
    name: "Giant Snake",
    combat: 3,
    abilities: [],
    terrain: "SWAMP",
  },
  troll: {
    id: "troll",
    name: "Troll",
    combat: 3,
    abilities: [],
    terrain: "UD",
  }, // UD?

  // Seige
  catapult: {
    id: "catapult",
    name: "Catapult",
    combat: 4,
    abilities: ["R"],
    terrain: "PLAINS",
  },
};

export const LAND_TEMPLATES = {
  forest: { terrain: "FOREST" },
  plains: { terrain: "PLAINS" },
  mountain: { terrain: "MOUNTAIN" },
  swamp: { terrain: "SWAMP" },
  desert: { terrain: "DESERT" },
};

export const LAND_DECK_DISTRIBUTION = [
  { type: "forest", count: 10 },
  { type: "plains", count: 10 },
  { type: "mountain", count: 10 },
  { type: "swamp", count: 5 },
  { type: "desert", count: 5 },
];

// Simulation of deck distribution (total 124 items)
// This is a rough approximation since we don't have the PDF text
export const DECK_DISTRIBUTION: { templateId: string; count: number }[] = [
  { templateId: "men_at_arms", count: 20 },
  { templateId: "swordsmen", count: 10 },
  { templateId: "archers", count: 10 },
  { templateId: "axemen", count: 10 },
  { templateId: "elf", count: 10 },
  { templateId: "dwarf", count: 10 },
  { templateId: "orc", count: 10 },
  { templateId: "goblin", count: 10 },
  { templateId: "elf_lord", count: 2 },
  { templateId: "dragon_old", count: 1 },
  { templateId: "catapult", count: 5 },
  { templateId: "giant_snake", count: 5 },
  // ... others to sum to 124
];

export const EVENTS_TABLE = [
  { roll: 2, name: "Forest Fire", effect: "BURN_FOREST" },
  { roll: 3, name: "Prairie Fire", effect: "BURN_PLAINS" },
  // ...
];
