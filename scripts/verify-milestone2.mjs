import { io } from 'socket.io-client';
import assert from 'assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

console.log(`\n🧪 ========================================================`);
console.log(`   Starting Milestone 2 Verification Suite against ${BASE_URL}`);
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

function waitForEvent(socket, event, timeoutMs = 3000) {
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
    // 1. Mandatory Public Matchmaking (1-Click Pooling)
    // ------------------------------------------------------------------------
    console.log('1️⃣ Testing Public Matchmaking...');
    const clientA = await createClient('ClientA');
    const clientB = await createClient('ClientB');
    allSockets.push(clientA, clientB);

    // Client A joins public matchmaking
    const p1StatePromise = waitForEvent(clientA, 'room_state');
    clientA.emit('join_public', { playerName: 'Alice' });
    const p1State = await p1StatePromise;

    assert.ok(p1State.roomId, 'Expected room ID');
    assert.strictEqual(p1State.isPublic, true, 'Expected room to be public');
    assert.strictEqual(p1State.players.length, 1, 'Expected 1 player initially');
    assert.strictEqual(p1State.hostId, clientA.id, 'Expected Client A to be host');
    const publicRoomCode = p1State.code;
    console.log(`   ✓ Client A created/joined public room [${publicRoomCode}] as host`);

    // Client B joins public matchmaking -> should pool into Client A's room
    const p2StatePromise = waitForEvent(clientB, 'room_state');
    const p1UpdatePromise = waitForEvent(clientA, 'room_state');
    clientB.emit('join_public', { playerName: 'Bob' });
    const [p2State, p1Updated] = await Promise.all([p2StatePromise, p1UpdatePromise]);

    assert.strictEqual(p2State.roomId, p1State.roomId, 'Expected Client B to match into same public room');
    assert.strictEqual(p2State.code, publicRoomCode, 'Expected matching room code');
    assert.strictEqual(p2State.players.length, 2, 'Expected 2 players in room');
    assert.strictEqual(p1Updated.players.length, 2, 'Expected Client A to see 2 players');
    console.log(`   ✅ Public matchmaking successfully pooled Client B into public room [${publicRoomCode}]`);

    // Clean up public clients
    clientA.disconnect();
    clientB.disconnect();

    // ------------------------------------------------------------------------
    // 2. Private Room Creation & Joining by 6-Char Code
    // ------------------------------------------------------------------------
    console.log('\n2️⃣ Testing Private Room Creation & Joining by 6-Char Code...');
    const host1 = await createClient('Host1');
    const guest1 = await createClient('Guest1');
    allSockets.push(host1, guest1);

    const privateStatePromise = waitForEvent(host1, 'room_state');
    host1.emit('create_room', {
      playerName: 'Charlie',
      isPublic: false,
      settings: {
        maxPlayers: 3,
        rounds: 4,
        drawTime: 45,
        wordCount: 3,
        hints: 2
      }
    });
    const privateState = await privateStatePromise;

    assert.strictEqual(privateState.isPublic, false, 'Expected private room');
    assert.strictEqual(typeof privateState.code, 'string', 'Expected room code');
    assert.strictEqual(privateState.code.length, 6, 'Expected 6-char room code');
    assert.match(privateState.code, /^[A-Z0-9]{6}$/, 'Expected uppercase alphanumeric code');
    assert.strictEqual(privateState.settings.maxPlayers, 3);
    assert.strictEqual(privateState.settings.rounds, 4);
    assert.strictEqual(privateState.settings.drawTime, 45);
    const privateCode = privateState.code;
    console.log(`   ✓ Host created private room with code [${privateCode}] and custom settings`);

    // Guest joins via code
    const guestJoinPromise = waitForEvent(guest1, 'room_state');
    const hostNotifyPromise = waitForEvent(host1, 'room_state');
    guest1.emit('join_room', { roomId: privateCode, playerName: 'Dave' });
    const [guestState, hostStateAfterJoin] = await Promise.all([guestJoinPromise, hostNotifyPromise]);

    assert.strictEqual(guestState.code, privateCode);
    assert.strictEqual(guestState.players.length, 2);
    assert.strictEqual(hostStateAfterJoin.players.length, 2);
    console.log(`   ✅ Guest successfully joined private room [${privateCode}] via code`);

    // ------------------------------------------------------------------------
    // 3. Invalid Room Code Handling (ROOM_NOT_FOUND)
    // ------------------------------------------------------------------------
    console.log('\n3️⃣ Testing Invalid Room Code Rejection...');
    const clientErr = await createClient('ClientErr');
    allSockets.push(clientErr);

    const notFoundPromise = waitForEvent(clientErr, 'error_message');
    clientErr.emit('join_room', { roomId: 'INVALID99', playerName: 'LostPlayer' });
    const notFoundError = await notFoundPromise;

    assert.strictEqual(notFoundError.code, 'ROOM_NOT_FOUND');
    console.log(`   ✅ Server rejected invalid room code with error: ${notFoundError.code} - "${notFoundError.message}"`);
    clientErr.disconnect();

    // ------------------------------------------------------------------------
    // 4. Room Settings Validation & Host Permissions
    // ------------------------------------------------------------------------
    console.log('\n4️⃣ Testing Room Settings Validation & Host Authorization...');

    // 4a. Non-host attempts settings change -> should be rejected (UNAUTHORIZED)
    const guestAuthErrPromise = waitForEvent(guest1, 'error_message');
    guest1.emit('update_settings', {
      roomId: privateState.roomId,
      settings: { rounds: 5 }
    });
    const guestAuthErr = await guestAuthErrPromise;
    assert.strictEqual(guestAuthErr.code, 'UNAUTHORIZED');
    console.log(`   ✓ Unauthorized non-host settings change correctly rejected: ${guestAuthErr.code}`);

    // 4b. Host attempts out-of-range settings change (rounds: 99 > max 10) -> INVALID_SETTINGS
    const hostInvalidErrPromise = waitForEvent(host1, 'error_message');
    host1.emit('update_settings', {
      roomId: privateState.roomId,
      settings: { rounds: 99 }
    });
    const hostInvalidErr = await hostInvalidErrPromise;
    assert.strictEqual(hostInvalidErr.code, 'INVALID_SETTINGS');
    console.log(`   ✓ Out-of-bounds settings rejected by server: ${hostInvalidErr.code} - "${hostInvalidErr.message}"`);

    // 4c. Host sends valid settings update -> broadcast to both players
    const hostUpdateP = waitForEvent(host1, 'room_state');
    const guestUpdateP = waitForEvent(guest1, 'room_state');
    host1.emit('update_settings', {
      roomId: privateState.roomId,
      settings: { rounds: 5, drawTime: 60 }
    });
    const [updatedHostState, updatedGuestState] = await Promise.all([hostUpdateP, guestUpdateP]);
    assert.strictEqual(updatedHostState.settings.rounds, 5);
    assert.strictEqual(updatedHostState.settings.drawTime, 60);
    assert.strictEqual(updatedGuestState.settings.rounds, 5);
    assert.strictEqual(updatedGuestState.settings.drawTime, 60);
    console.log(`   ✅ Valid settings update successfully synchronized to all players`);

    // ------------------------------------------------------------------------
    // 5. Player Ready Status Sync
    // ------------------------------------------------------------------------
    console.log('\n5️⃣ Testing Player Ready Status...');
    const readyP1 = waitForEvent(host1, 'room_state');
    const readyP2 = waitForEvent(guest1, 'room_state');
    guest1.emit('set_ready', { roomId: privateState.roomId, isReady: true });
    const [stateReady1, stateReady2] = await Promise.all([readyP1, readyP2]);

    const guestPlayer = stateReady1.players.find((p) => p.id === guest1.id);
    assert.ok(guestPlayer && guestPlayer.isReady === true, 'Expected guest to have isReady: true');
    console.log(`   ✅ Player ready status set to true and synced to host`);

    // ------------------------------------------------------------------------
    // 6. Capacity Enforcement (ROOM_FULL)
    // ------------------------------------------------------------------------
    console.log('\n6️⃣ Testing Room Capacity Enforcement...');
    // Private room maxPlayers is 3. We have host1 and guest1 (2 players). Add guest2 (3 players).
    const guest2 = await createClient('Guest2');
    allSockets.push(guest2);

    const guest2Joined = waitForEvent(guest2, 'room_state');
    guest2.emit('join_room', { roomId: privateCode, playerName: 'Eve' });
    const g2State = await guest2Joined;
    assert.strictEqual(g2State.players.length, 3, 'Expected room to be full at 3 players');
    console.log(`   ✓ Third player joined; room [${privateCode}] is now at capacity (3/3)`);

    // Now attempt to join 4th player -> should be rejected with ROOM_FULL
    const guest3 = await createClient('Guest3');
    allSockets.push(guest3);

    const fullErrPromise = waitForEvent(guest3, 'error_message');
    guest3.emit('join_room', { roomId: privateCode, playerName: 'Frank' });
    const fullErr = await fullErrPromise;
    assert.strictEqual(fullErr.code, 'ROOM_FULL');
    console.log(`   ✅ Over-capacity join correctly rejected: ${fullErr.code} - "${fullErr.message}"`);
    guest3.disconnect();

    // ------------------------------------------------------------------------
    // 7. Host Migration When Host Disconnects
    // ------------------------------------------------------------------------
    console.log('\n7️⃣ Testing Host Migration on Host Disconnect...');
    // Currently host1 (Charlie) is host. guest1 (Dave) joined second. guest2 (Eve) joined third.
    // When host1 leaves/disconnects, guest1 should become the new host (oldest joined).
    const hostMigratePromise = waitForEvent(guest1, 'room_state');
    const playerLeftPromise = waitForEvent(guest1, 'player_left');
    host1.disconnect();

    const [migratedState, leftPayload] = await Promise.all([hostMigratePromise, playerLeftPromise]);
    assert.strictEqual(migratedState.players.length, 2);
    assert.strictEqual(migratedState.hostId, guest1.id, 'Expected guest1 to become new host');
    const newHostPlayer = migratedState.players.find((p) => p.id === guest1.id);
    assert.strictEqual(newHostPlayer.isHost, true, 'Expected guest1.isHost to be true');
    assert.strictEqual(leftPayload.newHostId, guest1.id);
    console.log(`   ✅ Host migration verified: host role transferred to oldest player (${newHostPlayer.name})`);

    // ------------------------------------------------------------------------
    // 8. Game Start Enforcement (Min 2 Players & Host Only)
    // ------------------------------------------------------------------------
    console.log('\n8️⃣ Testing Minimum 2-Player & Host Start Game Validation...');

    // 8a. Solo room start test (INSUFFICIENT_PLAYERS)
    const soloHost = await createClient('SoloHost');
    allSockets.push(soloHost);
    const soloStateP = waitForEvent(soloHost, 'room_state');
    soloHost.emit('create_room', { playerName: 'SoloGamer', isPublic: false });
    const soloState = await soloStateP;

    const soloErrP = waitForEvent(soloHost, 'error_message');
    soloHost.emit('start_game', { roomId: soloState.roomId });
    const soloErr = await soloErrP;
    assert.strictEqual(soloErr.code, 'INSUFFICIENT_PLAYERS');
    console.log(`   ✓ Solo start blocked: ${soloErr.code} - "${soloErr.message}"`);
    soloHost.disconnect();

    // 8b. Non-host attempts to start 2-player room (UNAUTHORIZED)
    const guest2StartErrP = waitForEvent(guest2, 'error_message');
    guest2.emit('start_game', { roomId: migratedState.roomId });
    const guest2StartErr = await guest2StartErrP;
    assert.strictEqual(guest2StartErr.code, 'UNAUTHORIZED');
    console.log(`   ✓ Non-host start blocked: ${guest2StartErr.code} - "${guest2StartErr.message}"`);

    // 8c. Valid host starts 2-player room -> transitions to 'word_selecting'
    const gameStartP1 = waitForEvent(guest1, 'room_state');
    const gameStartP2 = waitForEvent(guest2, 'room_state');
    guest1.emit('start_game', { roomId: migratedState.roomId });
    const [startedState1, startedState2] = await Promise.all([gameStartP1, gameStartP2]);

    assert.strictEqual(startedState1.status, 'word_selecting');
    assert.strictEqual(startedState2.status, 'word_selecting');
    console.log(`   ✅ Game successfully started by host with 2 players; room transitioned to status: ${startedState1.status}`);

    console.log(`\n🎉 ALL MILESTONE 2 VERIFICATION CHECKS PASSED SUCCESSFULLY!\n`);
  } catch (err) {
    console.error(`\n❌ Milestone 2 Verification Failed:`, err);
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
