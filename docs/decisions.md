# Confirmed Architecture & Product Decisions

This document records the foundational architectural, product, and scope decisions for the skribbl.io clone.

---

### Decision 1: Mandatory Public Rooms & Matchmaking
* **Decision:** Public rooms are mandatory. Players can click **"Join Public Game"** to quickly match into an open public lobby, or toggle a room as Public upon creation. Private rooms remain invite-only via a 6-character room code or direct link.
* **Rationale:** Eliminates player onboarding friction by allowing solo players to jump into an active game without needing to recruit friends first.

---

### Decision 2: Strict Minimum 2 Connected Players to Start
* **Decision:** The game requires at least 2 connected players (including the host) to start. The server strictly rejects any start request when `players.size < 2` with error code `INSUFFICIENT_PLAYERS`, and the UI displays an explanatory alert banner.
* **Rationale:** Pictionary is inherently a two-role game (one drawer, at least one guesser). Starting alone produces a degenerate game state.

---

### Decision 3: Single Unified Render Web Service Deployment
* **Decision:** The application deploys as a single unified Node.js web service on Render. Express serves the compiled React + Vite frontend bundle statically from `/` and attaches Socket.IO to the shared HTTP server on a single port (`PORT`).
* **Rationale:** Completely eliminates cross-origin (CORS) bugs and prevents WebSocket handshake proxy issues on free hosting, while requiring only one free instance on Render.

---

### Decision 4: Secret Word Secrecy & Anti-Spoiler Shield
* **Decision:** The secret word is strictly confidential. The server sends word options only to the drawer socket, and guessers receive only blank spaces (`_ _ _ _`). When a player guesses the word correctly, the word is not broadcast in chat; instead, a green announcement is shown, and subsequent messages from that player are hidden from players who have not yet guessed.
* **Rationale:** Prevents cheating via browser dev tools inspection and prevents accidental or deliberate spoiling in live chat.

---

### Decision 5: Normalized Canvas Coordinates
* **Decision:** Drawing coordinates $(x, y)$ are captured and transmitted as relative floating-point ratios ($0.0 \le x, y \le 1.0$) relative to canvas dimensions. Receiving clients multiply these ratios by their own local canvas size before rendering.
* **Rationale:** Guarantees that drawings made on desktop (e.g. $1920\times 1080$) render faithfully without clipping or distortion on mobile devices or smaller laptop windows.

---

### Decision 6: Built-In 300-Word English Dictionary
* **Decision:** The game includes an embedded dictionary of ~300 common, concrete, easy-to-draw English nouns (3–10 letters).
* **Rationale:** Removes dependencies on external dictionary APIs, works completely offline in local development, and ensures words are recognizable and fun to doodle.

---

### Decision 7: Deterministic Speed-Based Scoring Engine
* **Decision:** Guesser points scale from 100 to 500 based on remaining draw time, plus a 50-point bonus for the first correct guesser. The drawer earns 75 points per successful guesser.
* **Rationale:** Incentivizes fast guessing while rewarding drawers for creating recognizable art that multiple players can identify.

---

### Decision 8: Ephemeral In-Memory State (No Database)
* **Decision:** Rooms, active games, and player sessions live strictly in memory on the server (`RoomManager` Map). Rooms are automatically removed from memory 30 seconds after becoming empty.
* **Rationale:** Keeps deployment completely lightweight, requires zero database provisioning or migrations, and fits cleanly within free-tier server resource limits.
