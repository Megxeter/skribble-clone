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
  HintRevealedPayload
} from '@skribbl/shared';
import { Canvas } from './Canvas';
import { Toolbar } from './Toolbar';
import { WordSelectModal } from './WordSelectModal';

interface GameViewProps {
  socket: Socket | null;
  myId: string;
  roomState: RoomStatePayload;
  onLeaveRoom: () => void;
}

export const GameView: React.FC<GameViewProps> = ({
  socket,
  myId,
  roomState,
  onLeaveRoom,
}) => {
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [roundStartData, setRoundStartData] = useState<RoundStartPayload | null>(null);
  const [roundEndData, setRoundEndData] = useState<RoundEndPayload | null>(null);
  const [gameOverData, setGameOverData] = useState<GameOverPayload | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(roomState.settings.drawTime);

  const [currentColor, setCurrentColor] = useState<string>('#000000');
  const [currentSize, setCurrentSize] = useState<number>(4);
  const [isEraser, setIsEraser] = useState<boolean>(false);

  // Active drawer determination
  const isDrawer = (gameState?.drawerId || roundStartData?.drawerId) === myId;
  const currentDrawerName = gameState?.drawerName || roundStartData?.drawerName || 'Player';

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

      {/* Main Game Grid: Players + Canvas + Tools */}
      <div className="game-main-grid">
        {/* Left: Player Roster & Scores */}
        <div className="card game-players-card">
          <div className="card-title">
            <span>Scoreboard ({roomState.players.length})</span>
          </div>
          <div className="game-player-list">
            {(gameState?.players || roomState.players).map((player) => {
              const isThisDrawer = player.id === (gameState?.drawerId || roundStartData?.drawerId);
              const isMe = player.id === myId;
              const initial = player.name ? player.name.charAt(0).toUpperCase() : 'P';
              return (
                <div key={player.id} className={`game-player-row ${isMe ? 'is-me' : ''} ${isThisDrawer ? 'is-drawer' : ''}`}>
                  <div className="game-player-avatar">{initial}</div>
                  <div className="game-player-details">
                    <span className="game-player-name">
                      {player.name} {isMe && <span className="you-tag">(You)</span>}
                    </span>
                    <span className="game-player-role">
                      {isThisDrawer ? 'Drawing now' : 'Guessing'}
                    </span>
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
          </div>
        </div>
      </div>

      {/* Word Selection Modal (Only shown to active drawer) */}
      {roomState.status === 'word_selecting' && isDrawer && roundStartData?.wordOptions && (
        <WordSelectModal
          socket={socket}
          wordOptions={roundStartData.wordOptions}
          remainingTime={remainingTime}
        />
      )}

      {/* Game Over Leaderboard Dialog */}
      {roomState.status === 'game_over' && gameOverData && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content game-over-modal">
            <div className="modal-header">
              <h2 className="modal-title">Game Over</h2>
            </div>
            <p className="game-over-desc">
              All {roomState.settings.rounds} rounds completed. Final rankings:
            </p>
            <div className="leaderboard-list">
              {gameOverData.leaderboard.map((player, idx) => (
                <div key={player.id} className="leaderboard-row">
                  <span className="rank-badge">#{idx + 1}</span>
                  <span className="leaderboard-name">{player.name}</span>
                  <span className="leaderboard-score">{player.score} points</span>
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="btn btn-primary" onClick={onLeaveRoom}>
                Return to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
