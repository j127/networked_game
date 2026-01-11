# King of the Tabletop - Technical Specification (v2)

## 1. Project Overview

**Title:** King of the Tabletop Online **Core Logic:** A faithful adaptation of the Tom Wham board game (Dragon Magazine #77). **Stack:**

- **Runtime:** Bun
- **Framework:** Hono
- **Database:** SQLite (using `bun:sqlite` or `better-sqlite3`)
- **Communication:** WebSockets
- **Language:** TypeScript

## 2. Database Schema (SQLite)

We will use a relational structure to persist the game state.

### 2.1 Tables

```
-- The active game session
CREATE TABLE games (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'LOBBY', -- LOBBY, ACTIVE, FINISHED
    turn_player_index INTEGER DEFAULT 0, -- Index of the player whose turn it is
    current_phase TEXT DEFAULT 'SETUP', -- INCOME, EVENTS, ACQUIRE, COMBAT, END
    combat_state TEXT, -- JSON blob storing current battle details if in combat
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Players in a game
CREATE TABLE players (
    id TEXT PRIMARY KEY,
    game_id TEXT,
    name TEXT,
    color TEXT,
    gold INTEGER DEFAULT 0,
    prestige INTEGER DEFAULT 0,
    is_eliminated BOOLEAN DEFAULT 0,
    FOREIGN KEY(game_id) REFERENCES games(id)
);

-- The physical board (The Land Deck that has been played)
CREATE TABLE territories (
    id TEXT PRIMARY KEY,
    game_id TEXT,
    owner_id TEXT, -- NULL if unowned (but explored?), usually owned once placed
    terrain_type TEXT, -- FOREST, PLAINS, MOUNTAIN, SWAMP, DESERT
    fortification_level INTEGER DEFAULT 0, -- 0=None, 1=Tower, 2=Keep, 3=Castle, 4=Citadel
    settlement_type TEXT, -- NULL, 'VILLAGE', 'CITY', 'MINE_GOLD', 'MINE_SILVER', 'MINE_COPPER'
    FOREIGN KEY(game_id) REFERENCES games(id),
    FOREIGN KEY(owner_id) REFERENCES players(id)
);

-- The "Things" (Units, Heroes, Magic Items, Treasures)
-- Used for both "Hand" and "Standing Army"
CREATE TABLE things (
    id TEXT PRIMARY KEY,
    game_id TEXT,
    owner_id TEXT, -- NULL if in the "Cup" (Deck)
    location TEXT, -- 'DECK', 'HAND', 'BOARD', 'DISCARD', 'BANK' (for special chars)
    territory_id TEXT, -- NULL if in Hand/Deck. Points to territory if on board.
    template_id TEXT, -- e.g., 'elf_lord', 'giant_snake'
    is_face_up BOOLEAN DEFAULT 0,
    FOREIGN KEY(game_id) REFERENCES games(id),
    FOREIGN KEY(owner_id) REFERENCES players(id),
    FOREIGN KEY(territory_id) REFERENCES territories(id)
);

-- Game Logs for the chat/history window
CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 3. Game Data (Static)

We will create a `data.ts` file to hold the definitions extracted from the PDF.

**Unit Properties:**

- **Combat Value:** Number of dice rolled.
- **Special Abilities:**
  - `R` (Ranged): Fires first.
  - `C` (Charge): +1d6 to combat value on attack.
  - `*` (Magic): Hits on 5 or 6.
  - `∞` (Flying): Save roll (Even=Safe) if hit.
- **Terrain Bonus:** +1 Combat Value if on home terrain (e.g., Elves in Forest).

**Example Data Structure:**

```
export const THING_TEMPLATES = {
  'elf': { name: 'Elf', combat: 2, terrain: 'FOREST' },
  'elf_lord': { name: 'Elf Lord', combat: 3, abilities: ['R'], terrain: 'FOREST' },
  'dragon_old': { name: 'Old Dragon', combat: 4, abilities: ['FLYING', 'MAGIC'], terrain: 'DESERT' },
  'catapult': { name: 'Catapult', combat: 4, abilities: ['R'], terrain: 'PLAINS' }, // Example generic
  // ... complete list from PDF Page 11
};

export const EVENTS_TABLE = [
  // 2d6 Roll
  { roll: 2, name: 'Forest Fire', effect: 'BURN_FOREST' },
  { roll: 3, name: 'Prairie Fire', effect: 'BURN_PLAINS' },
  // ... and so on
];
```

## 4. Server Logic & API

### 4.1 Connection & State

- **WebSocket Path:** `/ws/:gameId`
- **Authentication:** Generate a `playerId` UUID on the client and store it in `localStorage`. Send this `playerId` on connection.

### 4.2 Handling the Game Loop (State Machine)

**Phase 1: Collection & Construction**

1. **Income:** Server runs query: `SELECT * FROM territories WHERE owner_id = ?`. Calculates Gold. Updates `players.gold`.
2. **Prestige:** Calculate Prestige (Lands + Holdings + Gold/10 + SpecialChars). Check **Win Condition** (30 Prestige + Gran Muniment).
3. **Special Char Roll:** Player sends `ROLL_FOR_CHAR` { charId: 'guilliame_tell' }. Server handles dice logic (2d6 >= 2\*CombatValue - PrestigeBonus).
4. **Build:** Player sends `BUILD_STRUCTURE` { territoryId, type: 'KEEP' }. Server checks Gold, deducts, updates `territories` table.

**Phase 2: Events**

1. **Roll:** Server auto-rolls 2d6.
2. **Resolution:**

- _Natural Disaster:_ Query all territories of type X. Apply destruction logic (downgrade forts).
- _Plague:_ Query `things` count per player. Kill units.

**Phase 3: Acquire Tiles**

1. **Land Draw:** Player sends `DRAW_LAND`. Server picks random from `LAND_DECK` (simulated). If `INSTRUCTION` tile, execute logic.
2. **Purchase:** Player sends `BUY_THINGS` { count: 3 }. Server deducts Gold, draws from `things` table (where location='DECK'), updates to 'HAND'.

**Phase 4: War**

1. **Declare:** Player sends `DECLARE_ATTACK` { fromTerritory, toTerritory, unitIds }.
2. **Initiative:** Server rolls dice.
3. **Combat Loop (The Complex Part):**

- **Ranged Round:** Attacker Ranged fire -> Defender assigns hits -> Defender Ranged fire -> Attacker assigns hits.
- **Melee Round:** Attacker Melee -> Defender assigns hits -> Defender Melee -> Attacker assigns hits.
- **Casualty Selection:** This requires a specific sub-state.
  - Server sends: `REQUEST_CASUALTIES` { count: 2, source: 'RANGED' }
  - Client sends: `SELECT_CASUALTIES` { thingIds: [...] }
- **Capture:** If Defender wiped out, transfer `territory.owner_id`.

## 5. Client (Frontend) Specification

### 5.1 Visual Style

- **The "Chit" Look:** Units should look like the cardboard squares from the PDF.
- **Map:** A grid or flex layout showing Player Boards.
- **Zones:**
  - **Hand:** Private area at bottom.
  - **Standing Army:** The active units on territories.
  - **Bank/Market:** Where Special Characters and Fortifications live.

### 5.2 Interactions

- **Drag and Drop:** Drag unit from Hand -> Territory (deployment). Drag Unit -> Enemy Territory (attack).
- **Modals:**
  - "Choose Structure to Build"
  - "Select Casualties" (Critical for game flow)
  - "Event Result"

## 6. Implementation Steps

1. **Setup:** Initialize Bun project, install `hono`, `bun:sqlite`.
2. **DB Init:** Write a script to create tables and seed the "Deck" (insert all 124 playing deck tiles into `things` with location='DECK').
3. **WebSocket Server:** Create the Hono upgrade handler.
4. **Game Loop - Passive:** Implement Income and Card Draw (easiest phases).
5. **Game Loop - Board:** Implement placing things on territories.
6. **Game Loop - Combat:** Implement the dice rolling and hit assignment logic.

```
### Next Steps for You

I can now generate the initial **Server Code** (`server.ts`) containing the Hono/WebSocket boilerplate and the **Database Setup** (`db.ts`) which includes the SQLite schema and the code to seed the initial game deck based on the PDF counts.

Would you like me to start with those two files?
```
