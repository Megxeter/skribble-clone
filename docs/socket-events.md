# Socket.IO Event Contracts & Protocol Reference

This document provides the authoritative reference for all WebSocket event contracts exchanged between the client and server in **skribbl-clone**.

All events use constants defined in [`@skribbl/shared`](../shared/events.ts) and payload interfaces defined in [`@skribbl/shared/types`](../shared/types.ts).

---

## 1. Connection & Lifecycle

| Event | Direction | Payload | Description |
| :--- | :---: | :--- | :--- |
| `connect` | Bidirectional | None | Native Socket.IO connection established. |
| `disconnect` | Bidirectional | `string` (reason) | Client disconnected from server. |
| `error_message` | Server -> Client | `ErrorPayload` | Server rejected an action with structured error code and user-facing message. |

### `ErrorPayload`
```typescript
interface ErrorPayload {
  code:
    | 'INSUFFICIENT_PLAYERS'
    | 'ROOM_FULL'
    | 'ROOM_NOT_FOUND'
    | 'GAME_IN_PROGRESS'
    | 'SERVER_ERROR'
    | 'UNAUTHORIZED'
    | 'INVALID_SETTINGS'
    | 'NOT_DRAWER'
    | 'INVALID_WORD'
    | 'DRAWER_CANNOT_GUESS';
  message: string;
}
```

---

## 2. Room & Matchmaking Contracts

| Event | Direction | Payload | Description |
| :--- | :---: | :--- | :--- |
| `create_room` | Client -> Server | `CreateRoomPayload` | Requests creation of a new room with custom settings and visibility. |
| `join_room` | Client -> Server | `JoinRoomPayload` | Joins a room by its 6-character room code or internal ID. |
| `join_public` | Client -> Server | `JoinPublicPayload` | Joins an open public room, or creates one if none available. |
| `leave_room` | Client -> Server | `LeaveRoomPayload` | Gracefully departs the current room. |
| `update_settings` | Client -> Server | `UpdateSettingsPayload` | Host updates room settings (maxPlayers, rounds, drawTime, wordCount, hints). |
| `set_ready` | Client -> Server | `SetReadyPayload` | Player toggles their ready status. |
| `start_game` | Client -> Server | `StartGamePayload` | Host initiates game start (requires at least 2 connected players). |
| `room_state` | Server -> Client | `RoomStatePayload` | Full snapshot of room metadata, settings, player roster, host ID, and status. |
| `player_joined` | Server -> Client | `PlayerJoinedPayload` | Emitted when a new player connects to the room. |
| `player_left` | Server -> Client | `PlayerLeftPayload` | Emitted when a player leaves or disconnects. |

---

## 3. Game Lifecycle & Turn Flow Contracts

| Event | Direction | Payload | Description |
| :--- | :---: | :--- | :--- |
| `game_state` | Server -> Client | `GameStatePayload` | Synchronized game state snapshot (round, drawer, masked blanks, timer). |
| `round_start` | Server -> Client | `RoundStartPayload` | Initiates word selection phase. Drawer receives `wordOptions`; guessers receive masked blanks. |
| `choose_word` | Client -> Server | `ChooseWordPayload` | Active drawer picks 1 of the offered word options. |
| `timer_tick` | Server -> Client | `TimerTickPayload` | 1-second countdown clock update during selection and drawing phases. |
| `hint_revealed` | Server -> Client | `HintRevealedPayload` | Progressive letter clue revealed at 50% or 75% elapsed turn time. |
| `round_end` | Server -> Client | `RoundEndPayload` | Turn concluded. Reveals secret word, round points, and next drawer. |
| `game_over` | Server -> Client | `GameOverPayload` | All rounds finished. Contains ranked leaderboard and winner. |
| `play_again` | Client -> Server | `PlayAgainPayload` | Host resets the room back to the lobby with all scores set to 0. |

### `RoundStartPayload`
```typescript
interface RoundStartPayload {
  drawerId: string;
  drawerName?: string;
  wordOptions?: string[]; // Sent ONLY to active drawer socket
  drawTime: number;
  round: number;
}
```

### `RoundEndPayload`
```typescript
interface RoundEndPayload {
  secretWord: string;
  reason: 'TIME_UP' | 'ALL_GUESSED' | 'DRAWER_DISCONNECTED';
  scores: Record<string, number>;
  roundPoints: Record<string, number>;
  nextDrawerId?: string;
}
```

---

## 4. Real-Time Canvas Drawing Contracts

All drawing coordinates are transmitted as **normalized ratios** ($0.0 \le x, y \le 1.0$), scaling identically across any display aspect ratio.

| Event | Direction | Payload | Description |
| :--- | :---: | :--- | :--- |
| `draw_start` | Client -> Server -> Client | `DrawStartPayload` | Drawer begins a new stroke at normalized `(x, y)` with chosen color and size. |
| `draw_move` | Client -> Server -> Client | `DrawMovePayload` | Drawer extends the active stroke to normalized `(x, y)`. |
| `draw_end` | Client -> Server -> Client | `DrawEndPayload` | Drawer concludes the active stroke. |
| `draw_fill` | Client -> Server -> Client | `DrawFillPayload` | Drawer floods a closed shape or open region at normalized `(x, y)` with color. |
| `draw_undo` | Client -> Server -> Client | None | Drawer removes their most recent stroke or fill. Server broadcasts updated `draw_sync`. |
| `canvas_clear` | Client -> Server -> Client | None | Drawer wipes the canvas clean. Server clears stroke buffer. |
| `draw_sync` | Server -> Client | `DrawSyncPayload` | Authoritative stroke buffer sent to late joiners or after undo. |

---

## 5. Chat & Guessing Contracts

| Event | Direction | Payload | Description |
| :--- | :---: | :--- | :--- |
| `chat_input` | Client -> Server | `ChatInputPayload` | Player submits text (guess or message). |
| `chat_message` | Server -> Client | `ChatMessagePayload` | Broadcast chat message, system announcement, or private near-miss toast. |
| `correct_guess` | Server -> Client | `CorrectGuessPayload` | Emitted when a guesser correctly deduces the secret word. |

### `ChatMessagePayload`
```typescript
interface ChatMessagePayload {
  senderId: string;
  senderName: string;
  text: string;
  type: 'chat' | 'system' | 'close';
}
```

### `CorrectGuessPayload`
```typescript
interface CorrectGuessPayload {
  playerId: string;
  playerName: string;
  pointsEarned: number;
}
```

---

## 6. Security & Invariant Rules

1. **Secret Word Confidentiality:** Plaintext `secretWord` is NEVER transmitted in any WebSocket packet to non-drawing clients until `round_end`.
2. **Drawer Restriction:** The active drawer is blocked from chatting and guessing during drawing in both the UI and on the server (`DRAWER_CANNOT_GUESS`).
3. **Anti-Spoiler Shield:** When a guesser submits the correct word, the plaintext word is suppressed from public chat. The server broadcasts a green system announcement: `"{playerName} guessed the word!"`.
4. **Shielded Post-Guess Chat:** Once a player guesses correctly, their subsequent chat messages are visible only to fellow successful guessers and the drawer.
5. **Drawer Authority:** Drawing events (`draw_start`, `draw_move`, `draw_end`, `draw_fill`, `draw_undo`, `canvas_clear`) submitted by non-drawers are rejected with `NOT_DRAWER`.
