import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from './hooks/useSocket';
import {
  SOCKET_EVENTS,
  RoomStatePayload,
  ErrorPayload,
  LeaveRoomPayload,
  HealthResponse,
} from '@skribbl/shared';
import { Landing } from './components/Landing';
import { Lobby } from './components/Lobby';
import { GameView } from './components/GameView';

export const App: React.FC = () => {
  const { socket, isConnected, socketId, transport } = useSocket();

  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [initialRoomCode, setInitialRoomCode] = useState<string>('');
  const [showSystemInfo, setShowSystemInfo] = useState<boolean>(false);
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);

  // Check URL query param for direct invite link (?room=CODE)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
      setInitialRoomCode(code.toUpperCase());
    }
  }, []);

  // Socket event listeners for Room Management
  useEffect(() => {
    if (!socket) return;

    const handleRoomState = (state: RoomStatePayload) => {
      setRoomState(state);
      setErrorMessage(null);

      // Keep URL synced with current room code
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.get('room') !== state.code) {
        currentUrl.searchParams.set('room', state.code);
        window.history.replaceState({}, '', currentUrl.toString());
      }
    };

    const handleError = (error: ErrorPayload) => {
      setErrorMessage(error.message);
    };

    socket.on(SOCKET_EVENTS.ROOM_STATE, handleRoomState);
    socket.on(SOCKET_EVENTS.ERROR_MESSAGE, handleError);

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_STATE, handleRoomState);
      socket.off(SOCKET_EVENTS.ERROR_MESSAGE, handleError);
    };
  }, [socket]);

  // Handle leaving the current room
  const handleLeaveRoom = useCallback(() => {
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
      const res = await fetch('/health');
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
      {/* Dynamic Screen Routing: Landing vs Lobby vs In-Game */}
      {!roomState ? (
        <Landing
          socket={socket}
          isConnected={isConnected}
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
        />
      ) : (
        <GameView
          socket={socket}
          myId={socketId || ''}
          roomState={roomState}
          onLeaveRoom={handleLeaveRoom}
        />
      )}

      {/* Understated Diagnostic Footer */}
      <footer className="footer-system">
        <div className="footer-bar">
          <div className="footer-status">
            <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
            <span>{isConnected ? `Connected (${transport})` : 'Disconnected'}</span>
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
