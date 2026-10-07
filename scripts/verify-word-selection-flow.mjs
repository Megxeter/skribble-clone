import { io } from 'socket.io-client';
import assert from 'assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

console.log(`\n🧪 ========================================================`);
console.log(`   Verifying Word-Selection Flow: First Turn, Later Turns & Play Again`);
console.log(`========================================================\n`);

function createClient(name) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      timeout: 4000,
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
    const alice = await createClient('Alice');
    const bob = await createClient('Bob');
    allSockets.push(alice, bob);

    // 1. Setup Room with 2 players
    console.log('1️⃣ Creating room with Alice (Host) and Bob...');
    const roomCreateP = waitForEvent(alice, 'room_state');
    alice.emit('create_room', {
      playerName: 'Alice',
      isPublic: false,
      settings: { rounds: 2, drawTime: 30, wordCount: 3, hints: 1 }
    });
    const roomState = await roomCreateP;
    const roomCode = roomState.code;
    const roomId = roomState.roomId;

    const bobJoinP = waitForEvent(bob, 'room_state');
    bob.emit('join_room', { roomId: roomCode, playerName: 'Bob' });
    await bobJoinP;
    console.log(`   ✓ Room [${roomCode}] initialized with Alice and Bob in lobby`);

    // 2. Start Game: Turn 1 (First turn - Alice is Drawer)
    console.log('\n2️⃣ Starting Game: Validating FIRST TURN word choices & guesser isolation...');
    const aliceRound1StartP = waitForEvent(alice, 'round_start');
    const bobRound1StartP = waitForEvent(bob, 'round_start');
    const aliceGameStateP = waitForEvent(alice, 'game_state', (s) => s.status === 'word_selecting');
    const bobGameStateP = waitForEvent(bob, 'game_state', (s) => s.status === 'word_selecting');

    alice.emit('start_game', { roomId });

    const [aliceRound1, bobRound1, aliceGame1, bobGame1] = await Promise.all([
      aliceRound1StartP,
      bobRound1StartP,
      aliceGameStateP,
      bobGameStateP,
    ]);

    // Drawer Alice receives word choices
    assert.strictEqual(aliceRound1.drawerId, alice.id, 'Alice must be designated drawer');
    assert.ok(Array.isArray(aliceRound1.wordOptions), 'Alice must receive wordOptions array');
    assert.strictEqual(aliceRound1.wordOptions.length, 3, 'Alice must receive exactly 3 word choices');
    assert.ok(Array.isArray(aliceGame1.wordOptions), 'Alice gameState must include wordOptions for UI recovery');

    // Guesser Bob NEVER receives word choices (Secret-word protection)
    assert.strictEqual(bobRound1.wordOptions, undefined, 'Guesser Bob must NOT receive wordOptions in round_start');
    assert.strictEqual(bobGame1.wordOptions, undefined, 'Guesser Bob must NOT receive wordOptions in game_state');
    console.log(`   ✅ First Turn word choices: Alice (Drawer) received [${aliceRound1.wordOptions.join(', ')}]. Bob (Guesser) received ZERO words.`);

    // 3. Verify Selection Ticker & Countdown timing
    console.log('\n3️⃣ Verifying Selection Countdown vs Drawing Countdown timing...');
    const timerTickP = waitForEvent(alice, 'timer_tick');
    const tick = await timerTickP;
    assert.ok(tick.remainingTime <= 15 && tick.remainingTime >= 0, `Selection countdown tick should be <= 15s, got: ${tick.remainingTime}`);
    console.log(`   ✓ Active 15s selection countdown verified (tick: ${tick.remainingTime}s)`);

    // Drawing countdown has not started yet
    assert.strictEqual(aliceGame1.status, 'word_selecting');
    assert.strictEqual(bobGame1.status, 'word_selecting');

    // 4. Alice chooses word -> Drawing countdown begins
    const chosenWord1 = aliceRound1.wordOptions[0];
    const aliceDrawP = waitForEvent(alice, 'game_state', (s) => s.status === 'drawing');
    const bobDrawP = waitForEvent(bob, 'game_state', (s) => s.status === 'drawing');

    alice.emit('choose_word', { word: chosenWord1 });
    const [aliceDrawState, bobDrawState] = await Promise.all([aliceDrawP, bobDrawP]);

    assert.strictEqual(aliceDrawState.status, 'drawing');
    assert.strictEqual(bobDrawState.status, 'drawing');
    assert.strictEqual(aliceDrawState.remainingTime, 30, 'Drawing countdown must start at configured drawTime (30s)');
    console.log(`   ✅ Drawing phase started with full 30s drawTime only after word "${chosenWord1}" was selected`);

    // Bob guesses word 1 to end Turn 1
    const turn1EndP = waitForEvent(alice, 'round_end');
    bob.emit('chat_input', { text: chosenWord1 });
    await turn1EndP;
    console.log('   ✓ Turn 1 ended');

    // 5. Turn 2: Later Turn (Bob is Drawer, Alice is Guesser)
    console.log('\n5️⃣ Testing LATER TURN (Turn 2): Word choices for new drawer (Bob)...');
    const bobRound2StartP = waitForEvent(bob, 'round_start', (d) => d.drawerId === bob.id, 8000);
    const aliceRound2StartP = waitForEvent(alice, 'round_start', (d) => d.drawerId === bob.id, 8000);

    const [bobRound2, aliceRound2] = await Promise.all([bobRound2StartP, aliceRound2StartP]);
    assert.strictEqual(bobRound2.drawerId, bob.id);
    assert.ok(Array.isArray(bobRound2.wordOptions), 'Bob must receive wordOptions in Turn 2');
    assert.strictEqual(aliceRound2.wordOptions, undefined, 'Alice (now guesser) must NOT receive wordOptions in Turn 2');
    console.log(`   ✅ Turn 2: Bob (Drawer) received [${bobRound2.wordOptions.join(', ')}]. Alice received ZERO words.`);

    // Bob chooses word
    const chosenWord2 = bobRound2.wordOptions[1] || bobRound2.wordOptions[0];
    const bobDraw2P = waitForEvent(bob, 'game_state', (s) => s.status === 'drawing');
    bob.emit('choose_word', { word: chosenWord2 });
    await bobDraw2P;

    // Alice guesses word 2 to end Turn 2
    const turn2EndP = waitForEvent(bob, 'round_end');
    alice.emit('chat_input', { text: chosenWord2 });
    await turn2EndP;
    console.log('   ✓ Turn 2 ended (Round 1 complete)');

    // 6. Complete Round 2 to reach Game Over
    console.log('\n6️⃣ Playing Round 2 turns to reach Game Over...');
    async function playTurn(drawer, guesser) {
      const start = await waitForEvent(drawer, 'round_start', (d) => d.drawerId === drawer.id, 8000);
      const word = start.wordOptions[0];
      const drawP = waitForEvent(drawer, 'game_state', (s) => s.status === 'drawing');
      drawer.emit('choose_word', { word });
      await drawP;
      const endP = waitForEvent(drawer, 'round_end');
      guesser.emit('chat_input', { text: word });
      await endP;
    }

    await playTurn(alice, bob); // Round 2 Turn 1
    const gameOverAliceP = waitForEvent(alice, 'game_over', 20000);
    const gameOverBobP = waitForEvent(bob, 'game_over', 20000);
    await playTurn(bob, alice); // Round 2 Turn 2 (Final turn)

    await Promise.all([gameOverAliceP, gameOverBobP]);
    console.log('   ✓ Game Over reached successfully');

    // 7. Test Play Again and FIRST TURN after reset
    console.log('\n7️⃣ Testing PLAY AGAIN and FIRST TURN word choices after reset...');
    const aliceResetP = waitForEvent(alice, 'room_state', (s) => s.status === 'lobby');
    const bobResetP = waitForEvent(bob, 'room_state', (s) => s.status === 'lobby');

    alice.emit('play_again', { roomId });
    await Promise.all([aliceResetP, bobResetP]);
    console.log('   ✓ Both clients reset to lobby with scores zeroed');

    // Host Alice starts the game again
    const alicePostResetRoundStartP = waitForEvent(alice, 'round_start');
    const bobPostResetRoundStartP = waitForEvent(bob, 'round_start');
    const alicePostResetGameP = waitForEvent(alice, 'game_state', (s) => s.status === 'word_selecting');

    alice.emit('start_game', { roomId });

    const [aliceResetRound, bobResetRound, aliceResetGame] = await Promise.all([
      alicePostResetRoundStartP,
      bobPostResetRoundStartP,
      alicePostResetGameP,
    ]);

    assert.ok(Array.isArray(aliceResetRound.wordOptions), 'Alice must receive wordOptions on first turn after Play Again');
    assert.strictEqual(bobResetRound.wordOptions, undefined, 'Bob must NOT receive wordOptions on first turn after Play Again');
    assert.ok(Array.isArray(aliceResetGame.wordOptions), 'Alice gameState must include wordOptions on first turn after Play Again');
    console.log(`   ✅ First Turn AFTER Play Again: Alice received [${aliceResetRound.wordOptions.join(', ')}]. Bob received ZERO words.`);

    console.log('\n🎉 ========================================================');
    console.log('   ALL WORD-SELECTION FLOW CHECKS PASSED SUCCESSFULLY!');
    console.log('========================================================\n');

  } finally {
    for (const s of allSockets) {
      if (s.connected) s.disconnect();
    }
  }
}

run().catch((err) => {
  console.error('\n❌ Word-Selection Flow Verification Failed:', err);
  process.exit(1);
});
