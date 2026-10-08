# High-Level Design (HLD) — skribbl.io Clone

## 1. System Overview & Objectives

The skribbl.io clone is an end-to-end, browser-based, real-time multiplayer drawing and guessing game. The system enables players to create or join public and private game lobbies, take turns drawing assigned words on an interactive canvas, deduce secret words via chat, and accumulate time-weighted points across configured rounds.

The system is designed around a **Server-Authoritative State Machine** where the backend manages room state, game phases, authoritative timers, word selection secrecy, drawing broadcasts, scoring math, and chat filtering. Clients act as reactive views.

---

## 2. System Architecture

The application is structured as a monorepo with three workspace packages:

```text
┌─────────────────────────────────────────────────────────────┐
│                       Client (Browser)                      │
│   React 19 + TypeScript + Vite + HTML5 Canvas + Web Audio   │
└──────────────────────────────▲──────────────────────────────┘
                               │
            WebSocket (Socket.IO) & HTTP REST (/health)
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Unified Server (Node.js)                 │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Express HTTP Layer                                  │   │
│   │  ├── GET /health (Healthcheck probe)                │   │
│   │  └── Static File Server (client/dist SPA fallback)  │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Socket.IO Real-Time Gateway                         │   │
│   │  ├── roomHandler   (Lobby, Matchmaking, Settings)   │   │
│   │  ├── drawHandler   (Stroke sync, Undo, Clear)       │   │
│   │  └── chatHandler   (Guess evaluation, Anti-spoiler) │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Core Domain Engine                                  │   │
│   │  ├── RoomManager   (In-memory room registry)        │   │
│   │  ├── Room & Game   (Lifecycle state machines)       │   │
│   │  └── WordService   (~300 curated English words)     │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                               ▲
                               │ Imports Shared Contracts
┌──────────────────────────────┴──────────────────────────────┐
│                    @skribbl/shared Package                  │
│    Data Transfer Objects (DTOs), Event Constants, Enums     │
└─────────────────────────────────────────────────────────────┘
```

### Component Roles
1. **Frontend (`@skribbl/client`):**
   * Single-page React application bundled via Vite.
   * Renders the UI across three primary view states: `Landing`, `Lobby`, and `GameView`.
   * Manages 2D canvas drawing with normalized coordinates ($0.0 \dots 1.0$).
   * Plays join chimes via native Web Audio API with local mute storage.
2. **Backend (`@skribbl/server`):**
   * Unified Node.js and Express server.
   * Hosts REST endpoints and serves the compiled static frontend bundle.
   * Runs Socket.IO WebSocket server with rooms corresponding to game lobbies.
   * Manages authoritative timers, turn progression, and scoring.
3. **Contracts (`@skribbl/shared`):**
   * Shared TypeScript definitions for data payloads, socket event names, and configuration constraints.

---

## 3. Communication & Protocol Topology

### Real-Time WebSocket Gateway (Socket.IO)
* **Transport:** WebSockets with HTTP long-polling fallback.
* **Room Isolation:** Each match maps to a Socket.IO room channel: `socket.join(room_${roomId})`. All gameplay and drawing events are broadcast strictly within that room scope.
* **Persistent Event Router:** Client listeners are maintained at the root `App.tsx` coordinator level. This decouples socket event consumption from child component mounting lifecycles, eliminating race conditions during phase transitions.

### Client-Server Interaction Sequence
```mermaid
sequenceDiagram
    participant C as Client (Player)
    participant S as Server (Socket.IO)
    participant R as Room / Game State

    Note over C,S: Matchmaking & Lobby Phase
    C->>S: join_public / create_room / join_room
    S->>R: Room.addPlayer(player)
    R-->>S: Assign display name (numbering if duplicate)
    S-->>C: room_state (Lobby view)
    S-->>R: Broadcast player_joined to room

    Note over C,S: Game Start & Turn Lifecycle
    C->>S: start_game (Host only, >= 2 players)
    S->>R: Game.start() -> startWordSelection()
    S-->>C: round_start (Words to drawer socket; blanks to guessers)
    C->>S: choose_word (Drawer picks word within 15s)
    S->>R: Begin drawing phase (1s countdown timer)

    Note over C,S: Drawing & Guessing Phase
    C->>S: draw_start / draw_move / draw_end (Normalized coords)
    S-->>C: draw_data (Broadcast to room viewers)
    C->>S: chat_message ("apple")
    S->>R: Evaluate guess against secret word
    alt Correct Guess
        S-->>C: correct_guess (Guesser: +pts, Drawer: +pts)
        Note over S: Anti-spoiler shield suppresses word from chat
    else Incorrect Guess
        S-->>C: chat_broadcast (Visible to all active guessers)
    end

    Note over C,S: Round End & Game Over
    R->>S: Turn ends (Time up OR all guessed OR drawer disconnects)
    S-->>C: round_end (Reveal secret word, score breakdown)
    Note over S: Next turn rotation or Game Over podium
```

