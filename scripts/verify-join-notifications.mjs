import { io } from 'socket.io-client';
import assert from 'assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

console.log(`\n🧪 ========================================================`);
console.log(`   Verifying Player Join Events & Notification Contracts`);
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
    // 1. Alice creates a private room
    console.log('1️⃣ Alice creates room...');
    const alice = await createClient('Alice');
    allSockets.push(alice);

    const aliceCreateP = waitForEvent(alice, 'room_state');
    alice.emit('create_room', {
      playerName: 'Alice',
      isPublic: false
    });
    const aliceRoomState = await aliceCreateP;
    const roomCode = aliceRoomState.code;
    const roomId = aliceRoomState.roomId;
    console.log(`   ✓ Alice created room [${roomCode}]`);

    // 2. Bob joins the room
    console.log('\n2️⃣ Bob joins the room...');
    const bob = await createClient('Bob');
    allSockets.push(bob);

    let bobReceivedJoinEvent = false;
    bob.on('player_joined', () => {
      bobReceivedJoinEvent = true;
    });

    const aliceJoinEventP = waitForEvent(alice, 'player_joined');
    const bobRoomStateP = waitForEvent(bob, 'room_state');

    bob.emit('join_room', { roomId: roomCode, playerName: 'Bob' });

    const [aliceJoinEvent, bobRoomState] = await Promise.all([
      aliceJoinEventP,
      bobRoomStateP
    ]);

    // Verify Alice received Bob's join event
    assert.strictEqual(aliceJoinEvent.player.name, 'Bob');
    assert.strictEqual(aliceJoinEvent.player.id, bob.id);
    console.log(`   ✅ Alice received player_joined for Bob (${aliceJoinEvent.player.name})`);

    // Verify Bob did NOT receive player_joined for himself
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(bobReceivedJoinEvent, false, 'Bob should not receive player_joined for himself');
    console.log('   ✅ Bob did not receive player_joined for himself');

    // 3. Room updates (settings change) must NOT trigger player_joined
    console.log('\n3️⃣ Verifying settings update does NOT emit player_joined...');
    let aliceExtraJoinEvent = false;
    let bobExtraJoinEvent = false;
    alice.on('player_joined', () => { aliceExtraJoinEvent = true; });
    bob.on('player_joined', () => { bobExtraJoinEvent = true; });

    const aliceSettingsSyncP = waitForEvent(alice, 'room_state');
    const bobSettingsSyncP = waitForEvent(bob, 'room_state');

    alice.emit('update_settings', {
      roomId,
      settings: { drawTime: 45 }
    });

    await Promise.all([aliceSettingsSyncP, bobSettingsSyncP]);
    await new Promise((r) => setTimeout(r, 200));

    assert.strictEqual(aliceExtraJoinEvent, false, 'update_settings must not trigger player_joined');
    assert.strictEqual(bobExtraJoinEvent, false, 'update_settings must not trigger player_joined');
    console.log('   ✅ Room settings update did not trigger player_joined');

    // 4. Ready status change must NOT trigger player_joined
    console.log('\n4️⃣ Verifying ready toggle does NOT emit player_joined...');
    const bobReadySyncP = waitForEvent(alice, 'room_state');
    bob.emit('set_ready', { roomId, isReady: true });
    await bobReadySyncP;
    await new Promise((r) => setTimeout(r, 200));

    assert.strictEqual(aliceExtraJoinEvent, false, 'set_ready must not trigger player_joined');
    console.log('   ✅ Player ready toggle did not trigger player_joined');

    console.log('\n🎉 ALL JOIN NOTIFICATION & EVENT TESTS PASSED!\n');
  } catch (err) {
    console.error('\n❌ Join notification verification failed:', err);
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
