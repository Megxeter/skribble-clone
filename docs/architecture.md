# System Architecture — skribbl.io Clone

## 1. Architectural Paradigm: Server-Authoritative State Machine

The skribbl.io clone is built on a **Server-Authoritative State Machine** pattern driven by **Socket.IO WebSockets**:
* **The Server is the Single Source of Truth:** Clients never calculate points, decide turn order, decrement the round clock, or validate guesses. The server runs authoritative timers and broadcasts state events.
* **Clients are Reactive Views:** Clients capture user input (drawing strokes, chat messages, button clicks) and render the canvas and UI based strictly on server events.
* **Unified Monorepo on Render:** A single Node.js web service hosts both the compiled React + Vite frontend statically and the Socket.IO WebSocket gateway on the same HTTP port.

```text
[ Browser Client (React 19 + Vite) ]
        │  ▲
        │  │ Real-Time WebSocket Events (Normalized Coordinates [0.0 - 1.0])
        ▼  │
[ Unified Express + Socket.IO Server (Node.js) ]
  ├── Static Hosting: Serves client/dist bundle on /
  ├── Health Endpoint: GET /health (Render healthcheck probe)
  ├── RoomManager: In-memory public matchmaking & private room registry
  ├── Game State Machine: Turn sequencer, 1s countdown clock, scoring engine
  └── WordBank: Embedded 300-word curated dictionary
```

---

## 2. Monorepo Organization

```text
skribbl-clone/
├── package.json                 # Root npm workspace runner (shared, client, server)
├── tsconfig.json                # Root TypeScript compiler configuration
├── render.yaml                  # Render Blueprint definition for single web service
├── docs/                        # Project architecture, decisions, and game rules
├── shared/                      # @skribbl/shared npm workspace package
│   ├── types.ts                 # Shared data models (PlayerDTO, RoomSettings, HealthResponse)
│   ├── events.ts                # Authoritative WebSocket event constants
│   └── index.ts                 # Barrel exports
├── client/                      # @skribbl/client React 19 + TypeScript + Vite frontend
│   ├── src/components/          # UI views (Landing, Lobby, Canvas, Toolbar, Chat)
│   ├── src/hooks/               # useSocket, useCanvas hooks
│   └── src/index.css            # Skribbl design system & playful theme
├── server/                      # @skribbl/server Node.js + Express + Socket.IO
│   ├── src/models/              # Room, Player, Game, DrawingState classes
│   ├── src/services/            # RoomManager, WordService
│   ├── src/handlers/            # roomHandler, drawHandler, chatHandler
│   ├── src/data/                # words.json (~300 words)
│   └── src/server.ts            # Unified Express + Socket.IO entry point
└── scripts/
    └── verify-milestone1.mjs     # Headless automated verification smoke test
```

---

## 3. Key Architectural Invariants

1. **Unified Deployment:** Express serves the compiled Vite client bundle and attaches Socket.IO on the same HTTP server and port (`process.env.PORT || 3000`). This completely eliminates CORS issues and WebSocket proxy drops on free hosting.
2. **Normalized Coordinates:** Drawing coordinates $(x, y)$ are transmitted as relative ratios ($0.0 \le x, y \le 1.0$). Receiving clients scale these ratios to their local canvas dimensions, ensuring cross-device resolution fidelity.
3. **Secret Word Secrecy:** Plaintext secret words are only transmitted to the active drawer socket. Guesser clients receive only masked blanks (`_ _ _ _`) until the turn concludes.
4. **Anti-Spoiler Chat Shield:** Guessed words are suppressed from chat. When a player guesses correctly, only a system announcement is shown, and subsequent messages from that player are hidden from players who have not yet guessed.
5. **Strict 2-Player Minimum Start:** Games require at least 2 connected players to start. The server strictly rejects start requests if `players.size < 2`.
6. **Ephemeral In-Memory State:** Rooms and player sessions live strictly in server memory (`RoomManager` Map) and are automatically pruned 30 seconds after becoming empty. Zero database required.

---

## 4. Related Architecture Specifications

* [docs/hld.md](hld.md) — **High-Level Design (HLD)**: System overview, Socket.IO communication topology, room state lifecycle, and unified Render deployment structure.
* [docs/lld.md](lld.md) — **Low-Level Design (LLD)**: Module breakdowns, data models (`Player`, `Room`, `Game`, `DrawingState`), WebSocket event payloads, authoritative timers, scoring formulas, and validation rules.
