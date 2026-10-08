import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from './hooks/useSocket';
import {
  SOCKET_EVENTS,
  RoomStatePayload,
  PlayerJoinedPayload,
  ErrorPayload,
  LeaveRoomPayload,
  HealthResponse,
  RoundStartPayload,
  GameStatePayload,
} from '@skribbl/shared';
import { Landing } from './components/Landing';
import { Lobby } from './components/Lobby';
import { GameView } from './components/GameView';
import {
  playJoinSound,
  getSoundEnabled,
  setSoundEnabled,
  setupAudioUnlockListeners,
} from './utils/sound';
import { BACKEND_URL } from './config';

export const App: React.FC = () => {
  const { socket, isConnected, isConnecting, socketId, transport } = useSocket();

  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [roundStartData, setRoundStartData] = useState<RoundStartPayload | null>(null);
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [initialRoomCode, setInitialRoomCode] = useState<string>('');
  const [showSystemInfo, setShowSystemInfo] = useState<boolean>(false);
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);

  // Sound preference and visual toast notification
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(getSoundEnabled);
  const [joinToast, setJoinToast] = useState<string | null>(null);
  const knownPlayerIdsRef = useRef<Set<string>>(new Set());

  // Setup browser autoplay gesture unlock listeners on mount
  useEffect(() => {
    setupAudioUnlockListeners();
  }, []);

  const handleToggleSound = useCallback(() => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      setSoundEnabled(next);
      return next;
    });
  }, []);

  // Check URL query param for direct invite link (?room=CODE)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
      setInitialRoomCode(code.toUpperCase());
    }
  }, []);

  // Auto-dismiss join toast
  useEffect(() => {
    if (!joinToast) return;
    const timer = setTimeout(() => {
      setJoinToast(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [joinToast]);

  // Socket event listeners for Room Management & Player Joins
  useEffect(() => {
    if (!socket) return;

    const handleRoomState = (state: RoomStatePayload) => {
      // If entering a new room session, record known players without playing sound
      if (!roomState || roomState.roomId !== state.roomId) {
        knownPlayerIdsRef.current = new Set(state.players.map((p) => p.id));
      }
      if (state.status === 'lobby') {
        setRoundStartData(null);
        setGameState(null);
      }
      setRoomState(state);
      setErrorMessage(null);

      // Keep URL synced with current room code
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.get('room') !== state.code) {
        currentUrl.searchParams.set('room', state.code);
        window.history.replaceState({}, '', currentUrl.toString());
      }
    };

    const handleRoundStart = (payload: RoundStartPayload) => {
      setRoundStartData(payload);
    };

    const handleGameState = (state: GameStatePayload) => {
      setGameState(state);
    };

    const handlePlayerJoined = (payload: PlayerJoinedPayload) => {
      const newPlayer = payload.player;
      if (!newPlayer || newPlayer.id === socketId) return;

      // Avoid replaying if player ID was already known in this session
      if (knownPlayerIdsRef.current.has(newPlayer.id)) return;
      knownPlayerIdsRef.current.add(newPlayer.id);

      // Play audio tone once
      playJoinSound();

      // Show temporary visual join notification
      setJoinToast(`${newPlayer.name} joined the room`);
    };

    const handleError = (error: ErrorPayload) => {
      setErrorMessage(error.message);
    };

    socket.on(SOCKET_EVENTS.ROOM_STATE, handleRoomState);
    socket.on(SOCKET_EVENTS.ROUND_START, handleRoundStart);
    socket.on(SOCKET_EVENTS.GAME_STATE, handleGameState);
    socket.on(SOCKET_EVENTS.PLAYER_JOINED, handlePlayerJoined);
    socket.on(SOCKET_EVENTS.ERROR_MESSAGE, handleError);

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_STATE, handleRoomState);
      socket.off(SOCKET_EVENTS.ROUND_START, handleRoundStart);
      socket.off(SOCKET_EVENTS.GAME_STATE, handleGameState);
      socket.off(SOCKET_EVENTS.PLAYER_JOINED, handlePlayerJoined);
      socket.off(SOCKET_EVENTS.ERROR_MESSAGE, handleError);
    };
  }, [socket, roomState, socketId]);

  // Handle leaving the current room
  const handleLeaveRoom = useCallback(() => {
    knownPlayerIdsRef.current.clear();
    setJoinToast(null);
    setRoundStartData(null);
    setGameState(null);
    if (socket && roomState) {
      const payload: LeaveRoomPayload = { roomId: roomState.roomId };
      socket.emit(SOCKET_EVENTS.LEAVE_ROOM, payload);
    }
    setRoomState(null);
    setErrorMessage(null);

    // Clean up room query param
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('room');
    window.history.replaceState({}, '', cleanUrl.pathname);
  }, [socket, roomState]);

  // Fetch server health on demand
  const fetchHealth = async () => {
    try {
      const endpoint = BACKEND_URL ? `${BACKEND_URL}/health` : '/health';
      const res = await fetch(endpoint);
      if (res.ok) {
        const data: HealthResponse = await res.json();
        setHealthData(data);
      }
    } catch {
      // Ignored for background ping
    }
  };

  useEffect(() => {
    if (showSystemInfo && !healthData) {
      fetchHealth();
    }
  }, [showSystemInfo, healthData]);

  return (
    <div className="container">
      {/* Toast Notification for Player Joins */}
      <div className="toast-container" aria-live="polite">
        {joinToast && (
          <div className="toast-join" role="status">
            <span>{joinToast}</span>
          </div>
        )}
      </div>

      {/* Dynamic Screen Routing: Landing vs Lobby vs In-Game */}
      {!roomState ? (
        <Landing
          socket={socket}
          isConnected={isConnected}
          isConnecting={isConnecting}
          initialRoomCode={initialRoomCode}
          errorMessage={errorMessage}
          onClearError={() => setErrorMessage(null)}
        />
      ) : roomState.status === 'lobby' ? (
        <Lobby
          socket={socket}
          roomState={roomState}
          myId={socketId || ''}
          onLeaveRoom={handleLeaveRoom}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
        />
      ) : (
        <GameView
          socket={socket}
          myId={socketId || ''}
          roomState={roomState}
          onLeaveRoom={handleLeaveRoom}
          initialRoundStartData={roundStartData}
          initialGameState={gameState}
        />
      )}

      {/* Understated Diagnostic Footer */}
      <footer className="footer-system">
        <div className="footer-bar">
          <div className="footer-status">
            <span className={`status-dot ${isConnected ? 'online' : isConnecting ? 'connecting' : 'offline'}`}></span>
            <span>
              {isConnected
                ? `Connected (${transport})`
                : isConnecting
                ? 'Connecting to server (waking backend)...'
                : 'Disconnected'}
            </span>
            <button
              type="button"
              className="footer-sound-toggle-btn"
              onClick={handleToggleSound}
              aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
              aria-pressed={soundEnabled}
            >
              Sound: {soundEnabled ? 'On' : 'Off'}
            </button>
          </div>
          <button
            type="button"
            className="footer-toggle-btn"
            onClick={() => setShowSystemInfo(!showSystemInfo)}
          >
            {showSystemInfo ? 'Hide System Diagnostics' : 'System Diagnostics'}
          </button>
        </div>

        {showSystemInfo && (
          <div className="card system-diagnostic-card">
            <div className="card-title">
              <span>Gateway and Server Status</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={fetchHealth}
              >
                Refresh
              </button>
            </div>
            <div className="info-grid">
              <div className="info-item">
                <div className="info-label">Socket ID</div>
                <div className="info-value">{socketId || 'None'}</div>
              </div>
              <div className="info-item">
                <div className="info-label">Transport</div>
                <div className="info-value">{transport}</div>
              </div>
              <div className="info-item">
                <div className="info-label">Server Health</div>
                <div className="info-value">{healthData?.status || 'Unknown'}</div>
              </div>
              <div className="info-item">
                <div className="info-label">Server Uptime</div>
                <div className="info-value">
                  {healthData?.uptime ? `${Math.floor(healthData.uptime)}s` : 'Unknown'}
                </div>
              </div>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
};

export default App;
