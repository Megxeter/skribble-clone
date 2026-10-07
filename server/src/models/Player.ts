import { PlayerDTO } from '@skribbl/shared';

export class Player {
  public id: string;
  public socketId: string;
  public rawName: string;
  public name: string;
  public score: number = 0;
  public isHost: boolean = false;
  public hasGuessed: boolean = false;
  public isReady: boolean = false;
  public isDrawer: boolean = false;
  public joinedAt: number = Date.now();
  public assignedNumber: number | null = null;
  public isSuffixed: boolean = false;

  constructor(socketId: string, name: string, isHost: boolean = false) {
    this.id = socketId; // Use socketId as unique identifier for v1
    this.socketId = socketId;
    this.rawName = Player.sanitizeName(name);
    this.name = this.rawName;
    this.isHost = isHost;
    this.isReady = isHost; // Host is always ready by default
  }

  public static sanitizeName(rawName?: string): string {
    const trimmed = (rawName || '').trim();
    if (!trimmed) {
      return `Player_${Math.floor(1000 + Math.random() * 9000)}`;
    }
    // Limit to 20 characters and strip dangerous control characters
    return trimmed.slice(0, 20).replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  }

  public toDTO(): PlayerDTO {
    return {
      id: this.id,
      socketId: this.socketId,
      name: this.name,
      score: this.score,
      isHost: this.isHost,
      hasGuessed: this.hasGuessed,
      isReady: this.isReady,
      isDrawer: this.isDrawer,
    };
  }
}
