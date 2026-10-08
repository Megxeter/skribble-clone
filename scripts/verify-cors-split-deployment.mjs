import { fork } from 'child_process';
import { io } from 'socket.io-client';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverEntry = path.resolve(__dirname, '../server/dist/server.js');

console.log('🧪 Starting Split-Deployment CORS & Cross-Origin Socket.IO Verification...');

const TEST_PORT = 3456;
const ALLOWED_ORIGIN = 'https://skribbl-clone.vercel.app';
const DISALLOWED_ORIGIN = 'https://unauthorized-origin.com';

async function waitForServer(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`Server failed to start on port ${port}`);
}

async function run() {
  console.log(`1️⃣ Starting backend with CLIENT_ORIGINS="${ALLOWED_ORIGIN},http://localhost:5173" on port ${TEST_PORT}...`);
  const serverProcess = fork(serverEntry, [], {
    env: {
      ...process.env,
      PORT: TEST_PORT.toString(),
      CLIENT_ORIGINS: `${ALLOWED_ORIGIN},http://localhost:5173`,
    },
    silent: true,
  });

  try {
    await waitForServer(TEST_PORT);
    console.log('   ✅ Backend started and responding to /health');

    // 2. Cross-origin /health HTTP request with allowed origin
    console.log(`2️⃣ Testing cross-origin GET /health from allowed origin (${ALLOWED_ORIGIN})...`);
    const resAllowed = await fetch(`http://localhost:${TEST_PORT}/health`, {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    assert.strictEqual(resAllowed.status, 200, 'Expected 200 from /health');
    assert.strictEqual(
      resAllowed.headers.get('access-control-allow-origin'),
      ALLOWED_ORIGIN,
      'Expected Access-Control-Allow-Origin to match allowed origin'
    );
    const healthData = await resAllowed.json();
    assert.strictEqual(healthData.status, 'ok', 'Expected health status ok');
    console.log('   ✅ Allowed origin received correct CORS headers and health status');

    // 3. Cross-origin /health HTTP request with disallowed origin
    console.log(`3️⃣ Testing cross-origin GET /health from disallowed origin (${DISALLOWED_ORIGIN})...`);
    const resDisallowed = await fetch(`http://localhost:${TEST_PORT}/health`, {
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    const headerDisallowed = resDisallowed.headers.get('access-control-allow-origin');
    assert.notStrictEqual(
      headerDisallowed,
      DISALLOWED_ORIGIN,
      'Disallowed origin must NOT receive Access-Control-Allow-Origin'
    );
    console.log('   ✅ Disallowed origin correctly rejected by CORS');

    // 4. Cross-origin Socket.IO connection
    console.log(`4️⃣ Testing Socket.IO connection from allowed origin (${ALLOWED_ORIGIN})...`);
    await new Promise((resolve, reject) => {
      const socket = io(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket', 'polling'],
        extraHeaders: {
          Origin: ALLOWED_ORIGIN,
        },
        timeout: 5000,
      });

      socket.on('connect', () => {
        console.log(`   ✅ Socket.IO connected across origin! Socket ID: ${socket.id}`);
        assert.ok(socket.id);
        socket.disconnect();
        resolve();
      });

      socket.on('connect_error', (err) => {
        reject(new Error(`Cross-origin Socket.IO connection failed: ${err.message}`));
      });
    });

    console.log('\n🎉 ALL CROSS-ORIGIN AND HEALTH VERIFICATION CHECKS PASSED!\n');
  } finally {
    serverProcess.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
