import { Server } from 'socket.io';
import {
  SOCKET_EVENTS,
  GameStatePayload,
  RoundStartPayload,
  RoundEndPayload,
  GameOverPayload,
  TimerTickPayload,
  HintRevealedPayload,
  DrawSyncPayload,
  PlayerDTO
} from '@skribbl/shared';
import { Room } from './Room';
import { DrawingState } from './DrawingState';
import { WordService } from '../services/WordService';

export class Game {
  public room: Room;
  public io: Server;
  public currentRound: number = 1;
  public totalRounds: number = 3;
  public drawerOrder: string[] = [];
  public drawerIndex: number = 0;
  public activeDrawerId: string | null = null;
  public currentWordOptions: string[] = [];
  public secretWord: string = '';
  public revealedIndices: Set<number> = new Set();
  public remainingTime: number = 0;
  public timer: NodeJS.Timeout | null = null;
  public intermissionTimer: NodeJS.Timeout | null = null;
  public wordSelectionTimer: NodeJS.Timeout | null = null;
  public drawingState: DrawingState = new DrawingState();
  public guessedPlayerIds: Set<string> = new Set();
  public roundPoints: Record<string, number> = {};

  private hint1Sent: boolean = false;
  private hint2Sent: boolean = false;
  private wordService = WordService.getInstance();

  constructor(room: Room, io: Server) {
    this.room = room;
    this.io = io;
    this.totalRounds = room.settings.rounds;
  }

  public start(): void {
    // Collect connected players in monotonic order for turn rotation
    const players = Array.from(this.room.players.values());
    this.drawerOrder = players.map((p) => p.id);
    this.drawerIndex = 0;
    this.currentRound = 1;

    console.log(`[Game ${this.room.code}] Game started. Rotation order: ${this.drawerOrder.join(', ')}`);
    this.startWordSelection();
  }

  public startWordSelection(): void {
    this.clearAllTimers();

    // Check if player count dropped below 2
    if (this.room.players.size < 2) {
      this.cancelGameDueToLackOfPlayers();
      return;
    }

    // Skip players who have left the room
    while (
      this.drawerIndex < this.drawerOrder.length &&
      !this.room.players.has(this.drawerOrder[this.drawerIndex])
    ) {
      this.drawerIndex++;
    }

    if (this.drawerIndex >= this.drawerOrder.length) {
      // Completed full rotation for the current round
      this.drawerIndex = 0;
      this.currentRound++;
      if (this.currentRound > this.totalRounds) {
        this.endGame();
        return;
      }
    }

    const drawerId = this.drawerOrder[this.drawerIndex];
    const drawerPlayer = this.room.players.get(drawerId);
    if (!drawerPlayer) {
      this.nextTurn();
      return;
    }

    this.activeDrawerId = drawerId;
    this.room.status = 'word_selecting';
    this.drawingState.clear();
    this.guessedPlayerIds.clear();
    this.roundPoints = {};
    this.revealedIndices.clear();
    this.hint1Sent = false;
    this.hint2Sent = false;
    this.secretWord = '';

    // Mark drawer in player DTOs
    for (const p of this.room.players.values()) {
      p.isDrawer = p.id === drawerId;
      p.hasGuessed = false;
    }

    // Offer configured number of words from WordService
    const wordCount = this.room.settings.wordCount || 3;
    this.currentWordOptions = this.wordService.getRandomWords(wordCount);

    console.log(`[Game ${this.room.code}] Word selecting: Drawer is ${drawerPlayer.name} (${drawerId})`);

    // CRITICAL: Send word choices strictly to drawer socket
    const drawerSocket = this.io.sockets.sockets.get(drawerPlayer.socketId);
    if (drawerSocket) {
      const drawerPayload: RoundStartPayload = {
        drawerId,
        drawerName: drawerPlayer.name,
        wordOptions: this.currentWordOptions,
        drawTime: this.room.settings.drawTime,
        round: this.currentRound,
      };
      drawerSocket.emit(SOCKET_EVENTS.ROUND_START, drawerPayload);
    }

    // Guessers receive payload WITHOUT wordOptions
    const guesserPayload: RoundStartPayload = {
      drawerId,
      drawerName: drawerPlayer.name,
      drawTime: this.room.settings.drawTime,
      round: this.currentRound,
    };
    drawerSocket?.to(this.room.id).emit(SOCKET_EVENTS.ROUND_START, guesserPayload);

    this.broadcastGameState();
    this.io.to(this.room.id).emit(SOCKET_EVENTS.ROOM_STATE, this.room.toDTO());

    // 15-second selection window with auto-pick fallback
    this.wordSelectionTimer = setTimeout(() => {
      if (this.room.status === 'word_selecting') {
        const autoWord = this.currentWordOptions[0] || 'APPLE';
        console.log(`[Game ${this.room.code}] 15s timeout: Auto-picked "${autoWord}" for ${drawerPlayer.name}`);
        this.chooseWord(drawerId, autoWord);
      }
    }, 15000);
  }

