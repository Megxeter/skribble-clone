import { io } from 'socket.io-client';
import assert from 'assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

console.log(`\n🧪 ========================================================`);
console.log(`   Verifying Room-Scoped Numbering for Duplicate Names`);
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

function waitForEvent(socket, event, predicateOrTimeout = null, timeoutMs = 6000) {
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const allSockets = [];

  try {
    // ------------------------------------------------------------------------
    // Test Suite 1: Basic Unique Name & Duplicate Suffixes (Alice 1, Alice 2, Alice 3)
    // ------------------------------------------------------------------------
    console.log('1️⃣ Testing Unique Name & Duplicate Numbering in Room A...');
    const alice1 = await createClient('Alice1');
    allSockets.push(alice1);

    const roomStateP1 = waitForEvent(alice1, 'room_state');
    alice1.emit('create_room', {
      playerName: 'Alice',
      isPublic: false
    });
    const roomState1 = await roomStateP1;
    const roomCodeA = roomState1.code;
    const roomIdA = roomState1.roomId;

    // Alice alone -> unique name displays normally
    assert.strictEqual(roomState1.players.length, 1);
    assert.strictEqual(roomState1.players[0].name, 'Alice');
    console.log(`   ✓ Unique player displays normally: "${roomState1.players[0].name}"`);

    // Second Alice joins with matching name (case-insensitive & whitespace trimmed)
    const alice2 = await createClient('Alice2');
    allSockets.push(alice2);

    const roomStateP2 = waitForEvent(alice2, 'room_state');
    const alice1StateP2 = waitForEvent(alice1, 'room_state');
    alice2.emit('join_room', {
      playerName: '  alice  ',
      roomId: roomCodeA
    });
    const [roomState2Alice2, roomState2Alice1] = await Promise.all([roomStateP2, alice1StateP2]);

    assert.strictEqual(roomState2Alice2.players.length, 2);
    // Find player 1 and player 2 in the roster
    const p1 = roomState2Alice2.players.find(p => p.id === alice1.id);
    const p2 = roomState2Alice2.players.find(p => p.id === alice2.id);

    assert.strictEqual(p1.name, 'Alice 1');
    assert.strictEqual(p2.name, 'alice 2');
    console.log(`   ✅ Duplicate names assigned join-order suffixes: "${p1.name}", "${p2.name}"`);

    // Third Alice joins: "ALICE"
    const alice3 = await createClient('Alice3');
    allSockets.push(alice3);

    const roomStateP3 = waitForEvent(alice3, 'room_state');
    alice3.emit('join_room', {
      playerName: 'ALICE',
      roomId: roomCodeA
    });
    const roomState3 = await roomStateP3;
    const p3 = roomState3.players.find(p => p.id === alice3.id);
    assert.strictEqual(p3.name, 'ALICE 3');
    console.log(`   ✓ Third matching player assigned next number: "${p3.name}"`);

    // Unique player Bob joins
    const bob = await createClient('Bob');
    allSockets.push(bob);
    const roomStatePBob = waitForEvent(bob, 'room_state');
    bob.emit('join_room', {
      playerName: 'Bob',
      roomId: roomCodeA
    });
    const roomStateBob = await roomStatePBob;
    const pBob = roomStateBob.players.find(p => p.id === bob.id);
    assert.strictEqual(pBob.name, 'Bob');
    console.log(`   ✓ Distinct player in same room displays normally: "${pBob.name}"`);

    // ------------------------------------------------------------------------
    // Test Suite 2: Departures & Stable Numbering (No renumbering)
    // ------------------------------------------------------------------------
    console.log('\n2️⃣ Testing Stable Numbers on Departure (No Renumbering)...');
    // Alice 1 leaves the room
    const alice2StateAfterLeaveP = waitForEvent(alice2, 'room_state');
    alice1.disconnect();
    const stateAfterLeave = await alice2StateAfterLeaveP;

    assert.strictEqual(stateAfterLeave.players.length, 3);
    const remainingP2 = stateAfterLeave.players.find(p => p.id === alice2.id);
    const remainingP3 = stateAfterLeave.players.find(p => p.id === alice3.id);

    // CRITICAL: Alice 2 and Alice 3 must NOT be renumbered!
    assert.strictEqual(remainingP2.name, 'alice 2');
    assert.strictEqual(remainingP3.name, 'ALICE 3');
    console.log(`   ✅ Remaining players kept stable numbers after Alice 1 left: "${remainingP2.name}", "${remainingP3.name}"`);

    // Fourth Alice joins after Alice 1 departure: must receive "Alice 4", not 1 or 2!
    const alice4 = await createClient('Alice4');
    allSockets.push(alice4);
    const stateAfterJoinP = waitForEvent(alice4, 'room_state');
    alice4.emit('join_room', {
      playerName: 'Alice',
      roomId: roomCodeA
    });
    const stateAfterJoin4 = await stateAfterJoinP;
    const p4 = stateAfterJoin4.players.find(p => p.id === alice4.id);
    assert.strictEqual(p4.name, 'Alice 4');
    console.log(`   ✅ New player joining after departure receives next number: "${p4.name}"`);

    // ------------------------------------------------------------------------
    // Test Suite 3: Names already containing numbers & Unambiguity
    // ------------------------------------------------------------------------
    console.log('\n3️⃣ Testing Names Already Containing Numbers & Unambiguity...');
    // A player enters literal name "Alice 4" (which is already in use by Alice 4!)
    const copycatAlice4 = await createClient('CopycatAlice4');
    allSockets.push(copycatAlice4);
    const copycatStateP = waitForEvent(copycatAlice4, 'room_state');
    copycatAlice4.emit('join_room', {
      playerName: 'Alice 4',
      roomId: roomCodeA
    });
    const copycatState = await copycatStateP;
    const pCopycat = copycatState.players.find(p => p.id === copycatAlice4.id);
    // Must NOT be "Alice 4"! Must be unambiguous, e.g. "Alice 4 2"
    assert.notStrictEqual(pCopycat.name, 'Alice 4');
    assert.strictEqual(pCopycat.name, 'Alice 4 2');
    console.log(`   ✅ Copycat name colliding with existing display name was disambiguated: "${pCopycat.name}"`);

    // ------------------------------------------------------------------------
    // Test Suite 4: Room Isolation
    // ------------------------------------------------------------------------
    console.log('\n4️⃣ Testing Room Isolation (Numbering is strictly room-scoped)...');
    const roomBClient = await createClient('RoomBClient');
    allSockets.push(roomBClient);
    const roomBStateP = waitForEvent(roomBClient, 'room_state');
    roomBClient.emit('create_room', {
      playerName: 'Alice',
      isPublic: false
    });
    const roomBState = await roomBStateP;
    // In Room B, Alice is unique, so must display as "Alice" (NOT Alice 5)!
    assert.strictEqual(roomBState.players[0].name, 'Alice');
    console.log(`   ✅ Player in Room B displays unique name unaffected by Room A: "${roomBState.players[0].name}"`);

    // ------------------------------------------------------------------------
    // Test Suite 5: Display Name Consistency in Chat, Game, and Notifications
    // ------------------------------------------------------------------------
    console.log('\n5️⃣ Testing Display Name Consistency across Chat and Gameplay...');
    // Alice 2 sends chat message in Room A
    const chatMsgP = waitForEvent(alice3, 'chat_message');
    alice2.emit('chat_input', { text: 'Hello everyone!' });
    const chatMsg = await chatMsgP;

    assert.strictEqual(chatMsg.senderName, 'alice 2');
    console.log(`   ✅ Chat message sender matches display name: "${chatMsg.senderName}"`);

    console.log('\n🎉 ========================================================');
    console.log('   ALL DUPLICATE NAME NUMBERING CHECKS PASSED SUCCESSFULLY!');
    console.log('========================================================\n');

  } finally {
    for (const s of allSockets) {
      if (s.connected) s.disconnect();
    }
  }
}

run().catch((err) => {
  console.error('\n❌ Duplicate Name Verification Failed:', err);
  process.exit(1);
});
