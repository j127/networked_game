# Implementation Plan

## Phase 1: Core Infrastructure

1. **Server Setup**: Bun + Hono with WebSocket support.
2. **Database Layer**: SQLite schema setup and helper functions.
3. **Basic Game Loop**: Create game, join game, start game.

## Phase 2: Game Logic - Part 1 (Economy & Setup)

1. **Deck Generation**: Seed the database with the exact counts of units from the PDF.
2. **Turn Phasing**: Implement the state machine for phases (Income -> Events -> Acquire -> War).
3. **Income & Prestige**: Calculation logic.

## Phase 3: Game Logic - Part 2 (Map & Movement)

1. **Territory Management**: Assigning land tiles to players.
2. **Unit Placement**: Moving "Things" from Hand to Territories.
3. **Building**: Logic for upgrading Citadels and Cities.

## Phase 4: Combat Engine

1. **Battle State**: Handling the sub-phases of war (Ranged, Melee, Casualties).
2. **Dice Logic**: Implementing the specific hit tables and modifiers.

## Phase 5: Frontend

1. **Game Board UI**: Visualizing the player charts.
2. **Chit Rendering**: CSS/Canvas to make things look like counters.
3. **WebSocket Client**: Handling state updates.