  public chooseWord(playerId: string, word: string): { success: boolean; error?: string } {
    if (playerId !== this.activeDrawerId) {
      return { success: false, error: 'Only the active drawer can select a word.' };
    }
    if (this.room.status !== 'word_selecting') {
      return { success: false, error: 'Game is not in word selection phase.' };
    }

    const normalizedWord = word.trim().toUpperCase();
    if (!this.currentWordOptions.includes(normalizedWord)) {
      return { success: false, error: 'Selected word is not among the offered choices.' };
    }

    if (this.wordSelectionTimer) {
      clearTimeout(this.wordSelectionTimer);
      this.wordSelectionTimer = null;
    }

    this.secretWord = normalizedWord;
    console.log(`[Game ${this.room.code}] Drawer selected secret word.`);
    this.startDrawingPhase();
    return { success: true };
  }

  public startDrawingPhase(): void {
    this.clearAllTimers();
    this.room.status = 'drawing';
    this.remainingTime = this.room.settings.drawTime;

    console.log(`[Game ${this.room.code}] Drawing phase started for ${this.remainingTime}s.`);
    this.broadcastGameState();
    this.io.to(this.room.id).emit(SOCKET_EVENTS.ROOM_STATE, this.room.toDTO());

    // 1-second interval authoritative timer
    this.timer = setInterval(() => {
      this.remainingTime--;

      const tickPayload: TimerTickPayload = { remainingTime: this.remainingTime };
      this.io.to(this.room.id).emit(SOCKET_EVENTS.TIMER_TICK, tickPayload);

      // Progressive Hint 1 (at 50% elapsed time)
      const halfTime = Math.floor(this.room.settings.drawTime * 0.5);
      if (
        this.room.settings.hints >= 1 &&
        !this.hint1Sent &&
        this.remainingTime <= halfTime
      ) {
        this.revealHint();
        this.hint1Sent = true;
      }

      // Progressive Hint 2 (at 75% elapsed time)
      const quarterTime = Math.floor(this.room.settings.drawTime * 0.25);
      if (
        this.room.settings.hints >= 2 &&
        !this.hint2Sent &&
        this.remainingTime <= quarterTime
      ) {
        this.revealHint();
        this.hint2Sent = true;
      }

      // Clock expiry
      if (this.remainingTime <= 0) {
        this.endTurn('TIME_UP');
      }
    }, 1000);
  }

  public revealHint(): void {
    const hintIndex = this.wordService.getNextHintIndex(this.secretWord, this.revealedIndices);
    if (hintIndex !== null) {
      this.revealedIndices.add(hintIndex);
      const maskedWord = this.wordService.generateMask(this.secretWord, this.revealedIndices);
      const letter = this.secretWord[hintIndex];

      const hintPayload: HintRevealedPayload = {
        maskedWord,
        revealedIndex: hintIndex,
        letter,
      };

      // Broadcast hint to non-drawers
      for (const player of this.room.players.values()) {
        if (player.id !== this.activeDrawerId) {
          const s = this.io.sockets.sockets.get(player.socketId);
          s?.emit(SOCKET_EVENTS.HINT_REVEALED, hintPayload);
        }
      }
      console.log(`[Game ${this.room.code}] Hint revealed at index ${hintIndex} ("${letter}"): ${maskedWord}`);
    }
  }

