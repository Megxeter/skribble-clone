import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  RoomStatePayload,
  RoomSettings,
  SETTINGS_CONSTRAINTS,
  UpdateSettingsPayload,
  SetReadyPayload,
  StartGamePayload
} from '@skribbl/shared';

interface LobbyProps {
  socket: Socket | null;
  roomState: RoomStatePayload;
  myId: string;
  onLeaveRoom: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  socket,
  roomState,
  myId,
  onLeaveRoom,
}) => {
  const isHost = roomState.hostId === myId;
  const myPlayer = roomState.players.find((p) => p.id === myId);
  const isReady = myPlayer?.isReady ?? false;

  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [showSettingsEdit, setShowSettingsEdit] = useState<boolean>(false);
  const [localSettings, setLocalSettings] = useState<RoomSettings>({ ...roomState.settings });

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomState.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}/?room=${roomState.code}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleToggleReady = () => {
    if (!socket) return;
    const payload: SetReadyPayload = {
      roomId: roomState.roomId,
      isReady: !isReady,
    };
    socket.emit(SOCKET_EVENTS.SET_READY, payload);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !isHost) return;
    const payload: UpdateSettingsPayload = {
      roomId: roomState.roomId,
      settings: { ...localSettings }
    };
    socket.emit(SOCKET_EVENTS.UPDATE_SETTINGS, payload);
    setShowSettingsEdit(false);
  };

  const handleStartGame = () => {
    if (!socket || !isHost) return;
    const payload: StartGamePayload = {
      roomId: roomState.roomId
    };
    socket.emit(SOCKET_EVENTS.START_GAME, payload);
  };

  const hasEnoughPlayers = roomState.players.length >= 2;

  return (
    <div className="lobby-container">
      {/* Top Header Card */}
      <div className="card lobby-header-card">
        <div className="lobby-header-top">
          <div className="lobby-code-section">
            <span className="room-label">Room Code</span>
            <span className="room-code-tag">{roomState.code}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleCopyCode}>
              {copiedCode ? 'Copied' : 'Copy Code'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleCopyLink}>
              {copiedLink ? 'Link Copied' : 'Copy Invite Link'}
            </button>
          </div>

          <div className="room-badges">
            <span className={`pill-badge ${roomState.isPublic ? 'badge-public' : 'badge-private'}`}>
              {roomState.isPublic ? 'Public Room' : 'Private Room'}
            </span>
            <span className="pill-badge badge-capacity">
              {roomState.players.length} / {roomState.settings.maxPlayers} Players
            </span>
          </div>
        </div>
      </div>

      {/* Strict 2-Player Warning Banner */}
      {!hasEnoughPlayers && (
        <div className="alert-banner alert-warning" role="alert">
          <span>At least 2 players are required to start the game. Share the code or invite link to begin.</span>
        </div>
      )}

      {/* Main Grid: Player Roster & Settings Panel */}
      <div className="lobby-grid">
        {/* Left: Player Roster Card */}
        <div className="card lobby-roster-card">
          <div className="card-title">
            <span>Players ({roomState.players.length})</span>
          </div>

          <div className="player-list">
            {roomState.players.map((player) => {
              const isMe = player.id === myId;
              const initial = player.name ? player.name.charAt(0).toUpperCase() : 'P';
              return (
                <div key={player.id} className={`player-card ${isMe ? 'is-me' : ''}`}>
                  <div className="player-avatar" aria-hidden="true">
                    {initial}
                  </div>
                  <div className="player-info">
                    <span className="player-name">
                      {player.name} {isMe && <span className="you-tag">(You)</span>}
                    </span>
                    <span className="player-role">
                      {player.isHost ? 'Room Host' : 'Player'}
                    </span>
                  </div>
                  <div className="player-status">
                    {player.isHost ? (
                      <span className="status-chip chip-host">Host</span>
                    ) : player.isReady ? (
                      <span className="status-chip chip-ready">Ready</span>
                    ) : (
                      <span className="status-chip chip-waiting">Waiting</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Settings & Actions Card */}
        <div className="card lobby-settings-card">
          <div className="card-title">
            <span>Game Settings</span>
            {isHost && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowSettingsEdit(!showSettingsEdit)}
              >
                {showSettingsEdit ? 'Cancel' : 'Edit Settings'}
              </button>
            )}
          </div>

          {!showSettingsEdit ? (
            <div className="settings-summary-grid">
              <div className="setting-chip">
                <span className="chip-label">Rounds</span>
                <span className="chip-value">{roomState.settings.rounds}</span>
              </div>
              <div className="setting-chip">
                <span className="chip-label">Draw Time</span>
                <span className="chip-value">{roomState.settings.drawTime}s</span>
              </div>
              <div className="setting-chip">
                <span className="chip-label">Word Choices</span>
                <span className="chip-value">{roomState.settings.wordCount}</span>
              </div>
              <div className="setting-chip">
                <span className="chip-label">Letter Hints</span>
                <span className="chip-value">{roomState.settings.hints}</span>
              </div>
              <div className="setting-chip">
                <span className="chip-label">Max Players</span>
                <span className="chip-value">{roomState.settings.maxPlayers}</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveSettings} className="settings-edit-form">
              <div className="setting-row">
                <label className="setting-label">Rounds ({localSettings.rounds})</label>
                <input
                  type="range"
                  className="range-slider"
                  min={SETTINGS_CONSTRAINTS.rounds.min}
                  max={SETTINGS_CONSTRAINTS.rounds.max}
                  value={localSettings.rounds}
                  aria-label="Rounds"
                  onChange={(e) => setLocalSettings({ ...localSettings, rounds: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label className="setting-label">Draw Time ({localSettings.drawTime}s)</label>
                <input
                  type="range"
                  className="range-slider"
                  min={SETTINGS_CONSTRAINTS.drawTime.min}
                  max={SETTINGS_CONSTRAINTS.drawTime.max}
                  step={5}
                  value={localSettings.drawTime}
                  aria-label="Draw time"
                  onChange={(e) => setLocalSettings({ ...localSettings, drawTime: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label className="setting-label">Word Choices ({localSettings.wordCount})</label>
                <input
                  type="range"
                  className="range-slider"
                  min={SETTINGS_CONSTRAINTS.wordCount.min}
                  max={SETTINGS_CONSTRAINTS.wordCount.max}
                  value={localSettings.wordCount}
                  aria-label="Word choices"
                  onChange={(e) => setLocalSettings({ ...localSettings, wordCount: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label className="setting-label">Letter Hints ({localSettings.hints})</label>
                <input
                  type="range"
                  className="range-slider"
                  min={SETTINGS_CONSTRAINTS.hints.min}
                  max={SETTINGS_CONSTRAINTS.hints.max}
                  value={localSettings.hints}
                  aria-label="Letter hints"
                  onChange={(e) => setLocalSettings({ ...localSettings, hints: Number(e.target.value) })}
                />
              </div>

              <div className="setting-row">
                <label className="setting-label">Max Players ({localSettings.maxPlayers})</label>
                <input
                  type="range"
                  className="range-slider"
                  min={SETTINGS_CONSTRAINTS.maxPlayers.min}
                  max={SETTINGS_CONSTRAINTS.maxPlayers.max}
                  value={localSettings.maxPlayers}
                  aria-label="Max players"
                  onChange={(e) => setLocalSettings({ ...localSettings, maxPlayers: Number(e.target.value) })}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-sm" style={{ width: '100%' }}>
                Save Settings
              </button>
            </form>
          )}

          {/* Lobby Footer Actions */}
          <div className="lobby-actions-footer">
            {!isHost ? (
              <button
                type="button"
                className={`btn ${isReady ? 'btn-secondary' : 'btn-primary'} btn-full`}
                onClick={handleToggleReady}
              >
                {isReady ? 'Cancel Ready' : 'Ready'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-full btn-start-game"
                disabled={!hasEnoughPlayers}
                onClick={handleStartGame}
              >
                {hasEnoughPlayers ? 'Start Game' : 'Waiting for Players (Min 2)'}
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-full btn-leave"
              onClick={onLeaveRoom}
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
