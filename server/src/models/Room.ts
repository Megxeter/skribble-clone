import { RoomSettings, RoomStatus, RoomStatePayload, SETTINGS_CONSTRAINTS } from '@skribbl/shared';
import { Player } from './Player';
import type { Game } from './Game';

export class Room {
  public id: string;
  public code: string;
  public isPublic: boolean;
  public settings: RoomSettings;
  public players: Map<string, Player> = new Map();
  public hostId: string;
  public status: RoomStatus = 'lobby';
  public createdAt: number = Date.now();
  public cleanupTimeout: NodeJS.Timeout | null = null;
  public game: Game | null = null;

  constructor(id: string, code: string, isPublic: boolean, host: Player, initialSettings?: Partial<RoomSettings>) {
    this.id = id;
    this.code = code.toUpperCase();
    this.isPublic = isPublic;
    this.hostId = host.id;
    this.settings = Room.sanitizeSettings(initialSettings);
    this.addPlayer(host);
  }

  public static generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes 0, O, 1, I for readability
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  public static sanitizeSettings(input?: Partial<RoomSettings>): RoomSettings {
    const defaults: RoomSettings = {
      maxPlayers: SETTINGS_CONSTRAINTS.maxPlayers.default,
      rounds: SETTINGS_CONSTRAINTS.rounds.default,
      drawTime: SETTINGS_CONSTRAINTS.drawTime.default,
      wordCount: SETTINGS_CONSTRAINTS.wordCount.default,
      hints: SETTINGS_CONSTRAINTS.hints.default,
    };

    if (!input) return defaults;

    const clamp = (val: unknown, min: number, max: number, fallback: number): number => {
      if (typeof val !== 'number' || isNaN(val)) return fallback;
      return Math.max(min, Math.min(max, Math.floor(val)));
    };

    return {
      maxPlayers: clamp(input.maxPlayers, SETTINGS_CONSTRAINTS.maxPlayers.min, SETTINGS_CONSTRAINTS.maxPlayers.max, defaults.maxPlayers),
      rounds: clamp(input.rounds, SETTINGS_CONSTRAINTS.rounds.min, SETTINGS_CONSTRAINTS.rounds.max, defaults.rounds),
      drawTime: clamp(input.drawTime, SETTINGS_CONSTRAINTS.drawTime.min, SETTINGS_CONSTRAINTS.drawTime.max, defaults.drawTime),
      wordCount: clamp(input.wordCount, SETTINGS_CONSTRAINTS.wordCount.min, SETTINGS_CONSTRAINTS.wordCount.max, defaults.wordCount),
      hints: clamp(input.hints, SETTINGS_CONSTRAINTS.hints.min, SETTINGS_CONSTRAINTS.hints.max, defaults.hints),
    };
  }