  public endTurn(reason: 'TIME_UP' | 'ALL_GUESSED' | 'DRAWER_DISCONNECTED'): void {
    this.clearAllTimers();
    this.room.status = 'round_end';

    console.log(`[Game ${this.room.code}] Turn ended (${reason}). Secret word was: ${this.secretWord}`);

    const roundEndPayload: RoundEndPayload = {
      secretWord: this.secretWord,
      reason,
      scores: this.getScoresMap(),
      roundPoints: { ...this.roundPoints },
      nextDrawerId: this.peekNextDrawerId(),
    };

    // Secret word is now permitted to be revealed to all players
    this.io.to(this.room.id).emit(SOCKET_EVENTS.ROUND_END, roundEndPayload);
    this.broadcastGameState();
    this.io.to(this.room.id).emit(SOCKET_EVENTS.ROOM_STATE, this.room.toDTO());

    // 5-second intermission before advancing
    this.intermissionTimer = setTimeout(() => {
      this.nextTurn();
    }, 5000);
  }

  public nextTurn(): void {
    this.drawerIndex++;
    this.startWordSelection();
  }

  public endGame(): void {
    this.clearAllTimers();
    this.room.status = 'game_over';

    const playersSorted = Array.from(this.room.players.values())
      .map((p) => p.toDTO())
      .sort((a, b) => b.score - a.score);

    const winner = playersSorted[0] || null;

    const gameOverPayload: GameOverPayload = {
      leaderboard: playersSorted,
      winner: winner!,
    };

    console.log(`[Game ${this.room.code}] Game Over! Winner: ${winner?.name}`);
    this.io.to(this.room.id).emit(SOCKET_EVENTS.GAME_OVER, gameOverPayload);
    this.io.to(this.room.id).emit(SOCKET_EVENTS.ROOM_STATE, this.room.toDTO());
  }

  public handlePlayerDisconnect(playerId: string): void {
    if (playerId === this.activeDrawerId) {
      console.log(`[Game ${this.room.code}] Active drawer disconnected! Ending turn early.`);
      this.endTurn('DRAWER_DISCONNECTED');
    } else {
      // Check if room now has fewer than 2 players
      if (this.room.players.size < 2) {
        this.cancelGameDueToLackOfPlayers();
      }
    }
  }

  public cancelGameDueToLackOfPlayers(): void {
    this.clearAllTimers();
    this.room.status = 'lobby';
    this.room.game = null;
    console.log(`[Game ${this.room.code}] Game cancelled: fewer than 2 players remain.`);
    this.io.to(this.room.id).emit(SOCKET_EVENTS.ROOM_STATE, this.room.toDTO());
    this.io.to(this.room.id).emit(SOCKET_EVENTS.ERROR_MESSAGE, {
      code: 'INSUFFICIENT_PLAYERS',
      message: 'Game halted: at least 2 players are required to continue.'
    });
  }

  public broadcastGameState(): void {
    const drawerPlayer = this.activeDrawerId ? this.room.players.get(this.activeDrawerId) : null;
    const masked = this.secretWord ? this.wordService.generateMask(this.secretWord, this.revealedIndices) : '';

    for (const player of this.room.players.values()) {
      const isDrawer = player.id === this.activeDrawerId;
      const socket = this.io.sockets.sockets.get(player.socketId);
      if (!socket) continue;

      // PROTECT SECRET WORD: Guessers receive only masked blanks; drawer receives plaintext
      const payload: GameStatePayload = {
        roomId: this.room.id,
        status: this.room.status,
        round: this.currentRound,
        totalRounds: this.totalRounds,
        drawerId: this.activeDrawerId,
        drawerName: drawerPlayer?.name || null,
        maskedWord: isDrawer ? this.secretWord : masked,
        wordLength: this.secretWord.length,
        remainingTime: this.remainingTime,
        players: Array.from(this.room.players.values()).map((p) => p.toDTO()),
      };

      socket.emit(SOCKET_EVENTS.GAME_STATE, payload);
    }
  }

  public getScoresMap(): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const p of this.room.players.values()) {
      scores[p.id] = p.score;
    }
    return scores;
  }

  private peekNextDrawerId(): string | undefined {
    let nextIdx = this.drawerIndex + 1;
    if (nextIdx >= this.drawerOrder.length) nextIdx = 0;
    return this.drawerOrder[nextIdx];
  }

  public clearAllTimers(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.intermissionTimer) {
      clearTimeout(this.intermissionTimer);
      this.intermissionTimer = null;
    }
    if (this.wordSelectionTimer) {
      clearTimeout(this.wordSelectionTimer);
      this.wordSelectionTimer = null;
    }
  }
}
