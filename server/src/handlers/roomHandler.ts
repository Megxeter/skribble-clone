import { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  CreateRoomPayload,
  JoinRoomPayload,
  JoinPublicPayload,
  UpdateSettingsPayload,
  SetReadyPayload,
  StartGamePayload,
  LeaveRoomPayload,
  ChooseWordPayload,
} from '@skribbl/shared';
import { RoomManager } from '../services/RoomManager';
import { Player } from '../models/Player';
import { Game } from '../models/Game';

export function registerRoomHandlers(io: Server, socket: Socket): void {
  const roomManager = RoomManager.getInstance();

  // 1. Create Private or Public Room
  socket.on(SOCKET_EVENTS.CREATE_ROOM, (payload: CreateRoomPayload) => {
    try {
      // Leave any existing room
      handlePlayerExit(io, socket);

      const host = new Player(socket.id, payload.playerName, true);
      const room = roomManager.createRoom(host, Boolean(payload.isPublic), payload.settings);

      socket.join(room.id);
      socket.emit(SOCKET_EVENTS.ROOM_STATE, room.toDTO());
    } catch (err: unknown) {
      console.error(`[Socket ${socket.id}] create_room error:`, err);
      socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
        code: 'SERVER_ERROR',
        message: 'Failed to create room.'
      });
    }
  });

  // 2. Join Room by Code or ID
  socket.on(SOCKET_EVENTS.JOIN_ROOM, (payload: JoinRoomPayload) => {
    try {
      const room = roomManager.getRoom(payload.roomId);
      if (!room) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: 'ROOM_NOT_FOUND',
          message: `Room "${payload.roomId}" does not exist. Check the code and try again.`
        });
        return;
      }

      // Leave any existing room first
      handlePlayerExit(io, socket);

      const player = new Player(socket.id, payload.playerName, false);
      const result = room.addPlayer(player);

      if (!result.success) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: result.code || 'SERVER_ERROR',
          message: result.error || 'Failed to join room.'
        });
        return;
      }

      roomManager.cancelCleanup(room);
      roomManager.bindSocket(socket.id, room.id);
      socket.join(room.id);

      io.to(room.id).emit(SOCKET_EVENTS.ROOM_STATE, room.toDTO());
      socket.to(room.id).emit(SOCKET_EVENTS.PLAYER_JOINED, {
        player: player.toDTO(),
        players: Array.from(room.players.values()).map((p) => p.toDTO())
      });

      if (room.status === 'drawing' && room.game) {
        socket.emit(SOCKET_EVENTS.DRAW_SYNC, {
          strokes: room.game.drawingState.getStrokes()
        });
      }
    } catch (err: unknown) {
      console.error(`[Socket ${socket.id}] join_room error:`, err);
      socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
        code: 'SERVER_ERROR',
        message: 'Failed to join room.'
      });
    }
  });

  // 3. Mandatory Public Matchmaking (Join Public Game)
  socket.on(SOCKET_EVENTS.JOIN_PUBLIC, (payload: JoinPublicPayload) => {
    try {
      handlePlayerExit(io, socket);

      let room = roomManager.findPublicRoom();

      if (room) {
        // Match into existing public room
        const player = new Player(socket.id, payload.playerName, false);
        const result = room.addPlayer(player);

        if (result.success) {
          roomManager.cancelCleanup(room);
          roomManager.bindSocket(socket.id, room.id);
          socket.join(room.id);

          io.to(room.id).emit(SOCKET_EVENTS.ROOM_STATE, room.toDTO());
          socket.to(room.id).emit(SOCKET_EVENTS.PLAYER_JOINED, {
            player: player.toDTO(),
            players: Array.from(room.players.values()).map((p) => p.toDTO())
          });

          if (room.status === 'drawing' && room.game) {
            socket.emit(SOCKET_EVENTS.DRAW_SYNC, {
              strokes: room.game.drawingState.getStrokes()
            });
          }
          return;
        }
      }

      // No available open public room, create a fresh public room as host
      const host = new Player(socket.id, payload.playerName, true);
      room = roomManager.createRoom(host, true);
      socket.join(room.id);
      socket.emit(SOCKET_EVENTS.ROOM_STATE, room.toDTO());
    } catch (err: unknown) {
      console.error(`[Socket ${socket.id}] join_public error:`, err);
      socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
        code: 'SERVER_ERROR',
        message: 'Public matchmaking failed.'
      });
    }
  });

  // 4. Update Room Settings (Host Only)
  socket.on(SOCKET_EVENTS.UPDATE_SETTINGS, (payload: UpdateSettingsPayload) => {
    try {
      const room = roomManager.getRoom(payload.roomId);
      if (!room) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: 'ROOM_NOT_FOUND',
          message: 'Room not found.'
        });
        return;
      }

      if (room.hostId !== socket.id) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: 'UNAUTHORIZED',
          message: 'Only the room host is authorized to change game settings.'
        });
        return;
      }

      const result = room.updateSettings(payload.settings);
      if (!result.valid) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: 'INVALID_SETTINGS',
          message: result.errors.join(' | ')
        });
        return;
      }

      io.to(room.id).emit(SOCKET_EVENTS.ROOM_STATE, room.toDTO());
    } catch (err: unknown) {
      console.error(`[Socket ${socket.id}] update_settings error:`, err);
    }
  });

  // 5. Toggle Ready Status
  socket.on(SOCKET_EVENTS.SET_READY, (payload: SetReadyPayload) => {
    try {
      const room = roomManager.getRoom(payload.roomId);
      if (!room) return;

      const player = room.players.get(socket.id);
      if (player) {
        player.isReady = Boolean(payload.isReady);
        io.to(room.id).emit(SOCKET_EVENTS.ROOM_STATE, room.toDTO());
      }
    } catch (err: unknown) {
      console.error(`[Socket ${socket.id}] set_ready error:`, err);
    }
  });

  // 6. Start Game with Strict Server-Side 2-Player Check
  socket.on(SOCKET_EVENTS.START_GAME, (payload: StartGamePayload) => {
    try {
      const room = roomManager.getRoom(payload.roomId);
      if (!room) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: 'ROOM_NOT_FOUND',
          message: 'Room not found.'
        });
        return;
      }

      if (room.hostId !== socket.id) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: 'UNAUTHORIZED',
          message: 'Only the room host can start the game.'
        });
        return;
      }

      const check = room.canStart();
      if (!check.allowed) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: check.code || 'INSUFFICIENT_PLAYERS',
          message: check.message || 'Cannot start game.'
        });
        return;
      }

      // Initialize and start authoritative turn machine
      room.game = new Game(room, io);
      room.game.start();
    } catch (err: unknown) {
      console.error(`[Socket ${socket.id}] start_game error:`, err);
    }
  });

  // 7. Choose Word (Drawer only)
  socket.on(SOCKET_EVENTS.CHOOSE_WORD, (payload: ChooseWordPayload) => {
    try {
      const room = roomManager.getRoomBySocket(socket.id);
      if (!room || !room.game) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: 'SERVER_ERROR',
          message: 'No active game in this room.'
        });
        return;
      }

      const result = room.game.chooseWord(socket.id, payload.word);
      if (!result.success) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: result.error?.includes('drawer') ? 'NOT_DRAWER' : 'INVALID_WORD',
          message: result.error || 'Failed to choose word.'
        });
      }
    } catch (err: unknown) {
      console.error(`[Socket ${socket.id}] choose_word error:`, err);
    }
  });

  // 8. Play Again / Reset to Lobby (Host only)
  socket.on(SOCKET_EVENTS.PLAY_AGAIN, (payload: { roomId: string }) => {
    try {
      const room = roomManager.getRoom(payload.roomId);
      if (!room) return;
      if (room.hostId !== socket.id) {
        socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, {
          code: 'UNAUTHORIZED',
          message: 'Only the host can reset the game to lobby.'
        });
        return;
      }

      if (room.game) {
        room.game.clearAllTimers();
        room.game = null;
      }
      room.status = 'lobby';
      for (const p of room.players.values()) {
        p.score = 0;
        p.hasGuessed = false;
        p.isDrawer = false;
        p.isReady = p.isHost;
      }
      io.to(room.id).emit(SOCKET_EVENTS.ROOM_STATE, room.toDTO());
    } catch (err: unknown) {
      console.error(`[Socket ${socket.id}] play_again error:`, err);
    }
  });

  // 9. Explicit Leave Room
  socket.on(SOCKET_EVENTS.LEAVE_ROOM, (_payload?: LeaveRoomPayload) => {
    handlePlayerExit(io, socket);
  });

  // 8. Disconnect Cleanup
  socket.on(SOCKET_EVENTS.DISCONNECT, () => {
    handlePlayerExit(io, socket);
  });
}

function handlePlayerExit(io: Server, socket: Socket): void {
  const roomManager = RoomManager.getInstance();
  const room = roomManager.getRoomBySocket(socket.id);
  if (!room) return;

  const removedPlayer = room.removePlayer(socket.id);
  roomManager.unbindSocket(socket.id);
  socket.leave(room.id);

  if (removedPlayer) {
    console.log(`[Room ${room.code}] ${removedPlayer.name} left the room`);

    if (room.players.size === 0) {
      // Empty room cleanup after 30s
      roomManager.scheduleCleanup(room);
    } else {
      // Broadcast updated room state & host migration to remaining players
      io.to(room.id).emit(SOCKET_EVENTS.ROOM_STATE, room.toDTO());
      io.to(room.id).emit(SOCKET_EVENTS.PLAYER_LEFT, {
        playerId: removedPlayer.id,
        newHostId: room.hostId,
        players: Array.from(room.players.values()).map((p) => p.toDTO())
      });
    }
  }
}
