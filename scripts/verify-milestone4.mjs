import { io } from 'socket.io-client';
import assert from 'assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

console.log(`\n🧪 ========================================================`);
console.log(`   Starting Milestone 4 Verification Suite against ${BASE_URL}`);
console.log(`   Chat, Guessing, Scoring, Anti-Spoiler Shield & Leaderboard`);
console.log(`========================================================\n`);

function createClient(name) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      timeout: 4000
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(new Error(`[${name}] connect error: ${err.message}`)));
  });
}

function waitForEvent(socket, event, predicateOrTimeout = null, timeoutMs = 8000) {
  const predicate = typeof predicateOrTimeout === 'function' ? predicateOrTimeout : null;
  const timeout = typeof predicateOrTimeout === 'number' ? predicateOrTimeout : timeoutMs;

  return new Promise((resolve, reject) => {
    let timer;

    const handler = (data) => {
      if (!predicate || predicate(data)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(data);
      }
    };

    timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for event "${event}" after ${timeout}ms`));
    }, timeout);

    socket.on(event, handler);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const allSockets = [];

  try {
    // ------------------------------------------------------------------------
    // 1. Room Setup & Room-Scoped Chat Isolation
    // ------------------------------------------------------------------------
    console.log('1️⃣ Setting up Room A (Alice, Bob, Charlie) & Room B (David)...');
    const alice = await createClient('Alice');
    const bob = await createClient('Bob');
    const charlie = await createClient('Charlie');
    const david = await createClient('David');
    allSockets.push(alice, bob, charlie, david);

    // Create Room A
    const aliceCreateP = waitForEvent(alice, 'room_state');
    alice.emit('create_room', {
      playerName: 'Alice',
      isPublic: false,
      settings: { rounds: 1, drawTime: 40, wordCount: 3, hints: 2 }
    });
    const roomA = await aliceCreateP;
    const roomACode = roomA.code;
    const roomAId = roomA.roomId;

    // Bob & Charlie join Room A
    const bobJoinP = waitForEvent(bob, 'room_state');
    bob.emit('join_room', { roomId: roomACode, playerName: 'Bob' });
    await bobJoinP;

    const charlieJoinP = waitForEvent(charlie, 'room_state');
    charlie.emit('join_room', { roomId: roomACode, playerName: 'Charlie' });
    await charlieJoinP;

    // David creates Room B
    const davidCreateP = waitForEvent(david, 'room_state');
    david.emit('create_room', {
      playerName: 'David',
      isPublic: false,
      settings: { rounds: 1, drawTime: 40, wordCount: 3, hints: 2 }
    });
    const roomB = await davidCreateP;
    console.log(`   ✓ Room A created [${roomACode}] (3 players) & Room B [${roomB.code}] (1 player)`);

    // Verify room-scoped chat isolation
    console.log('\n2️⃣ Testing Pre-Game Room Chat & Cross-Room Isolation...');
    let davidReceivedChat = false;
    david.on('chat_message', () => { davidReceivedChat = true; });

    const bobChatP = waitForEvent(bob, 'chat_message');
    const charlieChatP = waitForEvent(charlie, 'chat_message');
    alice.emit('chat_input', { text: 'Welcome to room A!' });

    const [bobMsg, charlieMsg] = await Promise.all([bobChatP, charlieChatP]);
    assert.strictEqual(bobMsg.text, 'Welcome to room A!');
    assert.strictEqual(bobMsg.senderName, 'Alice');
    assert.strictEqual(charlieMsg.text, 'Welcome to room A!');
    await sleep(100);
    assert.strictEqual(davidReceivedChat, false, 'David in Room B must NOT receive Room A chat');
    console.log('   ✅ Room-scoped chat verified. David in Room B received 0 messages from Room A.');

    // ------------------------------------------------------------------------
    // 3. Start Game: Turn 1 (Alice is Drawer)
    // ------------------------------------------------------------------------
    console.log('\n3️⃣ Starting Game: Word Selection for Drawer Alice...');
    const aliceRoundStartP = waitForEvent(alice, 'round_start');
    const bobRoundStartP = waitForEvent(bob, 'round_start');
    alice.emit('start_game', { roomId: roomAId });

    const [aliceRoundStart] = await Promise.all([aliceRoundStartP, bobRoundStartP]);
    assert.strictEqual(aliceRoundStart.drawerId, alice.id);
    const chosenWord = aliceRoundStart.wordOptions[0];
    assert.ok(chosenWord && chosenWord.length >= 3, `Expected valid chosen word: ${chosenWord}`);
    console.log(`   ✓ Alice offered words: [${aliceRoundStart.wordOptions.join(', ')}]. Picking: "${chosenWord}"`);

    // Alice chooses the word
    const aliceDrawStateP = waitForEvent(alice, 'game_state', (s) => s.status === 'drawing');
    const bobDrawStateP = waitForEvent(bob, 'game_state', (s) => s.status === 'drawing');
    alice.emit('choose_word', { word: chosenWord });
    const [aliceDrawState, bobDrawState] = await Promise.all([aliceDrawStateP, bobDrawStateP]);
    assert.strictEqual(aliceDrawState.status, 'drawing');
    assert.strictEqual(bobDrawState.status, 'drawing');
    console.log(`   ✓ Drawing phase started. Drawer sees: "${aliceDrawState.maskedWord}". Guesser sees: "${bobDrawState.maskedWord}"`);

    // ------------------------------------------------------------------------
    // 4. Drawer Cannot Guess or Leak Secret Word
    // ------------------------------------------------------------------------
    console.log('\n4️⃣ Testing Server Enforcement: Drawer Cannot Guess Secret Word...');
    let guessersSawSecretWord = false;
    const checkLeak = (msg) => {
      if (msg.text && msg.text.toUpperCase() === chosenWord.toUpperCase()) {
        guessersSawSecretWord = true;
      }
    };
    bob.on('chat_message', checkLeak);
    charlie.on('chat_message', checkLeak);

    const drawerErrP = waitForEvent(alice, 'error_message');
    alice.emit('chat_input', { text: chosenWord });
    const drawerErr = await drawerErrP;
    assert.strictEqual(drawerErr.code, 'DRAWER_CANNOT_GUESS');

    // Also verify normal chat from drawer is blocked during drawing
    const drawerChatErrP = waitForEvent(alice, 'error_message');
    alice.emit('chat_input', { text: 'hello players' });
    const drawerChatErr = await drawerChatErrP;
    assert.strictEqual(drawerChatErr.code, 'DRAWER_CANNOT_GUESS');

    await sleep(100);
    assert.strictEqual(guessersSawSecretWord, false, 'CRITICAL: Secret word must NOT be sent to room when drawer types it');
    console.log(`   ✅ Drawer chat and guessing blocked with DRAWER_CANNOT_GUESS. Secret word was shielded from guessers.`);

    bob.off('chat_message', checkLeak);
    charlie.off('chat_message', checkLeak);

    // ------------------------------------------------------------------------
    // 5. Incorrect Guess & Near-Miss Detection ("You're close!")
    // ------------------------------------------------------------------------
    console.log('\n5️⃣ Testing Incorrect Guess & Near-Miss Feedback...');
    // 5a. Regular incorrect guess
    const bobIncorrectAliceP = waitForEvent(alice, 'chat_message');
    const bobIncorrectBobP = waitForEvent(bob, 'chat_message');
    bob.emit('chat_input', { text: 'totallywrongguess' });
    const [incorrectMsg] = await Promise.all([bobIncorrectAliceP, bobIncorrectBobP]);
    assert.strictEqual(incorrectMsg.text, 'totallywrongguess');
    assert.strictEqual(incorrectMsg.senderName, 'Bob');
    console.log(`   ✓ Regular incorrect guess broadcasted as normal chat`);

    // 5b. Near-miss guess (Levenshtein distance <= 2 for words >= 4 letters)
    if (chosenWord.length >= 4) {
      // Modify last letter to create distance 1
      const closeWord = chosenWord.slice(0, -1) + (chosenWord.slice(-1) === 'Z' ? 'Y' : 'Z');
      let charlieSawClose = false;
      charlie.on('chat_message', (m) => {
        if (m.type === 'close') charlieSawClose = true;
      });

      const bobCloseP = waitForEvent(bob, 'chat_message', (m) => m.type === 'close');
      bob.emit('chat_input', { text: closeWord });
      const closeMsg = await bobCloseP;

      // Bob receives private 'close' notification
      if (closeMsg.type === 'close') {
        assert.ok(closeMsg.text.includes('is very close!'));
        console.log(`   ✓ Bob received private near-miss feedback: "${closeMsg.text}"`);
      }
      await sleep(100);
      assert.strictEqual(charlieSawClose, false, 'Charlie must NOT receive Bob\'s private near-miss notification');
      console.log('   ✅ Near-miss feedback is strictly private to the guesser.');
    } else {
      console.log(`   (Skipping near-miss test because chosen word length < 4: "${chosenWord}")`);
    }

    // ------------------------------------------------------------------------
    // 6. Correct Guess, Scoring Formula & Anti-Spoiler Shield
    // ------------------------------------------------------------------------
    console.log('\n6️⃣ Testing Correct Guess, Anti-Spoiler Shield & First Guesser Scoring...');
    let charlieHeardSecretWord = false;
    const monitorCharlie = (m) => {
      if (m.text && m.text.toLowerCase().includes(chosenWord.toLowerCase())) {
        charlieHeardSecretWord = true;
      }
    };
    charlie.on('chat_message', monitorCharlie);

    const bobCorrectGuessEventP = waitForEvent(bob, 'correct_guess');
    const aliceCorrectGuessEventP = waitForEvent(alice, 'correct_guess');
    const bobPrivateNoticeP = waitForEvent(bob, 'chat_message', (m) => m.type === 'system');
    const charliePublicNoticeP = waitForEvent(charlie, 'chat_message', (m) => m.type === 'system');

    // Bob sends exact word with lowercase and surrounding spaces to verify trimming & case-insensitivity
    bob.emit('chat_input', { text: `   ${chosenWord.toLowerCase()}   ` });

    const [bobGuessEvt, aliceGuessEvt, bobNotice, charlieNotice] = await Promise.all([
      bobCorrectGuessEventP,
      aliceCorrectGuessEventP,
      bobPrivateNoticeP,
      charliePublicNoticeP,
    ]);

    // Validate correct_guess event
    assert.strictEqual(bobGuessEvt.playerId, bob.id);
    assert.strictEqual(bobGuessEvt.playerName, 'Bob');
    assert.ok(bobGuessEvt.pointsEarned >= 100, `Expected points >= 100, got: ${bobGuessEvt.pointsEarned}`);
    assert.strictEqual(aliceGuessEvt.pointsEarned, bobGuessEvt.pointsEarned);

    // Scoring formula verification:
    // ratio = remainingTime / turnDuration
    // guesser = 100 + floor(400 * ratio)
    // drawer = 25 + floor(100 * ratio)
    // drawTime = 40. Remaining time is ~38-39s -> ratio ~ 0.95 -> points ~ 480
    console.log(`   ✓ Bob points earned: ${bobGuessEvt.pointsEarned} (formula: 100 + floor(400 * ratio))`);
    assert.ok(bobGuessEvt.pointsEarned >= 450, `Expected high score for fast guess, got: ${bobGuessEvt.pointsEarned}`);

    // Validate Anti-Spoiler Shield
    // Guesser gets private: "You guessed the word! (+N points)"
    assert.strictEqual(bobNotice.type, 'system');
    assert.ok(bobNotice.text.includes('You guessed the word!'));

    // Other players get: "Bob guessed the word!" (NO secret word revealed)
    assert.strictEqual(charlieNotice.type, 'system');
    assert.strictEqual(charlieNotice.text, 'Bob guessed the word!');
    await sleep(100);
    assert.strictEqual(charlieHeardSecretWord, false, 'CRITICAL: Secret word must NEVER be revealed in public chat!');
    console.log('   ✅ Anti-spoiler shield verified. Secret word was completely suppressed from chat.');

    charlie.off('chat_message', monitorCharlie);

    // ------------------------------------------------------------------------
    // 7. Duplicate Guess Prevention & Shielded Post-Guess Chat
    // ------------------------------------------------------------------------
    console.log('\n7️⃣ Testing Duplicate Guess Prevention & Shielded Chat Routing...');
    let bobDuplicateScored = false;
    bob.on('correct_guess', () => { bobDuplicateScored = true; });

    let charlieSawShieldedChat = false;
    charlie.on('chat_message', (m) => {
      if (m.text === 'I already guessed, now I talk with drawer') {
        charlieSawShieldedChat = true;
      }
    });

    const aliceShieldedChatP = waitForEvent(alice, 'chat_message');
    // Bob sends another message after already guessing
    bob.emit('chat_input', { text: 'I already guessed, now I talk with drawer' });
    const aliceShieldedMsg = await aliceShieldedChatP;
    assert.strictEqual(aliceShieldedMsg.text, 'I already guessed, now I talk with drawer');

    // Bob attempts to submit the secret word a second time
    bob.emit('chat_input', { text: chosenWord });
    await sleep(200);

    assert.strictEqual(bobDuplicateScored, false, 'Player who already guessed must NOT score points again');
    assert.strictEqual(charlieSawShieldedChat, false, 'Unguessed player Charlie must NOT see Bob post-guess shielded chat');
    console.log('   ✅ Duplicate scoring prevented & post-guess chat shielded from non-guessers.');

    // ------------------------------------------------------------------------
    // 8. Second Guesser & All-Guessed Early Turn End
    // ------------------------------------------------------------------------
    console.log('\n8️⃣ Testing Second Guesser & Automatic Turn End (ALL_GUESSED)...');
    const charlieCorrectP = waitForEvent(charlie, 'correct_guess');
    const aliceRoundEndP = waitForEvent(alice, 'round_end', 7000);
    const bobRoundEndP = waitForEvent(bob, 'round_end', 7000);

    charlie.emit('chat_input', { text: chosenWord });

    const [charlieCorrect, aliceRoundEnd, bobRoundEnd] = await Promise.all([
      charlieCorrectP,
      aliceRoundEndP,
      bobRoundEndP,
    ]);

    // Charlie is second guesser: first bonus = 0
    console.log(`   ✓ Charlie guessed! Points earned: ${charlieCorrect.pointsEarned}`);
    assert.strictEqual(aliceRoundEnd.reason, 'ALL_GUESSED');
    assert.strictEqual(aliceRoundEnd.secretWord, chosenWord);

    // Drawer scoring: 25 + floor(100 * ratio) awarded per eligible correct guess
    const aliceTurnPts = aliceRoundEnd.roundPoints[alice.id];
    console.log(`   ✓ Drawer Alice awarded: ${aliceTurnPts} pts (formula: 25 + floor(100 * ratio) per guesser)`);
    assert.ok(aliceTurnPts >= 200, `Expected drawer to receive >= 200 points, got: ${aliceTurnPts}`);
    console.log('   ✅ Turn ended automatically with reason ALL_GUESSED and correct drawer scoring.');

    // ------------------------------------------------------------------------
    // 9. Play Remaining Turns to Verify GameOver & Leaderboard
    // ------------------------------------------------------------------------
    console.log('\n9️⃣ Advancing turns to complete 2 Rounds and verify Game Over & Leaderboard...');
    async function playTurn(drawer, guessers) {
      const roundStart = await waitForEvent(drawer, 'round_start', (d) => d.drawerId === drawer.id, 8000);
      const word = roundStart.wordOptions[0];
      const drawStateP = waitForEvent(drawer, 'game_state', (s) => s.status === 'drawing');
      drawer.emit('choose_word', { word });
      await drawStateP;

      const roundEndP = waitForEvent(drawer, 'round_end', 8000);
      for (const g of guessers) {
        g.emit('chat_input', { text: word });
      }
      await roundEndP;
    }

    // Round 1 remaining turns:
    console.log('   Playing Round 1 Turn 2 (Bob)...');
    await playTurn(bob, [alice, charlie]);
    console.log('   Playing Round 1 Turn 3 (Charlie)...');
    await playTurn(charlie, [alice, bob]);

    // Round 2 turns (rounds setting defaults/clamps to 2):
    console.log('   Playing Round 2 Turn 1 (Alice)...');
    await playTurn(alice, [bob, charlie]);
    console.log('   Playing Round 2 Turn 2 (Bob)...');
    await playTurn(bob, [alice, charlie]);
    console.log('   Playing Round 2 Turn 3 (Charlie - Final turn)...');

    const charlieFinalStart = await waitForEvent(charlie, 'round_start', (d) => d.drawerId === charlie.id, 8000);
    const finalWord = charlieFinalStart.wordOptions[0];
    const charlieFinalDrawP = waitForEvent(charlie, 'game_state', (s) => s.status === 'drawing');
    charlie.emit('choose_word', { word: finalWord });
    await charlieFinalDrawP;

    const roundEndFinalP = waitForEvent(charlie, 'round_end', 8000);
    const gameOverAliceP = waitForEvent(alice, 'game_over', 10000);
    const gameOverBobP = waitForEvent(bob, 'game_over', 10000);

    alice.emit('chat_input', { text: finalWord });
    bob.emit('chat_input', { text: finalWord });

    await roundEndFinalP;
    console.log('   ✓ Final turn concluded. Waiting for Game Over event...');

    const [gameOverAlice, gameOverBob] = await Promise.all([gameOverAliceP, gameOverBobP]);
    assert.ok(Array.isArray(gameOverAlice.leaderboard), 'Expected leaderboard array in game_over payload');
    assert.strictEqual(gameOverAlice.leaderboard.length, 3, 'Expected 3 players on leaderboard');

    // Verify descending order of scores
    for (let i = 0; i < gameOverAlice.leaderboard.length - 1; i++) {
      assert.ok(
        gameOverAlice.leaderboard[i].score >= gameOverAlice.leaderboard[i + 1].score,
        'Leaderboard must be sorted descending by score'
      );
    }
    assert.ok(gameOverAlice.winner, 'Expected a winner in game_over payload');
    assert.strictEqual(gameOverAlice.winner.id, gameOverAlice.leaderboard[0].id);
    console.log(`   ✓ Final Rankings:`);
    gameOverAlice.leaderboard.forEach((p, idx) => {
      console.log(`      #${idx + 1}: ${p.name} - ${p.score} pts`);
    });
    console.log(`   ✅ Game Over leaderboard verified. Winner: ${gameOverAlice.winner.name}`);

    // ------------------------------------------------------------------------
    // 10. Play Again (Host resets room to lobby with 0 scores)
    // ------------------------------------------------------------------------
    console.log('\n🔟 Testing Host Play Again & Score Reset to Lobby...');
    const aliceResetP = waitForEvent(alice, 'room_state', (s) => s.status === 'lobby');
    const bobResetP = waitForEvent(bob, 'room_state', (s) => s.status === 'lobby');
    const charlieResetP = waitForEvent(charlie, 'room_state', (s) => s.status === 'lobby');

    alice.emit('play_again', { roomId: roomACode });

    const [aliceResetState] = await Promise.all([aliceResetP, bobResetP, charlieResetP]);
    assert.strictEqual(aliceResetState.status, 'lobby');
    assert.strictEqual(aliceResetState.players.length, 3);
    for (const p of aliceResetState.players) {
      assert.strictEqual(p.score, 0, `Player ${p.name} score should be reset to 0`);
      assert.strictEqual(p.hasGuessed, false);
      assert.strictEqual(p.isDrawer, false);
    }
    console.log('   ✅ Play Again successfully reset room to lobby with all scores zeroed.');

    console.log('\n🎉 ========================================================');
    console.log('   ALL MILESTONE 4 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    console.log('========================================================\n');

  } finally {
    for (const s of allSockets) {
      if (s.connected) s.disconnect();
    }
  }
}

run().catch((err) => {
  console.error('\n❌ Milestone 4 Verification Failed:', err);
  process.exit(1);
});
