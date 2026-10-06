import { io } from 'socket.io-client';
import assert from 'assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

console.log(`🧪 Starting Milestone 1 Automated Verification Smoke Test on ${BASE_URL}...`);

async function testHealthEndpoint() {
  console.log('1️⃣ Testing GET /health endpoint...');
  const res = await fetch(`${BASE_URL}/health`);
  assert.strictEqual(res.status, 200, 'Expected HTTP 200 from /health');
  const data = await res.json();
  assert.strictEqual(data.status, 'ok', 'Expected { status: "ok" }');
  assert.ok(typeof data.uptime === 'number' && data.uptime >= 0, 'Expected positive uptime');
  assert.ok(typeof data.timestamp === 'string', 'Expected ISO timestamp string');
  console.log(`   ✅ /health verified: status=${data.status}, uptime=${data.uptime}s`);
}

async function testStaticFrontend() {
  console.log('2️⃣ Testing Static Frontend Serving (GET /)...');
  const res = await fetch(`${BASE_URL}/`);
  assert.strictEqual(res.status, 200, 'Expected HTTP 200 from /');
  const html = await res.text();
  assert.ok(html.includes('skribbl.io'), 'Expected index.html to contain title "skribbl.io"');
  assert.ok(html.includes('<div id="root"></div>'), 'Expected index.html to contain #root mounting point');
  console.log(`   ✅ Static React frontend bundle verified on ${BASE_URL}/`);
}

async function testSocketConnection() {
  console.log('3️⃣ Testing WebSocket / Socket.IO Live Connection...');
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      timeout: 5000
    });

    socket.on('connect', () => {
      console.log(`   ✅ Socket.IO connected successfully with socketId: ${socket.id}`);
      assert.ok(socket.id, 'Expected valid socket ID');
      socket.disconnect();
      resolve(socket.id);
    });

    socket.on('connect_error', (err) => {
      reject(new Error(`Socket connection failed: ${err.message}`));
    });
  });
}

async function run() {
  try {
    await testHealthEndpoint();
    await testStaticFrontend();
    await testSocketConnection();
    console.log('\n🎉 ALL MILESTONE 1 VERIFICATION CHECKS PASSED!\n');
    setTimeout(() => {
      process.exit(0);
    }, 150);
  } catch (error) {
    console.error('\n❌ Verification Failed:', error);
    process.exit(1);
  }
}

run();
