import { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS, ChatInputPayload, ChatMessagePayload } from '@skribbl/shared';
import { RoomManager } from '../services/RoomManager';

export function registerChatHandlers(io: Server, socket: Socket): void {
  const roomManager = RoomManager.getInstance();

  socket.on(SOCKET_EVENTS.CHAT_INPUT, (payload: ChatInputPayload) => {
    try {
      if (!payload || typeof payload.text !== 'string') return;
      const cleanText = payload.text.trim().slice(0, 200);
      if (!cleanText) return;

      const room = roomManager.getRoomBySocket(socket.id);
      if (!room) return;

      const player = room.players.get(socket.id);
      if (!player) return;

      if (room.game) {
        room.game.handleChatMessage(socket.id, cleanText);
      } else {
        // Casual lobby chat when no game is active
        const chatPayload: ChatMessagePayload = {
          senderId: socket.id,
          senderName: player.name,
          text: cleanText,
          type: 'chat',
        };
        io.to(room.id).emit(SOCKET_EVENTS.CHAT_MESSAGE, chatPayload);
      }
    } catch (err: unknown) {
      console.error(`[Socket ${socket.id}] chat_input error:`, err);
    }
  });
}
