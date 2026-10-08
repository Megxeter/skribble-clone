import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  RoomSettings,
  SETTINGS_CONSTRAINTS,
  CreateRoomPayload,
  JoinRoomPayload,
  JoinPublicPayload
} from '@skribbl/shared';

interface LandingProps {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting?: boolean;
  initialRoomCode?: string;
  errorMessage?: string | null;
  onClearError?: () => void;
}

export const Landing: React.FC<LandingProps> = ({
  socket,
  isConnected,
  isConnecting,
  initialRoomCode = '',
  errorMessage,
  onClearError,
}) => {
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('skribbl_player_name') || '';
  });
  const [roomCode, setRoomCode] = useState<string>(initialRoomCode);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [isPublicRoom, setIsPublicRoom] = useState<boolean>(true);
  const [settings, setSettings] = useState<RoomSettings>({
    maxPlayers: SETTINGS_CONSTRAINTS.maxPlayers.default,
    rounds: SETTINGS_CONSTRAINTS.rounds.default,
    drawTime: SETTINGS_CONSTRAINTS.drawTime.default,
    wordCount: SETTINGS_CONSTRAINTS.wordCount.default,
    hints: SETTINGS_CONSTRAINTS.hints.default,
  });

  const saveName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('skribbl_player_name', name);
    if (onClearError) onClearError();
  };

  const handleJoinPublic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !isConnected) return;
    const payload: JoinPublicPayload = {
      playerName: playerName.trim() || 'Player'
    };
    socket.emit(SOCKET_EVENTS.JOIN_PUBLIC, payload);
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !isConnected || !roomCode.trim()) return;
    const payload: JoinRoomPayload = {
      playerName: playerName.trim() || 'Player',
      roomId: roomCode.trim().toUpperCase()
    };
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, payload);
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !isConnected) return;
    const payload: CreateRoomPayload = {
      playerName: playerName.trim() || 'Host',
      isPublic: isPublicRoom,
      settings: { ...settings }
    };
    socket.emit(SOCKET_EVENTS.CREATE_ROOM, payload);
    setShowCreateModal(false);
  };

  return (
    <div className="landing-container">
      {/* Brand Header */}
      <div className="header">
        <h1 className="logo-title">skribbl.io</h1>
        <p className="tagline">Multiplayer Drawing and Guessing</p>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="alert-banner alert-danger" role="alert">
          <span>{errorMessage}</span>
          {onClearError && (
            <button className="btn-close" onClick={onClearError} aria-label="Dismiss error">
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Backend Connection / Cold Start Wake Banner */}
      {!isConnected && (
        <div className="alert-banner alert-warning" role="status" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span className="status-dot connecting" style={{ flexShrink: 0 }}></span>
          <span>
            {isConnecting
              ? 'Connecting to game server... If waking from free-tier sleep, this may take 30–60 seconds.'
              : 'Disconnected from game server. Attempting to reconnect...'}
          </span>
        </div>
      )}

      {/* Main Join Card */}
      <div className="card landing-card">
        {/* Nickname Input */}
        <div className="form-group">
          <label className="form-label" htmlFor="player-nickname">
            Player Name
          </label>
          <input
            id="player-nickname"
            type="text"
            className="form-input"
            placeholder="Enter your name"
            value={playerName}
            maxLength={20}
            onChange={(e) => saveName(e.target.value)}
          />
        </div>

        {/* 1-Click Mandatory Public Matchmaking Button */}
        <button
          type="button"
          className="btn btn-primary btn-matchmake"
          disabled={!isConnected}
          onClick={handleJoinPublic}
        >
          <span>Join Public Game</span>
          <span className="btn-subtitle">Match into an open lobby instantly</span>
        </button>

        <div className="divider">
          <span>or create / join by code</span>
        </div>

        {/* Action Row: Create Room & Join by Code */}
        <div className="landing-actions-grid">
          {/* Create Custom Room Button */}
          <button
            type="button"
            className="btn btn-secondary btn-action"
            disabled={!isConnected}
            onClick={() => setShowCreateModal(true)}
          >
            <span>Create Room</span>
            <span className="btn-subtitle">Custom rules and visibility</span>
          </button>

          {/* Join by 6-Char Code Form */}
          <form className="join-code-form" onSubmit={handleJoinByCode}>
            <div className="input-group">
              <input
                type="text"
                className="form-input code-input"
                placeholder="ROOM CODE"
                maxLength={6}
                aria-label="Room Code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              />
              <button
                type="submit"
                className="btn btn-secondary btn-join"
                disabled={!isConnected || !roomCode.trim()}
              >
                Join
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2 className="modal-title">Room Settings</h2>
              <button className="btn-close" onClick={() => setShowCreateModal(false)} aria-label="Close dialog">
                Close
              </button>
            </div>

            <form onSubmit={handleCreateRoom}>
              {/* Room Visibility Toggle */}
              <div className="setting-row">
                <div>
                  <div className="setting-label">Visibility</div>
                  <div className="setting-desc">Public rooms accept matchmaking players</div>
                </div>
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn ${isPublicRoom ? 'active' : ''}`}
                    onClick={() => setIsPublicRoom(true)}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${!isPublicRoom ? 'active' : ''}`}
                    onClick={() => setIsPublicRoom(false)}
                  >
                    Private
                  </button>
                </div>
              </div>

              {/* Max Players Slider */}
              <div className="setting-row">
                <div>
                  <div className="setting-label">Players ({settings.maxPlayers})</div>
                  <div className="setting-desc">Range: 2 to 20 players</div>
                </div>
                <input
                  type="range"
                  className="range-slider"
                  min={SETTINGS_CONSTRAINTS.maxPlayers.min}
                  max={SETTINGS_CONSTRAINTS.maxPlayers.max}
                  value={settings.maxPlayers}
                  aria-label="Max players"
                  onChange={(e) => setSettings({ ...settings, maxPlayers: Number(e.target.value) })}
                />
              </div>

              {/* Rounds Slider */}
              <div className="setting-row">
                <div>
                  <div className="setting-label">Rounds ({settings.rounds})</div>
                  <div className="setting-desc">Range: 2 to 10 rounds</div>
                </div>
                <input
                  type="range"
                  className="range-slider"
                  min={SETTINGS_CONSTRAINTS.rounds.min}
                  max={SETTINGS_CONSTRAINTS.rounds.max}
                  value={settings.rounds}
                  aria-label="Rounds"
                  onChange={(e) => setSettings({ ...settings, rounds: Number(e.target.value) })}
                />
              </div>

              {/* Draw Time Slider */}
              <div className="setting-row">
                <div>
                  <div className="setting-label">Draw Time ({settings.drawTime}s)</div>
                  <div className="setting-desc">Range: 15 to 240 seconds</div>
                </div>
                <input
                  type="range"
                  className="range-slider"
                  min={SETTINGS_CONSTRAINTS.drawTime.min}
                  max={SETTINGS_CONSTRAINTS.drawTime.max}
                  step={5}
                  value={settings.drawTime}
                  aria-label="Draw time"
                  onChange={(e) => setSettings({ ...settings, drawTime: Number(e.target.value) })}
                />
              </div>

              {/* Word Count Slider */}
              <div className="setting-row">
                <div>
                  <div className="setting-label">Word Choices ({settings.wordCount})</div>
                  <div className="setting-desc">Range: 1 to 5 words</div>
                </div>
                <input
                  type="range"
                  className="range-slider"
                  min={SETTINGS_CONSTRAINTS.wordCount.min}
                  max={SETTINGS_CONSTRAINTS.wordCount.max}
                  value={settings.wordCount}
                  aria-label="Word choices"
                  onChange={(e) => setSettings({ ...settings, wordCount: Number(e.target.value) })}
                />
              </div>

              {/* Hints Slider */}
              <div className="setting-row">
                <div>
                  <div className="setting-label">Letter Hints ({settings.hints})</div>
                  <div className="setting-desc">Range: 0 to 5 hints</div>
                </div>
                <input
                  type="range"
                  className="range-slider"
                  min={SETTINGS_CONSTRAINTS.hints.min}
                  max={SETTINGS_CONSTRAINTS.hints.max}
                  value={settings.hints}
                  aria-label="Letter hints"
                  onChange={(e) => setSettings({ ...settings, hints: Number(e.target.value) })}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!isConnected}
                >
                  Create Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
