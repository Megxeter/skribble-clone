# Game Rules & Mechanics — skribbl.io Clone

## 1. Configurable Room Settings & Ranges

When creating a room, the host can configure the following settings:

| Setting | Allowed Range | Default | Description |
| :--- | :--- | :--- | :--- |
| **Max Players** | 2 – 20 players | 8 | Maximum simultaneous participants allowed in the lobby. |
| **Rounds** | 2 – 10 rounds | 3 | Total number of full cycles where every player draws once. |
| **Draw Time** | 15 – 240 seconds | 80s | Authoritative time allotted for drawing and guessing. |
| **Word Choices** | 1 – 5 words | 3 | Number of random words presented to the drawer. |
| **Hints** | 0 – 5 letters | 2 | Number of timed progressive letter hints revealed per turn. |

---

## 2. Turn Lifecycle & State Flow

Each round consists of alternating turns where every connected player draws once:

1. **Word Selection Phase (15 Seconds):**
   * Server picks 3 random words from the 300-word bank and sends them **only** to the active drawer.
   * Drawer selects one word. If timeout expires, the server auto-selects a word.
   * Guessers see: `"Player is choosing a word..."`.
2. **Drawing & Guessing Phase (e.g. 80 Seconds):**
   * Canvas unlocks for the drawer with colors, brush sizes, eraser, undo, and clear tools.
   * Guessers see masked blanks representing word length (e.g., `_ _ _ _ _`).
   * Authoritative server clock counts down by 1 second intervals.
   * At 50% elapsed time, letter hint 1 is revealed (e.g., `_ P _ _ _`).
   * At 75% elapsed time, letter hint 2 is revealed (e.g., `_ P _ L _`).
3. **Turn Ending Conditions (Whichever happens first):**
   * **Time Up:** Authoritative timer reaches 0.
   * **All Guessed:** Every active guesser has successfully deduced the word.
   * **Drawer Disconnects:** Drawer leaves or loses connection.
4. **Round End & Intermission (5 Seconds):**
   * Secret word is revealed to all players.
   * Scoreboard updates with points earned during the turn.
   * Turn advances to the next player in the rotation.
5. **Game Over & Podium:**
   * After all configured rounds complete, the final leaderboard is computed and 1st, 2nd, and 3rd place winners are displayed on the podium.

---

## 3. Authoritative Scoring Formulas

All scores are calculated strictly on the server:

### Guesser Points Formula
Guesser points reward rapid guessing and scale with remaining time:

$$\text{Guesser Points} = 100 + \left\lfloor \frac{\text{Remaining Time}}{\text{Total Draw Time}} \times 400 \right\rfloor + \text{First Guesser Bonus}$$

* **Base Points:** $100$
* **Speed Bonus:** Up to $400$ points (proportional to time remaining).
* **First Guesser Bonus:** $+50$ points awarded to the very first player who guesses correctly.
* **Guesser Range:** $100$ to $550$ points.

### Drawer Points Formula
The drawer is rewarded for recognizable doodles based on how many players guessed the word:

$$\text{Drawer Points} = \text{Successful Guessers Count} \times 75$$

---

## 4. Anti-Spoiler Chat Shield & Word Protection

* **Secret Word Secrecy:** The plaintext word is never sent in guesser WebSocket payloads. Network tab inspection in browser dev tools only reveals masked blanks.
* **Chat Shield:** When a guesser submits the exact word:
  * The message is suppressed from public chat.
  * A green system announcement is broadcast: *"Player guessed the word!"*.
  * The guesser's chat input is disabled or isolated to prevent spoiling for remaining players.
* **Close Guess Feedback:** If a guess is within a 1-character Levenshtein edit distance, the sender receives a private warning: *"'word' is close!"*.