  public static validateSettings(input: Partial<RoomSettings>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (input.maxPlayers !== undefined) {
      if (typeof input.maxPlayers !== 'number' || !Number.isInteger(input.maxPlayers) ||
          input.maxPlayers < SETTINGS_CONSTRAINTS.maxPlayers.min || input.maxPlayers > SETTINGS_CONSTRAINTS.maxPlayers.max) {
        errors.push(`maxPlayers must be an integer between ${SETTINGS_CONSTRAINTS.maxPlayers.min} and ${SETTINGS_CONSTRAINTS.maxPlayers.max}`);
      }
    }

    if (input.rounds !== undefined) {
      if (typeof input.rounds !== 'number' || !Number.isInteger(input.rounds) ||
          input.rounds < SETTINGS_CONSTRAINTS.rounds.min || input.rounds > SETTINGS_CONSTRAINTS.rounds.max) {
        errors.push(`rounds must be an integer between ${SETTINGS_CONSTRAINTS.rounds.min} and ${SETTINGS_CONSTRAINTS.rounds.max}`);
      }
    }

    if (input.drawTime !== undefined) {
      if (typeof input.drawTime !== 'number' || !Number.isInteger(input.drawTime) ||
          input.drawTime < SETTINGS_CONSTRAINTS.drawTime.min || input.drawTime > SETTINGS_CONSTRAINTS.drawTime.max) {
        errors.push(`drawTime must be an integer between ${SETTINGS_CONSTRAINTS.drawTime.min} and ${SETTINGS_CONSTRAINTS.drawTime.max}`);
      }
    }

    if (input.wordCount !== undefined) {
      if (typeof input.wordCount !== 'number' || !Number.isInteger(input.wordCount) ||
          input.wordCount < SETTINGS_CONSTRAINTS.wordCount.min || input.wordCount > SETTINGS_CONSTRAINTS.wordCount.max) {
        errors.push(`wordCount must be an integer between ${SETTINGS_CONSTRAINTS.wordCount.min} and ${SETTINGS_CONSTRAINTS.wordCount.max}`);
      }
    }

    if (input.hints !== undefined) {
      if (typeof input.hints !== 'number' || !Number.isInteger(input.hints) ||
          input.hints < SETTINGS_CONSTRAINTS.hints.min || input.hints > SETTINGS_CONSTRAINTS.hints.max) {
        errors.push(`hints must be an integer between ${SETTINGS_CONSTRAINTS.hints.min} and ${SETTINGS_CONSTRAINTS.hints.max}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  public updateSettings(newSettings: Partial<RoomSettings>): { valid: boolean; errors: string[] } {
    const validation = Room.validateSettings(newSettings);
    if (!validation.valid) {
      return validation;
    }

    // If maxPlayers is being reduced below current player count, check that
    if (newSettings.maxPlayers !== undefined && newSettings.maxPlayers < this.players.size) {
      return {
        valid: false,
        errors: [`Cannot set maxPlayers to ${newSettings.maxPlayers} because there are already ${this.players.size} players in the room.`]
      };
    }

    this.settings = Room.sanitizeSettings({ ...this.settings, ...newSettings });
    return { valid: true, errors: [] };
  }

  public addPlayer(player: Player): { success: boolean; error?: string; code?: 'ROOM_FULL' | 'GAME_IN_PROGRESS' } {
    if (this.status !== 'lobby') {
      return { success: false, error: 'Cannot join room; game is already in progress.', code: 'GAME_IN_PROGRESS' };
    }
    if (this.players.size >= this.settings.maxPlayers) {
      return { success: false, error: 'Room has reached maximum player capacity.', code: 'ROOM_FULL' };
    }

    this.players.set(player.id, player);
    return { success: true };
  }

  public removePlayer(playerId: string): Player | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    this.players.delete(playerId);
    if (this.game) {
      this.game.handlePlayerDisconnect(playerId);
    }
    this.transferHostIfNeeded();
    return player;
  }

  public transferHostIfNeeded(): Player | null {
    // If the host is still in the room, no transfer needed
    if (this.players.has(this.hostId)) {
      return null;
    }

    // Room is empty
    if (this.players.size === 0) {
      return null;
    }

    // Find the oldest connected player based on joinedAt timestamp
    let nextHost: Player | null = null;
    for (const p of this.players.values()) {
      if (!nextHost || p.joinedAt < nextHost.joinedAt) {
        nextHost = p;
      }
    }

    if (nextHost) {
      nextHost.isHost = true;
      nextHost.isReady = true;
      this.hostId = nextHost.id;
      console.log(`[Room ${this.code}] Host migrated to ${nextHost.name} (${nextHost.id})`);
      return nextHost;
    }

    return null;
  }

  public canStart(): { allowed: boolean; code?: string; message?: string } {
    if (this.status !== 'lobby') {
      return { allowed: false, code: 'GAME_IN_PROGRESS', message: 'Game has already started.' };
    }
    if (this.players.size < 2) {
      return {
        allowed: false,
        code: 'INSUFFICIENT_PLAYERS',
        message: 'At least 2 players are required to start the game.'
      };
    }
    return { allowed: true };
  }

  public toDTO(): RoomStatePayload {
    return {
      roomId: this.id,
      code: this.code,
      isPublic: this.isPublic,
      settings: { ...this.settings },
      players: Array.from(this.players.values()).map((p) => p.toDTO()),
      hostId: this.hostId,
      status: this.status,
      canStart: this.canStart().allowed,
    };
  }
}
