import { RoomSettings } from '@skribbl/shared';
import { Room } from '../models/Room';
import { Player } from '../models/Player';

export class RoomManager {
  private static instance: RoomManager | null = null;

  private rooms: Map<string, Room> = new Map();
  private codeToId: Map<string, string> = new Map();
  private socketToRoomId: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  public createRoom(hostPlayer: Player, isPublic: boolean, settings?: Partial<RoomSettings>): Room {
    const id = `room_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    // Ensure unique room code
    let code: string;
    do {
      code = Room.generateRoomCode();
    } while (this.codeToId.has(code));

    const room = new Room(id, code, isPublic, hostPlayer, settings);
    this.rooms.set(id, room);
    this.codeToId.set(code, id);
    this.socketToRoomId.set(hostPlayer.socketId, id);

    console.log(`[RoomManager] Created ${isPublic ? 'Public' : 'Private'} room [${code}] (ID: ${id}) by ${hostPlayer.name}`);
    return room;
  }

  public findPublicRoom(): Room | null {
    let bestCandidate: Room | null = null;

    for (const room of this.rooms.values()) {
      if (
        room.isPublic &&
        room.status === 'lobby' &&
        room.players.size < room.settings.maxPlayers
      ) {
        // Prefer room with the most players to quickly fill lobbies
        if (!bestCandidate || room.players.size > bestCandidate.players.size) {
          bestCandidate = room;
        }
      }
    }

    return bestCandidate;
  }

  public getRoom(idOrCode: string): Room | null {
    if (!idOrCode) return null;
    if (this.rooms.has(idOrCode)) {
      return this.rooms.get(idOrCode)!;
    }
    const id = this.codeToId.get(idOrCode.toUpperCase());
    if (id && this.rooms.has(id)) {
      return this.rooms.get(id)!;
    }
    return null;
  }

  public getRoomBySocket(socketId: string): Room | null {
    const roomId = this.socketToRoomId.get(socketId);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  public bindSocket(socketId: string, roomId: string): void {
    this.socketToRoomId.set(socketId, roomId);
  }

  public unbindSocket(socketId: string): void {
    this.socketToRoomId.delete(socketId);
  }

  public scheduleCleanup(room: Room): void {
    if (room.cleanupTimeout) {
      clearTimeout(room.cleanupTimeout);
    }

    // Schedule deletion after 30 seconds if room remains empty (Decision 8)
    room.cleanupTimeout = setTimeout(() => {
      if (room.players.size === 0) {
        this.removeRoom(room.id);
        console.log(`[RoomManager] Pruned empty room [${room.code}] (ID: ${room.id})`);
      }
    }, 30000);
  }

  public cancelCleanup(room: Room): void {
    if (room.cleanupTimeout) {
      clearTimeout(room.cleanupTimeout);
      room.cleanupTimeout = null;
    }
  }

  public removeRoom(idOrCode: string): void {
    const room = this.getRoom(idOrCode);
    if (!room) return;

    if (room.cleanupTimeout) {
      clearTimeout(room.cleanupTimeout);
      room.cleanupTimeout = null;
    }

    this.codeToId.delete(room.code);
    this.rooms.delete(room.id);

    // Clean up any remaining socket mappings
    for (const player of room.players.values()) {
      this.socketToRoomId.delete(player.socketId);
    }
  }

  public getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  // Clear all rooms (for testing)
  public reset(): void {
    for (const room of this.rooms.values()) {
      if (room.cleanupTimeout) {
        clearTimeout(room.cleanupTimeout);
      }
    }
    this.rooms.clear();
    this.codeToId.clear();
    this.socketToRoomId.clear();
  }
}
