import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  RoomStatePayload,
  GameStatePayload,
  RoundStartPayload,
  RoundEndPayload,
  GameOverPayload,
  TimerTickPayload,
  HintRevealedPayload,
  PlayAgainPayload
} from '@skribbl/shared';
import { Canvas } from './Canvas';
import { Toolbar } from './Toolbar';
import { WordSelectModal } from './WordSelectModal';
import { Chat } from './Chat';

interface GameViewProps {
  socket: Socket | null;
  myId: string;
  roomState: RoomStatePayload;
  onLeaveRoom: () => void;
  initialRoundStartData?: RoundStartPayload | null;
  initialGameState?: GameStatePayload | null;
}

export const GameView: React.FC<GameViewProps> = ({
  socket,
  myId,
  roomState,
  onLeaveRoom,
  initialRoundStartData,
  initialGameState,
}) => {
  const [gameState, setGameState] = useState<GameStatePayload | null>(initialGameState || null);
  const [roundStartData, setRoundStartData] = useState<RoundStartPayload | null>(initialRoundStartData || null);
  const [roundEndData, setRoundEndData] = useState<RoundEndPayload | null>(null);
  const [gameOverData, setGameOverData] = useState<GameOverPayload | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(
    initialGameState?.remainingTime || (roomState.status === 'word_selecting' ? 15 : roomState.settings.drawTime)
  );

  const [currentColor, setCurrentColor] = useState<string>('#000000');
  const [currentSize, setCurrentSize] = useState<number>(4);
  const [isEraser, setIsEraser] = useState<boolean>(false);

  const isHost = roomState.hostId === myId;
  const isDrawer =
    (gameState?.drawerId ||
      roundStartData?.drawerId ||
      roomState.players.find((p) => p.isDrawer)?.id) === myId;
  const currentDrawerName =
    gameState?.drawerName ||
    roundStartData?.drawerName ||
    roomState.players.find((p) => p.isDrawer)?.name ||
    'Player';

  const myPlayer = (gameState?.players || roomState.players).find((p) => p.id === myId);
  const hasGuessed = myPlayer?.hasGuessed ?? false;

  useEffect(() => {
    if (initialRoundStartData) {
      setRoundStartData(initialRoundStartData);
    }
  }, [initialRoundStartData]);

  useEffect(() => {
    if (initialGameState) {
      setGameState(initialGameState);
      if (initialGameState.remainingTime !== undefined) {
        setRemainingTime(initialGameState.remainingTime);
      }
    }
  }, [initialGameState]);

  useEffect(() => {
    if (!socket) return;

    const handleGameState = (state: GameStatePayload) => {
      setGameState(state);
      setRemainingTime(state.remainingTime);
      if (state.status === 'drawing') {
        setRoundEndData(null);
      }
    };

    const handleRoundStart = (payload: RoundStartPayload) => {
      setRoundStartData(payload);
      setRoundEndData(null);
      setRemainingTime(15);
    };

    const handleTimerTick = (payload: TimerTickPayload) => {
      setRemainingTime(payload.remainingTime);
    };

    const handleHintRevealed = (payload: HintRevealedPayload) => {
      setGameState((prev) => (prev ? { ...prev, maskedWord: payload.maskedWord } : null));
    };

    const handleRoundEnd = (payload: RoundEndPayload) => {
      setRoundEndData(payload);
      setRemainingTime(5);
    };

    const handleGameOver = (payload: GameOverPayload) => {
      setGameOverData(payload);
    };

    socket.on(SOCKET_EVENTS.GAME_STATE, handleGameState);
    socket.on(SOCKET_EVENTS.ROUND_START, handleRoundStart);
    socket.on(SOCKET_EVENTS.TIMER_TICK, handleTimerTick);
    socket.on(SOCKET_EVENTS.HINT_REVEALED, handleHintRevealed);
    socket.on(SOCKET_EVENTS.ROUND_END, handleRoundEnd);
    socket.on(SOCKET_EVENTS.GAME_OVER, handleGameOver);

    return () => {
      socket.off(SOCKET_EVENTS.GAME_STATE, handleGameState);
      socket.off(SOCKET_EVENTS.ROUND_START, handleRoundStart);
      socket.off(SOCKET_EVENTS.TIMER_TICK, handleTimerTick);
      socket.off(SOCKET_EVENTS.HINT_REVEALED, handleHintRevealed);
      socket.off(SOCKET_EVENTS.ROUND_END, handleRoundEnd);
      socket.off(SOCKET_EVENTS.GAME_OVER, handleGameOver);
    };
  }, [socket]);

  const handlePlayAgain = () => {
    if (!socket || !isHost) return;
    const payload: PlayAgainPayload = { roomId: roomState.roomId };
    socket.emit(SOCKET_EVENTS.PLAY_AGAIN, payload);
  };

  // Sort players descending by score for live leaderboard
  const sortedPlayers = [...(gameState?.players || roomState.players)].sort((a, b) => b.score - a.score);

  return (
    <div className="game-view-container">
      {/* Game Header Bar */}
      <div className="card game-header-card">
        <div className="game-header-item">
          <span className="game-header-label">Round</span>
          <span className="game-header-val">
            {gameState?.round || 1} / {roomState.settings.rounds}
          </span>
        </div>

        {/* Word Display Header */}
        <div className="game-header-word-section">
          {roomState.status === 'word_selecting' ? (
            <span className="game-phase-text">
              {isDrawer ? 'Select a word to draw' : `${currentDrawerName} is choosing a word...`}
            </span>
          ) : roomState.status === 'drawing' ? (
            <div className="word-banner">
              <span className="word-banner-label">{isDrawer ? 'Word to Draw:' : 'Word:'}</span>
              <span className="word-banner-text">{gameState?.maskedWord || ''}</span>
              {!isDrawer && gameState?.wordLength && (
                <span className="word-length-hint">({gameState.wordLength} letters)</span>
              )}
            </div>
          ) : roomState.status === 'round_end' && roundEndData ? (
            <div className="word-banner intermission-banner">
              <span className="word-banner-label">Word was:</span>
              <span className="word-banner-text revealed-word">{roundEndData.secretWord}</span>
            </div>
          ) : (
            <span className="game-phase-text">Game Over</span>
          )}
        </div>

        <div className="game-header-item timer-item">
          <span className="game-header-label">Time</span>
          <span className={`game-header-val ${remainingTime <= 10 ? 'time-warning' : ''}`}>
            {remainingTime}s
          </span>
        </div>

        <div className="game-header-item">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onLeaveRoom}>
            Leave Game
          </button>
        </div>
      </div>

      {/* Main Game Grid: 1. Scoreboard | 2. Canvas & Tools | 3. Chat & Guesses */}
      <div className="game-main-grid">
        {/* Left: Player Roster & Live Scores */}
        <div className="card game-players-card">
          <div className="card-title">
            <span>Scoreboard ({sortedPlayers.length})</span>
          </div>
          <div className="game-player-list">
            {sortedPlayers.map((player, idx) => {
              const isThisDrawer = player.id === (gameState?.drawerId || roundStartData?.drawerId);
              const isMe = player.id === myId;
              const initial = player.name ? player.name.charAt(0).toUpperCase() : 'P';
              return (
                <div key={player.id} className={`game-player-row ${isMe ? 'is-me' : ''} ${isThisDrawer ? 'is-drawer' : ''}`}>
                  <div className="game-player-rank">#{idx + 1}</div>
                  <div className="game-player-avatar">{initial}</div>
                  <div className="game-player-details">
                    <span className="game-player-name">
                      {player.name} {isMe && <span className="you-tag">(You)</span>}
                    </span>
                    <div className="game-player-badges">
                      {isThisDrawer ? (
                        <span className="status-chip chip-host">Drawing</span>
                      ) : player.hasGuessed ? (
                        <span className="status-chip chip-ready">Guessed</span>
                      ) : (
                        <span className="status-chip chip-waiting">Guessing</span>
                      )}
                    </div>
                  </div>
                  <div className="game-player-score">{player.score} pts</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: Canvas & Drawer Toolbar */}
        <div className="game-canvas-area">
          <div className="card canvas-card">
            {roomState.status === 'drawing' && (
              <div className="canvas-drawer-status" id="canvas-drawer-status">
                {currentDrawerName} is drawing
              </div>
            )}
            <Canvas
              socket={socket}
              isDrawer={isDrawer && roomState.status === 'drawing'}
              currentColor={isEraser ? '#16181d' : currentColor}
              currentSize={currentSize}
              disabled={!isDrawer || roomState.status !== 'drawing'}
            />

            {/* Drawing Toolbar (shown strictly to drawer during drawing) */}
            {isDrawer && roomState.status === 'drawing' && (
              <Toolbar
                socket={socket}
                currentColor={currentColor}
                onSelectColor={setCurrentColor}
                currentSize={currentSize}
                onSelectSize={setCurrentSize}
                isEraser={isEraser}
                onToggleEraser={setIsEraser}
              />
            )}

            {/* Round Intermission Banner */}
            {roomState.status === 'round_end' && roundEndData && (
              <div className="intermission-scores-panel">
                <span className="intermission-title">Turn Complete - Points Awarded:</span>
                <div className="intermission-points-grid">
                  {Object.entries(roundEndData.roundPoints || {}).map(([pid, pts]) => {
                    const p = roomState.players.find((pl) => pl.id === pid);
                    return (
                      <div key={pid} className="intermission-point-badge">
                        <span className="point-player">{p?.name || 'Player'}:</span>
                        <span className="point-value">+{pts} pts</span>
                      </div>
                    );
                  })}
                  {Object.keys(roundEndData.roundPoints || {}).length === 0 && (
                    <span className="no-points-text">No points scored this turn.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Room-Scoped Chat & Guessing Feed */}
        <div className="game-chat-area">
          <Chat
            socket={socket}
            myId={myId}
            hasGuessed={hasGuessed}
            isDrawer={isDrawer && roomState.status === 'drawing'}
          />
        </div>
      </div>

      {/* Word Selection Modal (Only shown to active drawer) */}
      {roomState.status === 'word_selecting' && isDrawer && (roundStartData?.wordOptions || gameState?.wordOptions) && (
        <WordSelectModal
          socket={socket}
          wordOptions={(roundStartData?.wordOptions || gameState?.wordOptions)!}
          remainingTime={remainingTime}
        />
      )}

      {/* Waiting screen for guessers during word selection */}
      {roomState.status === 'word_selecting' && !isDrawer && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content word-select-content waiting-content">
            <div className="modal-header">
              <h2 className="modal-title">Waiting for Word</h2>
              <span className="selection-timer-badge">{remainingTime}s remaining</span>
            </div>
            <p className="word-select-desc">
              <strong>{currentDrawerName}</strong> is choosing a word to draw...
            </p>
            <div className="waiting-spinner-area">
              <span className="waiting-status-text">Get ready to guess!</span>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Leaderboard Dialog */}
      {roomState.status === 'game_over' && gameOverData && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content game-over-modal">
            <div className="modal-header">
              <h2 className="modal-title">Game Over</h2>
            </div>
            {gameOverData.leaderboard.length >= 2 &&
            gameOverData.leaderboard[0].score > 0 &&
            gameOverData.leaderboard[0].score === gameOverData.leaderboard[1].score ? (
              <p className="game-over-desc">
                Tie for 1st Place! Both players finished with {gameOverData.leaderboard[0].score} points.
              </p>
            ) : (
              <p className="game-over-desc">
                Winner: {gameOverData.winner?.name} with {gameOverData.winner?.score} points!
              </p>
            )}

            <div className="leaderboard-list">
              {gameOverData.leaderboard.map((player, idx) => (
                <div key={player.id} className="leaderboard-row">
                  <span className="rank-badge">#{idx + 1}</span>
                  <span className="leaderboard-name">{player.name}</span>
                  <span className="leaderboard-score">{player.score} points</span>
                </div>
              ))}
            </div>

            <div className="modal-actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
              {isHost && (
                <button type="button" className="btn btn-primary" onClick={handlePlayAgain}>
                  Play Again
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={onLeaveRoom}>
                Leave Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
