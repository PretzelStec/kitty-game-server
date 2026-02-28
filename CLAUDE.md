# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

- **Install deps:** `pnpm install`
- **Build:** `pnpm build` (runs `tsc`, outputs to `dist/`)
- **Dev (watch mode):** `pnpm dev` (runs `tsc --watch`)
- **Start server:** `pnpm start` (runs `node dist/server.js` on port 8080)
- **Docker:** `docker build -t kitty-game-server .` then `docker run -p 8080:8080 kitty-game-server`

No test framework is configured.

## Architecture

This is a WebSocket game server (TypeScript, ESM) where clients interact with a virtual kitty through actions. The kitty has states that change based on user input and timed auto-transitions.

### Core Components

- **`src/server.ts`** — HTTP server + WebSocket upgrade handler. Listens on port 8080 at path `/kitty-game-server/`. Owns broadcasting (state changes + messages to all clients) and message parsing/validation. Creates a single `KittyStateMachine` and `ActionRegistry` instance.

- **`src/state-machine.ts`** — `KittyStateMachine` class. States: `VIBING → DYING → DEAD` (neglect path) and `VIBING ↔ BEING_PET`, `VIBING → SLEEPING → VIBING`. Each state has an optional timed auto-transition defined in `TRANSITION_TABLE`. The `DEAD` state is terminal. Auto-transitions use username `"SYSTEM"` and are excluded from event history.

- **`src/actions.ts`** — `ActionRegistry` pattern: each action is an `ActionHandler` with an `action` string key and `handle(ctx)` method. Current actions: `PET`, `PUT_TO_SLEEP`, `PONG`. Guards (e.g., sleep cooldown of 8 hours, must be VIBING to sleep) live in the handlers.

### WebSocket Protocol

Clients send JSON: `{ "action": "PET"|"PUT_TO_SLEEP"|"PONG", "username": "..." }`

Server sends:
- `STATE_INIT` — full state + last 5 events on connect
- `STATE_CHANGE` — broadcasted on state transitions
- `MESSAGE` — broadcasted text messages (guard rejections, etc.)
- `PING` — every 10 seconds (client responds with `PONG` action)
- `ERROR` — invalid message format

## Key Conventions

- Package manager is **pnpm** (corepack-managed, v10.29.2)
- ESM modules (`"type": "module"`) — use `.js` extensions in imports
- Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled
- To add a new action: create an `ActionHandler` object and register it in `createRegistry()`
