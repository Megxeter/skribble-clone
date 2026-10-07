import { io } from 'socket.io-client';
import assert from 'assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

console.log(`\n🧪 ========================================================`);
console.log(`   Starting Paint Bucket / Fill Tool Verification Suite`);
console.log(`   Target: ${BASE_URL}`);
console.log(`========================================================\n`);

// --- 1. Unit Tests for Flood Fill Algorithm Logic ---
console.log('1️⃣ Running Unit Tests for Flood Fill Algorithm & Outline Preservation...');

// In-memory mock CanvasRenderingContext2D for testing flood fill mechanics
class MockCanvasContext {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    // RGBA buffer initialized to white (255, 255, 255, 255)
    this.data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = 255;
      this.data[i + 1] = 255;
      this.data[i + 2] = 255;
      this.data[i + 3] = 255;
    }
  }

  getImageData(x, y, w, h) {
    return {
      width: w,
      height: h,
      data: new Uint8ClampedArray(this.data)
    };
  }

  putImageData(imgData) {
    this.data.set(imgData.data);
  }

  getPixel(x, y) {
    const idx = (y * this.width + x) * 4;
    return [
      this.data[idx],
      this.data[idx + 1],
      this.data[idx + 2],
      this.data[idx + 3]
    ];
  }

  setPixel(x, y, r, g, b, a = 255) {
    const idx = (y * this.width + x) * 4;
    this.data[idx] = r;
    this.data[idx + 1] = g;
    this.data[idx + 2] = b;
    this.data[idx + 3] = a;
  }

  drawBox(x1, y1, x2, y2, r = 0, g = 0, b = 0) {
    for (let x = x1; x <= x2; x++) {
      this.setPixel(x, y1, r, g, b);
      this.setPixel(x, y2, r, g, b);
    }
    for (let y = y1; y <= y2; y++) {
      this.setPixel(x1, y, r, g, b);
      this.setPixel(x2, y, r, g, b);
    }
  }
}

// Inline floodFill matching client/src/utils/floodFill.ts
function parseHexColor(color) {
  let hex = color.trim().replace(/^#/, '');
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: 255
    };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
      a: 255
    };
  }
  return { r: 0, g: 0, b: 0, a: 255 };
}

function runFloodFill(ctx, startX, startY, fillColorHex, width = 960, height = 540, tolerance = 32) {
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) return false;

  const fillRgba = parseHexColor(fillColorHex);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const startIdx = (y0 * width + x0) * 4;
  const startA = data[startIdx + 3];
  const startR = startA === 0 ? 255 : data[startIdx];
  const startG = startA === 0 ? 255 : data[startIdx + 1];
  const startB = startA === 0 ? 255 : data[startIdx + 2];

  if (
    Math.abs(startR - fillRgba.r) <= 15 &&
    Math.abs(startG - fillRgba.g) <= 15 &&
    Math.abs(startB - fillRgba.b) <= 15
  ) {
    return false;
  }

  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const stack = new Int32Array(totalPixels);
  let stackPtr = 0;

  stack[stackPtr++] = (y0 << 16) | x0;
  visited[y0 * width + x0] = 1;

  while (stackPtr > 0) {
    const coord = stack[--stackPtr];
    const cx = coord & 0xffff;
    const cy = coord >>> 16;
    const idx = (cy * width + cx) * 4;

    data[idx] = fillRgba.r;
    data[idx + 1] = fillRgba.g;
    data[idx + 2] = fillRgba.b;
    data[idx + 3] = 255;

    // West
    if (cx > 0) {
      const nidx = cy * width + (cx - 1);
      if (!visited[nidx]) {
        const pidx = nidx * 4;
        const pa = data[pidx + 3];
        const pr = pa === 0 ? 255 : data[pidx];
        const pg = pa === 0 ? 255 : data[pidx + 1];
        const pb = pa === 0 ? 255 : data[pidx + 2];
        if (
          Math.abs(pr - startR) <= tolerance &&
          Math.abs(pg - startG) <= tolerance &&
          Math.abs(pb - startB) <= tolerance
        ) {
          visited[nidx] = 1;
          stack[stackPtr++] = (cy << 16) | (cx - 1);
        }
      }
    }

    // East
    if (cx < width - 1) {
      const nidx = cy * width + (cx + 1);
      if (!visited[nidx]) {
        const pidx = nidx * 4;
        const pa = data[pidx + 3];
        const pr = pa === 0 ? 255 : data[pidx];
        const pg = pa === 0 ? 255 : data[pidx + 1];
        const pb = pa === 0 ? 255 : data[pidx + 2];
        if (
          Math.abs(pr - startR) <= tolerance &&
          Math.abs(pg - startG) <= tolerance &&
          Math.abs(pb - startB) <= tolerance
        ) {
          visited[nidx] = 1;
          stack[stackPtr++] = (cy << 16) | (cx + 1);
        }
      }
    }

    // North
    if (cy > 0) {
      const nidx = (cy - 1) * width + cx;
      if (!visited[nidx]) {
        const pidx = nidx * 4;
        const pa = data[pidx + 3];
        const pr = pa === 0 ? 255 : data[pidx];
        const pg = pa === 0 ? 255 : data[pidx + 1];
        const pb = pa === 0 ? 255 : data[pidx + 2];
        if (
          Math.abs(pr - startR) <= tolerance &&
          Math.abs(pg - startG) <= tolerance &&
          Math.abs(pb - startB) <= tolerance
        ) {
          visited[nidx] = 1;
          stack[stackPtr++] = ((cy - 1) << 16) | cx;
        }
      }
    }

    // South
    if (cy < height - 1) {
      const nidx = (cy + 1) * width + cx;
      if (!visited[nidx]) {
        const pidx = nidx * 4;
        const pa = data[pidx + 3];
        const pr = pa === 0 ? 255 : data[pidx];
        const pg = pa === 0 ? 255 : data[pidx + 1];
        const pb = pa === 0 ? 255 : data[pidx + 2];
        if (
          Math.abs(pr - startR) <= tolerance &&
          Math.abs(pg - startG) <= tolerance &&
          Math.abs(pb - startB) <= tolerance
        ) {
          visited[nidx] = 1;
          stack[stackPtr++] = ((cy + 1) << 16) | cx;
        }
      }
    }
  }

  ctx.putImageData(imgData);
  return true;
}

