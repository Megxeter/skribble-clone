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
   * Server picks 3 random words from the 300-word bank and sends them **strictly** to the active drawer socket and drawer game state.
   * Drawer selects one word via a modal overlay. If the 15-second selection countdown reaches 0, the server automatically selects Word #1.
   * Guessers remain on a dedicated waiting screen: `"Waiting for Word: [Player] is choosing a word to draw..."` with an active selection countdown timer.
2. **Drawing & Guessing Phase (e.g. 80 Seconds):**
   * The drawing countdown starts only after a word is selected or auto-picked.
   * Status banner above the canvas displays `"[Player] is drawing"`.
   * Canvas unlocks for the drawer with colors, brush sizes, eraser, undo, and clear tools.
   * Drawer chat and guesses are strictly blocked in both UI and on the server (`DRAWER_CANNOT_GUESS`).
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
   * After all configured rounds complete, the final leaderboard is computed and 1st, 2nd, and 3rd place winners are displayed. The host can click **Play Again** to reset scores and return to the lobby.

---

## 3. Room-Scoped Duplicate Name Numbering

* **Unique Names:** Display normally without numbers.
* **Matching Names:** When names match after trimming and case-insensitive comparison, the server assigns suffixes in join order (`Alice 1`, `Alice 2`, `Alice 3`).
* **Stability on Departures:** Assigned numbers remain strictly stable when players leave; remaining players are never renumbered.
* **New Arrivals Post-Departure:** Players joining after departures receive the next join-order number (e.g., `Alice 4`).
* **Disambiguation for Names with Numbers:** If a player enters a name that already contains a number or matches an active player's display name, the server disambiguates it so that no two active players in a room share a display name.
* **Consistent Propagation:** The assigned display name is used across the lobby roster, drawer status banner above the canvas, chat feed, notifications, scores, and leaderboard.
* **Authority:** Player IDs remain the sole authority for permissions and scoring. Display names are assigned strictly on the server.

---

## 4. Authoritative Time-Based Scoring Formulas

All scores are calculated strictly on the server:

$$\text{ratio} = \frac{t_{\text{remaining}}}{t_{\text{duration}}}$$

### Guesser Points Formula
$$\text{Guesser Points} = 100 + \lfloor 400 \times \text{ratio} \rfloor$$

* **Base Points:** $100$
* **Speed Bonus:** Up to $400$ points based on the time ratio.
* **Max Points:** $500$ points.
* **Min Points:** $100$ points.
* **Expired Guesses ($t_{\text{remaining}} \le 0$):** Rejected ($0$ points).
* **Award Frequency:** Awarded once per eligible correct guess.

### Drawer Points Formula
$$\text{Drawer Points} = 25 + \lfloor 100 \times \text{ratio} \rfloor$$

* **Award Frequency:** Awarded in real time once per eligible correct guess.
* **Max Points per Guesser:** $125$ points.
* **Min Points per Guesser:** $25$ points.

---

## 5. Anti-Spoiler Chat Shield & Word Protection

* **Secret Word Secrecy:** The plaintext word is never sent in guesser WebSocket payloads. Network tab inspection in browser dev tools only reveals masked blanks.
* **Chat Shield:** When a guesser submits the exact word:
  * The message is suppressed from public chat.
  * A green system announcement is broadcast: *"Player guessed the word!"*.
  * Post-guess messages are shielded from players who have not yet guessed.
* **Close Guess Feedback:** If a guess is within a 2-character Levenshtein edit distance (for words $\ge 4$ characters), the sender receives a private notice: *"'word' is very close!"*.