---

## 4. Room State Machine & Lifecycle

Rooms progress through an authoritative lifecycle governed by `Room.ts` and `Game.ts`:

```text
  [ Created ]
       │
       ▼
   ┌───────┐      host clicks "Start Game" (>= 2 players)
   │ LOBBY │ ────────────────────────────────────────────────┐
   └───┬───┘                                                 │
       ▲                                                     │
       │ Play Again (Host resets room)                       │
       │                                                     ▼
   ┌───────────┐      all rounds finished            ┌────────────────┐
   │ GAME_OVER │ ◄────────────────────────────────── │ WORD_SELECTING │
   └───────────┘                                     └───────┬────────┘
                                                             │ word chosen or
                                                             │ 15s timeout
                                                             ▼
       ┌───────────┐      timer expires OR           ┌─────────────┐
       │ ROUND_END │ ◄─── all guessed OR ─────────── │   DRAWING   │
       └─────┬─────┘      drawer disconnects         └─────────────┘
             │
             │ 5-second intermission
             ▼
      (Next turn rotation / Next round)
```

### Room Management Rules
1. **Public Matchmaking:** The server finds the oldest open public room with available player slots (`players.size < maxPlayers`). If none exist, a new public room is created automatically.
2. **Private Isolation:** Private rooms are excluded from public matchmaking and require a 6-character room code or direct URL query link (`/?room=CODE`).
3. **Minimum Player Gate:** Games require at least 2 connected players. The server strictly rejects start attempts if `players.size < 2` with `INSUFFICIENT_PLAYERS`.
4. **Host Migration:** If the host disconnects, host status automatically passes to the next oldest connected player in the room.
5. **Room Cleanup:** When all players depart, an empty room is kept for 30 seconds before being automatically purged from server memory.

---

## 5. Deployment Topology

The application is deployed using a **Split Architecture** across Vercel (Frontend SPA) and Render (Persistent Node.js Backend):

```text
[ Incoming Web Traffic ]
        │
        ├──(HTTPS: Static Assets & Client SPA)──► [ Vercel Edge Network ]
        │                                           │
        │                                           └── client/dist (SPA Routing via vercel.json)
        │
        └──(WSS / HTTPS: Socket.IO & /health)───► [ Render Web Service ]
                                                    │ (process.env.PORT || 3000)
                                                    ├─ GET /health (Healthcheck probe)
                                                    ├─ Socket.IO Gateway (CORS checked via CLIENT_ORIGINS)
                                                    └─ In-Memory Room & Game Engine
```

### Deployment Characteristics
* **Static Edge CDN Delivery:** Vercel serves the compiled React single-page application globally with instant asset delivery and zero server compute overhead for static files.
* **Persistent WebSocket Gateway:** Render hosts the long-lived Express and Socket.IO server, sustaining bidirectional WebSockets, room event rooms, 1s game timers, and in-memory game state machines.
* **CORS Protection:** Cross-origin HTTP and WebSocket connections are restricted via `CLIENT_ORIGINS`.
* **Zero Socket.IO Proxying on Vercel:** The client connects directly to Render via `VITE_BACKEND_URL`, avoiding serverless execution limits and proxy drops.
* **Health Check Integration:** Render continuously polls `GET /health` to confirm server availability and process uptime.
* **Fallback Unified Mode:** When `VITE_BACKEND_URL` is omitted, Express serves `client/dist` directly on port 3000 for single-port unified self-hosting.
