import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import { HealthResponse } from '@skribbl/shared';
import { registerRoomHandlers } from './handlers/roomHandler';
import { registerDrawHandlers } from './handlers/drawHandler';
import { registerChatHandlers } from './handlers/chatHandler';

const app = express();
const server = http.createServer(app);

// Enable CORS for API requests
app.use(cors());
app.use(express.json());

// Initialize Socket.IO on the shared HTTP instance
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Socket.IO lifecycle logging & handler registration
io.on('connection', (socket: Socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  // Register Room, Matchmaking, Drawing, and Chat event handlers
  registerRoomHandlers(io, socket);
  registerDrawHandlers(io, socket);
  registerChatHandlers(io, socket);

  socket.on('disconnect', (reason: string) => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id} (reason: ${reason})`);
  });
});

// Authoritative Healthcheck endpoint
app.get('/health', (_req: Request, res: Response<HealthResponse>) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.round(process.uptime() * 100) / 100,
    timestamp: new Date().toISOString()
  });
});

// Static assets: serve compiled Vite frontend in production
const distCandidate1 = path.resolve(__dirname, '../../client/dist');
const distCandidate2 = path.resolve(process.cwd(), 'client/dist');
const clientDistPath = fs.existsSync(distCandidate1) ? distCandidate1 : distCandidate2;

if (fs.existsSync(clientDistPath)) {
  console.log(`[Static] Serving frontend bundle from: ${clientDistPath}`);
  app.use(express.static(clientDistPath));

  // SPA fallback for client-side routing
  app.get('*', (_req: Request, res: Response) => {
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(200).send('Client build in progress. Refresh shortly.');
    }
  });
} else {
  console.log(`[Static] Frontend dist directory not found yet (expected at ${clientDistPath})`);
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      message: 'skribbl-clone backend server is running. Build frontend with `npm run build:client` to serve UI.',
      healthEndpoint: '/health',
      socketStatus: 'ready'
    });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Server] skribbl-clone unified server listening on port ${PORT}`);
  console.log(`[Server] Healthcheck: http://localhost:${PORT}/health`);
});

export { app, server, io };