// 1a. Test Closed Shape Fill & Outline Preservation
{
  const mock = new MockCanvasContext(100, 100);
  // Draw closed black square from (20, 20) to (60, 60)
  mock.drawBox(20, 20, 60, 60, 0, 0, 0);

  // Fill inside at (30, 30) with Red (#ef4444 -> [239, 68, 68])
  const result = runFloodFill(mock, 30, 30, '#ef4444', 100, 100);
  assert.strictEqual(result, true, 'Expected fill inside closed shape to return true');

  // Verify inside pixel is red
  const inside = mock.getPixel(30, 30);
  assert.strictEqual(inside[0], 239);
  assert.strictEqual(inside[1], 68);
  assert.strictEqual(inside[2], 68);

  // Verify outline pixel at (20, 20) is still BLACK [0, 0, 0]
  const outline = mock.getPixel(20, 20);
  assert.strictEqual(outline[0], 0, 'Outline must remain black');
  assert.strictEqual(outline[1], 0, 'Outline must remain black');
  assert.strictEqual(outline[2], 0, 'Outline must remain black');

  // Verify exterior pixel at (10, 10) is still WHITE [255, 255, 255]
  const exterior = mock.getPixel(10, 10);
  assert.strictEqual(exterior[0], 255, 'Exterior must remain white');
  assert.strictEqual(exterior[1], 255, 'Exterior must remain white');
  assert.strictEqual(exterior[2], 255, 'Exterior must remain white');
  console.log('   ✓ Closed shape interior filled with red while preserving black outline & white exterior');
}

// 1b. Test Open Area Fill (clicking open background around shape)
{
  const mock = new MockCanvasContext(100, 100);
  mock.drawBox(20, 20, 60, 60, 0, 0, 0);

  // Click on open exterior at (5, 5) with Blue (#3b82f6 -> [59, 130, 246])
  const result = runFloodFill(mock, 5, 5, '#3b82f6', 100, 100);
  assert.strictEqual(result, true);

  // Exterior should be blue
  const exterior = mock.getPixel(5, 5);
  assert.strictEqual(exterior[0], 59);
  assert.strictEqual(exterior[1], 130);
  assert.strictEqual(exterior[2], 246);

  // Outline should still be black
  const outline = mock.getPixel(20, 20);
  assert.strictEqual(outline[0], 0);

  // Interior should still be white
  const inside = mock.getPixel(30, 30);
  assert.strictEqual(inside[0], 255);
  console.log('   ✓ Open area filled around closed shape while preserving outline & interior');
}

