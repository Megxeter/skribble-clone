// Shared Data Types and Contracts

export interface PlayerDTO {
  id: string;
  socketId: string;
  name: string;
  score: number;
  isHost: boolean;
  hasGuessed: boolean;
  isReady?: boolean;
  isDrawer?: boolean;
}

export interface RoomSettings {
  maxPlayers: number;  // 2 - 20 (default 8)
  rounds: number;      // 2 - 10 (default 3)
  drawTime: number;    // 15 - 240 (default 80)
  wordCount: number;   // 1 - 5 (default 3)
  hints: number;       // 0 - 5 (default 2)
}

export const SETTINGS_CONSTRAINTS = {
  maxPlayers: { min: 2, max: 20, default: 8 },
  rounds: { min: 2, max: 10, default: 3 },
  drawTime: { min: 15, max: 240, default: 80 },
  wordCount: { min: 1, max: 5, default: 3 },
  hints: { min: 0, max: 5, default: 2 },
} as const;

export type RoomStatus = 'lobby' | 'word_selecting' | 'drawing' | 'round_end' | 'game_over';

export interface HealthResponse {
  status: 'ok';
  uptime: number;
  timestamp: string;
}

// Room & Lobby Payloads
export interface CreateRoomPayload {
  playerName: string;
  isPublic: boolean;
  settings?: Partial<RoomSettings>;
}

export interface JoinRoomPayload {
  playerName: string;
  roomId: string;
}

export interface JoinPublicPayload {
  playerName: string;
}

export interface LeaveRoomPayload {
  roomId: string;
}

export interface UpdateSettingsPayload {
  roomId: string;
  settings: Partial<RoomSettings>;
}

export interface SetReadyPayload {
  roomId: string;
  isReady: boolean;
}

export interface StartGamePayload {
  roomId: string;
}

export interface RoomStatePayload {
  roomId: string;
  code: string;
  isPublic: boolean;
  settings: RoomSettings;
  players: PlayerDTO[];
  hostId: string;
  status: RoomStatus;
  canStart: boolean;
}

export interface PlayerJoinedPayload {
  player: PlayerDTO;
  players: PlayerDTO[];
}

export interface PlayerLeftPayload {
  playerId: string;
  newHostId?: string;
  players: PlayerDTO[];
}

export interface ErrorPayload {
  code: 'INSUFFICIENT_PLAYERS' | 'ROOM_FULL' | 'ROOM_NOT_FOUND' | 'GAME_IN_PROGRESS' | 'SERVER_ERROR' | 'UNAUTHORIZED' | 'INVALID_SETTINGS' | 'NOT_DRAWER' | 'INVALID_WORD';
  message: string;
}

// Game State Payloads
export interface GameStatePayload {
  roomId: string;
  status: RoomStatus;
  round: number;
  totalRounds: number;
  drawerId: string | null;
  drawerName: string | null;
  maskedWord: string;
  wordLength: number;
  remainingTime: number;
  players: PlayerDTO[];
}

export interface RoundStartPayload {
  drawerId: string;
  drawerName?: string;
  wordOptions?: string[]; // Only provided to drawer socket
  drawTime: number;
  round: number;
}

export interface ChooseWordPayload {
  word: string;
}

export interface TimerTickPayload {
  remainingTime: number;
}

export interface HintRevealedPayload {
  maskedWord: string;
  revealedIndex: number;
  letter: string;
}

export interface RoundEndPayload {
  secretWord: string;
  reason: 'TIME_UP' | 'ALL_GUESSED' | 'DRAWER_DISCONNECTED';
  scores: Record<string, number>;
  roundPoints: Record<string, number>;
  nextDrawerId?: string;
}

export interface GameOverPayload {
  leaderboard: PlayerDTO[];
  winner: PlayerDTO;
}

// Drawing Payloads
export interface DrawStartPayload {
  x: number;      // 0.0 to 1.0 relative
  y: number;      // 0.0 to 1.0 relative
  color: string;
  size: number;
}

export interface DrawMovePayload {
  x: number;      // 0.0 to 1.0 relative
  y: number;      // 0.0 to 1.0 relative
}

export interface DrawEndPayload {}

export interface DrawSyncPayload {
  strokes: Stroke[];
}

export interface StrokePoint {
  x: number;
  y: number;
}

export interface Stroke {
  points: StrokePoint[];
  color: string;
  size: number;
}

// Chat Payloads
export interface ChatInputPayload {
  text: string;
}

export interface ChatMessagePayload {
  senderId: string;
  senderName: string;
  text: string;
  type: 'chat' | 'system' | 'close';
}

export interface CorrectGuessPayload {
  playerId: string;
  playerName: string;
  pointsEarned: number;
}
