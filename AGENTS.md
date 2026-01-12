# King of the Tabletop - Gemini Context

Always ask before committing code, never automatically commit code.

## Project Overview

**King of the Tabletop Online** is a faithful web adaptation of the classic Tom Wham board game. It is a multiplayer strategy game involving territory management, economy building, and dice-based combat.

## Tech Stack

- **Runtime:** Bun
- **Backend Framework:** Hono
- **Database:** SQLite (via `bun:sqlite`)
- **Communication:** WebSockets
- **Language:** TypeScript

## Architecture & Conventions

### Directory Structure

- `specs/`: Contains critical technical specifications and the implementation plan. **Read these before starting any major feature.**
  - `specs/instructions.md`: Detailed rules, database schema, and game logic.
  - `specs/implementation_plan.md`: Phased approach to development.
- `src/`: (Planned) Application source code.
  - `db/`: Database initialization and schema management.
  - `game/`: Core game logic (state machine, combat engine).
  - `routes/`: Hono route handlers.

### Development Guidelines

1.  **Bun First:** Use `bun` for package management (`bun install`, `bun add`) and running scripts.
2.  **Database:** The schema is defined in `specs/instructions.md`. Changes to the schema should be reflected there.
3.  **State Management:** The game state is persisted in SQLite. The server creates a WebSocket connection for real-time updates (`/ws/:gameId`).
4.  **Strict Types:** Maintain strict TypeScript typing, especially for game entities ("Things", "Territories") as defined in the specs.
5.  **Testing:** Use `vitest` for unit and integration testing. Tests should be placed in the `tests/` directory. Write tests for all new code.

## Getting Started (Current Status)

The project is currently in the **initialization phase**.

**Next Immediate Steps (from Implementation Plan):**

1.  Initialize the server structure (Hono + WebSocket boilerplate).
2.  Set up the SQLite database and seed scripts.
3.  Implement the basic game loop.

## Common Commands

- **Install Dependencies:** `bun install`
- **Run Dev Server:** `bun run index.ts` (or configured script)
- **Run Tests:** `bun run test`

## Reference

- **Rules:** See `specs/instructions.md` for the definitive source of game rules and mechanics.