// 1c. Test Unclosed Shape Fill (open shape with gap)
{
  const mock = new MockCanvasContext(100, 100);
  // Draw box missing top edge (gap)
  for (let x = 20; x <= 60; x++) mock.setPixel(x, 60, 0, 0, 0); // bottom
  for (let y = 20; y <= 60; y++) {
    mock.setPixel(20, y, 0, 0, 0); // left
    mock.setPixel(60, y, 0, 0, 0); // right
  }
  // Top (y=20) has gap from x=30 to x=50

  // Click inside at (40, 40) with Green (#10b981)
  runFloodFill(mock, 40, 40, '#10b981', 100, 100);

  // Both inside and outside should be green because of the open gap
  const inside = mock.getPixel(40, 40);
  const outside = mock.getPixel(10, 10);
  assert.strictEqual(inside[0], 16);
  assert.strictEqual(outside[0], 16);

  // Shape outline still preserved!
  const wall = mock.getPixel(20, 40);
  assert.strictEqual(wall[0], 0, 'Wall must remain black');
  console.log('   ✓ Unclosed shape fill correctly flooded through gap while preserving shape strokes');
}

// 1d. Test clicking already filled color (no-op)
{
  const mock = new MockCanvasContext(50, 50);
  const r1 = runFloodFill(mock, 10, 10, '#ef4444', 50, 50);
  assert.strictEqual(r1, true);
  const r2 = runFloodFill(mock, 10, 10, '#ef4444', 50, 50);
  assert.strictEqual(r2, false, 'Expected duplicate fill with same color to be a no-op returning false');
  console.log('   ✓ Redundant fill on already-matching color correctly returns false');
}

console.log('\n2️⃣ Starting Multi-Player Integration Suite via Socket.IO...');

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

