import { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  DrawStartPayload,
  DrawMovePayload,
  ErrorPayload
} from '@skribbl/shared';
import { RoomManager } from '../services/RoomManager';

export function registerDrawHandlers(io: Server, socket: Socket): void {
  const roomManager = RoomManager.getInstance();

  const validateDrawer = (): { valid: boolean; room?: any; game?: any } => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return { valid: false };

    const game = room.game;
    if (!game || room.status !== 'drawing') {
      return { valid: false };
    }

    if (game.activeDrawerId !== socket.id) {
      const err: ErrorPayload = {
        code: 'NOT_DRAWER',
        message: 'Only the active drawer can modify the canvas.'
      };
      socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, err);
      return { valid: false };
    }

    return { valid: true, room, game };
  };

  // 1. Draw Start
  socket.on(SOCKET_EVENTS.DRAW_START, (payload: DrawStartPayload) => {
    const { valid, room, game } = validateDrawer();
    if (!valid || !room || !game) return;

    // Sanitize normalized coordinates [0.0 - 1.0]
    const x = Math.max(0, Math.min(1, Number(payload.x) || 0));
    const y = Math.max(0, Math.min(1, Number(payload.y) || 0));
    const color = typeof payload.color === 'string' ? payload.color : '#000000';
    const size = Math.max(1, Math.min(50, Number(payload.size) || 4));

    game.drawingState.startStroke(x, y, color, size);
    socket.to(room.id).emit(SOCKET_EVENTS.DRAW_START, { x, y, color, size });
  });

  // 2. Draw Move
  socket.on(SOCKET_EVENTS.DRAW_MOVE, (payload: DrawMovePayload) => {
    const { valid, room, game } = validateDrawer();
    if (!valid || !room || !game) return;

    const x = Math.max(0, Math.min(1, Number(payload.x) || 0));
    const y = Math.max(0, Math.min(1, Number(payload.y) || 0));

    game.drawingState.addPoint(x, y);
    socket.to(room.id).emit(SOCKET_EVENTS.DRAW_MOVE, { x, y });
  });

  // 3. Draw End
  socket.on(SOCKET_EVENTS.DRAW_END, () => {
    const { valid, room, game } = validateDrawer();
    if (!valid || !room || !game) return;

    game.drawingState.endStroke();
    socket.to(room.id).emit(SOCKET_EVENTS.DRAW_END, {});
  });

  // 4. Draw Undo
  socket.on(SOCKET_EVENTS.DRAW_UNDO, () => {
    const { valid, room, game } = validateDrawer();
    if (!valid || !room || !game) return;

    const strokes = game.drawingState.undo();
    io.to(room.id).emit(SOCKET_EVENTS.DRAW_SYNC, { strokes });
  });

  // 5. Canvas Clear
  socket.on(SOCKET_EVENTS.CANVAS_CLEAR, () => {
    const { valid, room, game } = validateDrawer();
    if (!valid || !room || !game) return;

    game.drawingState.clear();
    io.to(room.id).emit(SOCKET_EVENTS.CANVAS_CLEAR, {});
  });
}
