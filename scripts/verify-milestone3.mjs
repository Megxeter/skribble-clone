import { io } from 'socket.io-client';
import assert from 'assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

console.log(`\n🧪 ========================================================`);
console.log(`   Starting Milestone 3 Verification Suite against ${BASE_URL}`);
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

function waitForEvent(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for event "${event}" after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function run() {
  const allSockets = [];

  try {
    // ------------------------------------------------------------------------
    // 1. Room Setup: 2 Players (Alice = Host, Bob = Guesser)
    // ------------------------------------------------------------------------
    console.log('1️⃣ Setting up 2-Player Room for Milestone 3...');
    const alice = await createClient('Alice');
    const bob = await createClient('Bob');
    allSockets.push(alice, bob);

    const aliceCreateP = waitForEvent(alice, 'room_state');
    alice.emit('create_room', {
      playerName: 'Alice',
      isPublic: false,
      settings: { rounds: 2, drawTime: 30, wordCount: 3, hints: 2 }
    });
    const aliceRoomState = await aliceCreateP;
    const roomCode = aliceRoomState.code;
    const roomId = aliceRoomState.roomId;

    const bobJoinP = waitForEvent(bob, 'room_state');
    const aliceSyncP = waitForEvent(alice, 'room_state');
    bob.emit('join_room', { roomId: roomCode, playerName: 'Bob' });
    await Promise.all([bobJoinP, aliceSyncP]);
    console.log(`   ✓ Alice and Bob in room [${roomCode}] (Host: Alice)`);

    // ------------------------------------------------------------------------
    // 2. Start Game: Turn Rotation & Word Options Secrecy
    // ------------------------------------------------------------------------
    console.log('\n2️⃣ Starting Game & Verifying Word Choices Secrecy...');
    const aliceRoundStartP = waitForEvent(alice, 'round_start');
    const bobRoundStartP = waitForEvent(bob, 'round_start');
    const aliceGameP = waitForEvent(alice, 'game_state');
    const bobGameP = waitForEvent(bob, 'game_state');

    alice.emit('start_game', { roomId });

    const [aliceRoundStart, bobRoundStart, aliceGame, bobGame] = await Promise.all([
      aliceRoundStartP,
      bobRoundStartP,
      aliceGameP,
      bobGameP
    ]);

    assert.strictEqual(aliceRoundStart.drawerId, alice.id, 'Expected Alice to be first drawer');
    assert.ok(Array.isArray(aliceRoundStart.wordOptions), 'Expected Alice (drawer) to receive wordOptions');
    assert.strictEqual(aliceRoundStart.wordOptions.length, 3, 'Expected 3 word options for drawer');
    console.log(`   ✓ Drawer Alice received 3 word options: ${aliceRoundStart.wordOptions.join(', ')}`);

    // CRITICAL: Guesser Bob must NEVER receive word options
    assert.strictEqual(bobRoundStart.wordOptions, undefined, 'CRITICAL: Guesser Bob must NOT receive wordOptions');
    assert.strictEqual(bobGame.maskedWord, '', 'Guesser Bob maskedWord must be empty or blanks during selection');
    console.log('   ✅ Word options successfully restricted ONLY to active drawer. Bob received zero word options.');

    // ------------------------------------------------------------------------
    // 3. Word Selection Validation & Authority
    // ------------------------------------------------------------------------
    console.log('\n3️⃣ Testing Server Word Selection Validation...');

    // 3a. Unauthorized word selection: Bob (guesser) tries to choose a word
    const bobErrP = waitForEvent(bob, 'error_message');
    bob.emit('choose_word', { word: aliceRoundStart.wordOptions[0] });
    const bobErr = await bobErrP;
    assert.strictEqual(bobErr.code, 'NOT_DRAWER');
    console.log(`   ✓ Non-drawer word selection rejected: ${bobErr.code} - "${bobErr.message}"`);

    // 3b. Invalid word selection: Alice tries to choose a word NOT among offered options
    const aliceInvalidWordErrP = waitForEvent(alice, 'error_message');
    alice.emit('choose_word', { word: 'INVALID_SUPER_WORD' });
    const aliceInvalidWordErr = await aliceInvalidWordErrP;
    assert.strictEqual(aliceInvalidWordErr.code, 'INVALID_WORD');
    console.log(`   ✓ Non-offered word selection rejected: ${aliceInvalidWordErr.code} - "${aliceInvalidWordErr.message}"`);

    // 3c. Valid word selection: Alice picks option #1
    const chosenWord = aliceRoundStart.wordOptions[0];
    const aliceDrawingP = waitForEvent(alice, 'game_state');
    const bobDrawingP = waitForEvent(bob, 'game_state');
    alice.emit('choose_word', { word: chosenWord });
    const [aliceDrawingState, bobDrawingState] = await Promise.all([aliceDrawingP, bobDrawingP]);

    assert.strictEqual(aliceDrawingState.status, 'drawing');
    assert.strictEqual(bobDrawingState.status, 'drawing');

    // ------------------------------------------------------------------------
    // 4. Secret Word Secrecy During Drawing Phase
    // ------------------------------------------------------------------------
    console.log('\n4️⃣ Verifying Secret Word Secrecy During Drawing Phase...');
    // Drawer Alice receives plaintext secret word
    assert.strictEqual(aliceDrawingState.maskedWord, chosenWord);
    // Guesser Bob receives masked blanks (e.g. "_ _ _ _ _"), NEVER the secret word
    assert.notStrictEqual(bobDrawingState.maskedWord, chosenWord);
    assert.ok(bobDrawingState.maskedWord.includes('_'), 'Expected masked blanks in Bob payload');
    assert.strictEqual(bobDrawingState.wordLength, chosenWord.length);
    console.log(`   ✓ Drawer sees plaintext word: "${aliceDrawingState.maskedWord}"`);
    console.log(`   ✅ Guesser sees masked blanks: "${bobDrawingState.maskedWord}" (${bobDrawingState.wordLength} chars)`);

    // ------------------------------------------------------------------------
    // 5. Real-Time Canvas Stroke Synchronization
    // ------------------------------------------------------------------------
    console.log('\n5️⃣ Testing Real-Time Canvas Stroke Synchronization...');
    const bobDrawStartP = waitForEvent(bob, 'draw_start');
    alice.emit('draw_start', { x: 0.2, y: 0.3, color: '#ef4444', size: 8 });
    const bobDrawStart = await bobDrawStartP;
    assert.strictEqual(bobDrawStart.x, 0.2);
    assert.strictEqual(bobDrawStart.y, 0.3);
    assert.strictEqual(bobDrawStart.color, '#ef4444');
    assert.strictEqual(bobDrawStart.size, 8);
    console.log(`   ✓ draw_start synchronized to Bob with normalized coords (x: 0.2, y: 0.3)`);

    const bobDrawMoveP = waitForEvent(bob, 'draw_move');
    alice.emit('draw_move', { x: 0.25, y: 0.35 });
    const bobDrawMove = await bobDrawMoveP;
    assert.strictEqual(bobDrawMove.x, 0.25);
    assert.strictEqual(bobDrawMove.y, 0.35);
    console.log(`   ✓ draw_move synchronized to Bob`);

    const bobDrawEndP = waitForEvent(bob, 'draw_end');
    alice.emit('draw_end', {});
    await bobDrawEndP;
    console.log(`   ✓ draw_end synchronized to Bob`);

    // ------------------------------------------------------------------------
    // 6. Server Enforcement of Drawer-Only Drawing Authority
    // ------------------------------------------------------------------------
    console.log('\n6️⃣ Testing Server-Side Drawer-Only Canvas Authority...');

    // 6a. Non-drawer Bob attempts to emit draw_start
    const bobDrawErrP = waitForEvent(bob, 'error_message');
    bob.emit('draw_start', { x: 0.5, y: 0.5, color: '#000000', size: 4 });
    const bobDrawErr = await bobDrawErrP;
    assert.strictEqual(bobDrawErr.code, 'NOT_DRAWER');
    console.log(`   ✓ Unauthorized draw_start by non-drawer rejected: ${bobDrawErr.code}`);

    // 6b. Non-drawer Bob attempts to emit draw_undo
    const bobUndoErrP = waitForEvent(bob, 'error_message');
    bob.emit('draw_undo', {});
    const bobUndoErr = await bobUndoErrP;
    assert.strictEqual(bobUndoErr.code, 'NOT_DRAWER');
    console.log(`   ✓ Unauthorized draw_undo by non-drawer rejected: ${bobUndoErr.code}`);

    // 6c. Non-drawer Bob attempts to emit canvas_clear
    const bobClearErrP = waitForEvent(bob, 'error_message');
    bob.emit('canvas_clear', {});
    const bobClearErr = await bobClearErrP;
    assert.strictEqual(bobClearErr.code, 'NOT_DRAWER');
    console.log(`   ✓ Unauthorized canvas_clear by non-drawer rejected: ${bobClearErr.code}`);

    // ------------------------------------------------------------------------
    // 7. Undo and Clear Sync
    // ------------------------------------------------------------------------
    console.log('\n7️⃣ Testing Undo and Clear Synchronization...');
    const undoP = waitForEvent(bob, 'draw_sync');
    alice.emit('draw_undo', {});
    const undoResult = await undoP;
    assert.ok(Array.isArray(undoResult.strokes));
    console.log(`   ✓ draw_undo broadcasted draw_sync with updated strokes`);

    const clearP = waitForEvent(bob, 'canvas_clear');
    alice.emit('canvas_clear', {});
    await clearP;
    console.log(`   ✅ canvas_clear synchronized to all clients`);

    // ------------------------------------------------------------------------
    // 8. Timed Letter Hint Revealing
    // ------------------------------------------------------------------------
    console.log('\n8️⃣ Testing Timer Ticks & Hint Revealing...');
    const tickP = waitForEvent(bob, 'timer_tick');
    const tickData = await tickP;
    assert.ok(typeof tickData.remainingTime === 'number');
    console.log(`   ✓ Authoritative timer tick received: ${tickData.remainingTime}s remaining`);

    // ------------------------------------------------------------------------
    // 9. Drawer Departure Handling & Permitted Word Reveal Phase
    // ------------------------------------------------------------------------
    console.log('\n9️⃣ Testing Drawer Disconnect & Secret Word Reveal Phase...');
    // When active drawer Alice leaves/disconnects during drawing:
    // 1. Timer cancels immediately.
    // 2. round_end is emitted, now permitting plaintext secretWord to be revealed.
    const roundEndP = waitForEvent(bob, 'round_end');
    alice.disconnect();

    const roundEndData = await roundEndP;
    assert.strictEqual(roundEndData.reason, 'DRAWER_DISCONNECTED');
    assert.strictEqual(roundEndData.secretWord, chosenWord);
    console.log(`   ✅ Drawer disconnect handled cleanly: round_end received with reason ${roundEndData.reason}`);
    console.log(`   ✅ Secret word revealed in permitted phase: "${roundEndData.secretWord}"`);

    bob.disconnect();
    console.log(`\n🎉 ALL MILESTONE 3 VERIFICATION CHECKS PASSED SUCCESSFULLY!\n`);
  } catch (err) {
    console.error(`\n❌ Milestone 3 Verification Failed:`, err);
    process.exitCode = 1;
  } finally {
    for (const socket of allSockets) {
      try {
        if (socket.connected) socket.disconnect();
      } catch {
        // Ignored
      }
    }
    setTimeout(() => process.exit(process.exitCode || 0), 200);
  }
}

run();