async function run() {
  const allSockets = [];

  try {
    const alice = await createClient('Alice');
    const bob = await createClient('Bob');
    allSockets.push(alice, bob);

    // Create room
    const aliceCreateP = waitForEvent(alice, 'room_state');
    alice.emit('create_room', {
      playerName: 'Alice',
      isPublic: false,
      settings: { rounds: 2, drawTime: 40, wordCount: 3, hints: 2 }
    });
    const roomState = await aliceCreateP;
    const roomCode = roomState.code;
    const roomId = roomState.roomId;

    // Bob joins
    const bobJoinP = waitForEvent(bob, 'room_state');
    const aliceSyncP = waitForEvent(alice, 'room_state');
    bob.emit('join_room', { roomId: roomCode, playerName: 'Bob' });
    await Promise.all([bobJoinP, aliceSyncP]);
    console.log(`   ✓ Alice and Bob in room [${roomCode}]`);

    // Start game
    const aliceRoundStartP = waitForEvent(alice, 'round_start');
    const bobRoundStartP = waitForEvent(bob, 'round_start');
    alice.emit('start_game', { roomId });
    const [aliceRoundStart] = await Promise.all([aliceRoundStartP, bobRoundStartP]);

    assert.strictEqual(aliceRoundStart.drawerId, alice.id);
    const chosenWord = aliceRoundStart.wordOptions[0];

    // Alice chooses word -> game transitions to drawing
    const aliceGameP = waitForEvent(alice, 'game_state', (s) => s.status === 'drawing');
    const bobGameP = waitForEvent(bob, 'game_state', (s) => s.status === 'drawing');
    alice.emit('choose_word', { word: chosenWord });
    await Promise.all([aliceGameP, bobGameP]);
    console.log('   ✓ Game in drawing state. Alice is drawer, Bob is guesser.');

    // ------------------------------------------------------------------------
    // Server Enforcement: Non-drawer Bob attempts to emit DRAW_FILL
    // ------------------------------------------------------------------------
    console.log('\n3️⃣ Testing Server-Side Authority Enforcement for Fill Tool...');
    const bobErrP = waitForEvent(bob, 'error_message');
    bob.emit('draw_fill', { x: 0.5, y: 0.5, color: '#ef4444' });
    const bobErr = await bobErrP;
    assert.strictEqual(bobErr.code, 'NOT_DRAWER', 'Expected server to reject non-drawer fill with NOT_DRAWER');
    console.log(`   ✓ Non-drawer Bob attempt to emit draw_fill was rejected by server: ${bobErr.code} - "${bobErr.message}"`);

    // ------------------------------------------------------------------------
    // Drawer Alice emits DRAW_FILL: Multi-player Synchronization
    // ------------------------------------------------------------------------
    console.log('\n4️⃣ Testing Multiplayer Real-Time DRAW_FILL Synchronization...');
    const bobFillP = waitForEvent(bob, 'draw_fill');
    alice.emit('draw_fill', { x: 0.35, y: 0.45, color: '#3b82f6' });
    const bobFill = await bobFillP;
    assert.strictEqual(bobFill.x, 0.35);
    assert.strictEqual(bobFill.y, 0.45);
    assert.strictEqual(bobFill.color, '#3b82f6');
    console.log(`   ✓ Bob received draw_fill: x=${bobFill.x}, y=${bobFill.y}, color=${bobFill.color}`);

    // ------------------------------------------------------------------------
    // Undo Support with Fill:
    // Stroke 1 -> Fill 2 -> Stroke 3 -> Undo (pops Stroke 3) -> Undo (pops Fill 2)
    // ------------------------------------------------------------------------
    console.log('\n5️⃣ Testing Drawing History & Undo Support for Fill Tool...');

    // Clear canvas first
    const clearP = waitForEvent(bob, 'canvas_clear');
    alice.emit('canvas_clear', {});
    await clearP;

    // Step A: Alice draws a stroke
    alice.emit('draw_start', { x: 0.1, y: 0.1, color: '#000000', size: 4 });
    alice.emit('draw_move', { x: 0.2, y: 0.2 });
    alice.emit('draw_end', {});

    // Step B: Alice performs a fill
    const bobFill2P = waitForEvent(bob, 'draw_fill');
    alice.emit('draw_fill', { x: 0.15, y: 0.15, color: '#ef4444' });
    await bobFill2P;

    // Step C: Alice draws a second stroke
    alice.emit('draw_start', { x: 0.8, y: 0.8, color: '#10b981', size: 6 });
    alice.emit('draw_move', { x: 0.85, y: 0.85 });
    alice.emit('draw_end', {});

    // Step D: Alice clicks Undo -> should pop Stroke C
    const undo1P = waitForEvent(bob, 'draw_sync');
    alice.emit('draw_undo', {});
    const undo1 = await undo1P;
    assert.strictEqual(undo1.strokes.length, 2, 'Expected 2 items in history (Stroke 1 + Fill 2)');
    assert.strictEqual(undo1.strokes[0].color, '#000000');
    assert.strictEqual(undo1.strokes[1].type, 'fill');
    assert.strictEqual(undo1.strokes[1].color, '#ef4444');
    console.log('   ✓ Undo 1 correctly popped Stroke C; Fill B and Stroke A remain in sync payload');

    // Step E: Alice clicks Undo again -> should pop Fill B
    const undo2P = waitForEvent(bob, 'draw_sync');
    alice.emit('draw_undo', {});
    const undo2 = await undo2P;
    assert.strictEqual(undo2.strokes.length, 1, 'Expected 1 item in history (Stroke 1 only)');
    assert.strictEqual(undo2.strokes[0].color, '#000000');
    console.log('   ✓ Undo 2 correctly popped Fill B; Stroke A remains in sync payload');

    // Step F: Alice clicks Undo again -> should pop Stroke A
    const undo3P = waitForEvent(bob, 'draw_sync');
    alice.emit('draw_undo', {});
    const undo3 = await undo3P;
    assert.strictEqual(undo3.strokes.length, 0, 'Expected 0 items in history');
    console.log('   ✓ Undo 3 correctly popped Stroke A; canvas history empty');

    // ------------------------------------------------------------------------
    // 6. Open Area Fill & Canvas Clear Synchronization
    // ------------------------------------------------------------------------
    console.log('\n6️⃣ Testing Open Area Fill & Canvas Clear Synchronization...');
    // Alice performs fill on open canvas
    const bobOpenFillP = waitForEvent(bob, 'draw_fill');
    alice.emit('draw_fill', { x: 0.5, y: 0.5, color: '#a855f7' });
    const bobOpenFill = await bobOpenFillP;
    assert.strictEqual(bobOpenFill.color, '#a855f7');
    console.log('   ✓ Open area fill synchronized to Bob');

    // Alice draws on top of open fill
    alice.emit('draw_start', { x: 0.3, y: 0.3, color: '#000000', size: 4 });
    alice.emit('draw_end', {});

    // Alice undos the stroke -> open fill remains in draw_sync
    const undoFillP = waitForEvent(bob, 'draw_sync');
    alice.emit('draw_undo', {});
    const undoFill = await undoFillP;
    assert.strictEqual(undoFill.strokes.length, 1);
    assert.strictEqual(undoFill.strokes[0].type, 'fill');
    assert.strictEqual(undoFill.strokes[0].color, '#a855f7');
    console.log('   ✓ Undo stroke preserved open fill in sync payload');

    // Alice clears canvas -> canvas_clear broadcast
    const bobClearP = waitForEvent(bob, 'canvas_clear');
    alice.emit('canvas_clear', {});
    await bobClearP;
    console.log('   ✓ canvas_clear synchronized to Bob');

    console.log('\n🎉 ALL PAINT BUCKET & FILL TOOL VERIFICATION CHECKS PASSED!\n');
  } catch (err) {
    console.error('\n❌ Verification Failed:', err);
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
