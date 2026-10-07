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

### Decision 7: Authoritative Time-Based Ratio Scoring Engine
* **Decision:** Points use time-based ratio scoring ($\text{ratio} = t_{\text{remaining}} / t_{\text{duration}}$). Guesser points are $100 + \lfloor 400 \times \text{ratio} \rfloor$ and drawer points are $25 + \lfloor 100 \times \text{ratio} \rfloor$ awarded once per eligible correct guess. Expired guesses ($t_{\text{remaining}} \le 0$) are rejected. Active drawer chat and guesses are blocked during drawing.
* **Rationale:** Incentivizes fast guessing while rewarding drawers proportionally per player who correctly identifies the drawing, without leaking secrets or allowing drawer self-guessing.

---

### Decision 8: Ephemeral In-Memory State (No Database)
* **Decision:** Rooms, active games, and player sessions live strictly in memory on the server (`RoomManager` Map). Rooms are automatically removed from memory 30 seconds after becoming empty.
* **Rationale:** Keeps deployment completely lightweight, requires zero database provisioning or migrations, and fits cleanly within free-tier server resource limits.

---

### Decision 9: Minimalist, Native-First Architecture Principles
* **Decision:** Implement using core minimalist software engineering principles: YAGNI, standard library and native platform priority, minimal code surface area, and root-cause fixes while rigorously preserving core server trust boundaries.
* **Rationale:** Eliminates boilerplate and dependency bloat while maintaining strict server-side validation and security invariants.

---

### Decision 10: Professional, Understated UI Design System
* **Decision:** Use an understated, professional dark interface featuring neutral surfaces (`#0f1115` / `#16181d`), a single subtle accent (`#2563eb`), clean sans-serif typography (`Inter`), accessible contrast, and visible keyboard focus (`:focus-visible`). Remove all emojis, flashy gradients, neon highlights, and decorative clutter.
* **Rationale:** Focuses user attention on gameplay, improves accessibility and visual hierarchy, and creates a clean, uncluttered user experience.

---

### Decision 11: Web Audio Join Cue & Autoplay Policy Compliance
* **Decision:** Synthesize short, low-volume audio cues using native browser Web Audio API (`AudioContext`) rather than fetching external sound assets. Play audio strictly once per actual player join event, suppress audio on room updates and reconnects, provide an accessible local toggle (`Sound: On / Off` in `localStorage`), and respect browser autoplay policies via passive user-gesture unlocking.
* **Rationale:** Zero external dependencies or network asset latency by prioritizing native platform features over external packages, immediate playback readiness, robust accessibility, and zero crashes from browser autoplay restrictions.

---

### Decision 12: Resilient Word Selection Flow & Lifecycle Decoupling
* **Decision:** Decouple `round_start` and `game_state` socket reception from child component mount lifecycle by maintaining persistent listeners in root `App.tsx`. Redundantly deliver word choices strictly to the active drawer via `GameStatePayload.wordOptions` during `word_selecting` (with `undefined` to guessers). Keep guessers on a waiting screen with live selection timer, and start drawing phase countdown only after word selection or 15-second auto-pick timeout.
* **Rationale:** Completely eliminates race conditions between socket event delivery and React component mounting, guarantees drawer always sees choices even on initial turn or after Play Again, and preserves secret-word confidentiality.

---

### Decision 13: Room-Scoped Duplicate Name Numbering & Stability
* **Decision:** Assign display names on the server. Unique names display normally. When names match after trimming and case-insensitive comparison, display them with suffixes (`Alice 1`, `Alice 2`, `Alice 3`) assigned in join order. Assigned numbers remain strictly stable when players leave (never renumber remaining players). Disambiguate names when someone enters a name already containing a number so that no two active players in a room share a display name. Propagate the assigned display name consistently across lobby, drawer label, chat messages, system notifications, scores, and leaderboards, while continuing to use unique socket IDs for permissions and scoring.
* **Rationale:** Eliminates player confusion in multiplayer rooms while preserving unique player identities across all game modes without requiring complex account databases.

---

### Decision 14: Canvas Fill / Paint Bucket Tool & Server-Enforced Drawing Authority
* **Decision:** Provide a Fill / Paint Bucket tool in the drawer toolbar alongside Brush and Eraser modes.
  1. **Flood Fill Algorithm:** Uses a high-performance, non-recursive 4-way scan/stack flood fill on the 2D canvas `ImageData` using packed 32-bit integers to prevent stack overflows and eliminate external dependencies.
  2. **Outline Preservation:** Applies a color tolerance threshold (32) so closed shape outlines and anti-aliased stroke borders are preserved without bleed-through or white halo artifacts.
  3. **Open Area Handling:** Unclosed shapes and open canvas areas flood to canvas boundaries correctly while preserving existing strokes. Duplicate fills on matching colors are safely short-circuited as no-ops.
  4. **Multiplayer Sync & Server Authority:** Emits `draw_fill` with normalized float coordinates ($0.0 \le x, y \le 1.0$) and target hex color. The server validates that only the active drawer during the `drawing` phase can emit `draw_fill`, returning `NOT_DRAWER` error to unauthorized clients.
  5. **Undo History Integration:** Fills are recorded as first-class actions in `DrawingState` history. Emitting `draw_undo` pops the most recent action (stroke or fill) and broadcasts `draw_sync`, deterministically replaying canvas actions in order for all clients.
* **Rationale:** Standard Pictionary drawing experience requirement, fully consistent with existing design tokens, authoritative server validation, and normalized cross-device rendering.


