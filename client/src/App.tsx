import React, { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { HealthResponse } from '@skribbl/shared';

export const App: React.FC = () => {
  const { isConnected, socketId, transport, connectError } = useSocket();
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch('/health');
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data: HealthResponse = await res.json();
      setHealthData(data);
    } catch (err: unknown) {
      setHealthError(err instanceof Error ? err.message : 'Failed to reach health endpoint');
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="container">
      {/* Brand Header */}
      <header className="header">
        <div className="logo-badge">
          <span style={{ fontSize: '1.75rem' }}>🎨</span>
          <h1 className="logo-title">skribbl.io</h1>
        </div>
        <p className="tagline">Multiplayer Drawing & Guessing Game</p>
      </header>

      {/* Real-Time WebSocket Connection Indicator */}
      <section className="card">
        <div className="card-title">
          <span>Real-Time WebSocket Gateway</span>
          <div className={`status-pill ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            <span>{isConnected ? 'ONLINE / CONNECTED' : 'DISCONNECTED'}</span>
          </div>
        </div>

        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', fontSize: '0.95rem' }}>
          Real-time bi-directional connection between React 19 and the unified Express Socket.IO server.
        </p>

        <div className="info-grid">
          <div className="info-item">
            <div className="info-label">Socket ID</div>
            <div className="info-value">{socketId || (isConnected ? 'Assigning...' : 'None')}</div>
          </div>
          <div className="info-item">
            <div className="info-label">Transport Protocol</div>
            <div className="info-value">{transport}</div>
          </div>
          <div className="info-item">
            <div className="info-label">Connection Status</div>
            <div className="info-value" style={{ color: isConnected ? '#34d399' : '#f87171' }}>
              {isConnected ? 'Socket.IO Active' : (connectError ? `Error: ${connectError}` : 'Connecting...')}
            </div>
          </div>
        </div>
      </section>

      {/* Authoritative Healthcheck & Production Endpoint */}
      <section className="card">
        <div className="card-title">
          <span>Unified Server Health (GET /health)</span>
          <button
            className="btn btn-secondary"
            onClick={fetchHealth}
            disabled={healthLoading}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}
          >
            {healthLoading ? 'Checking...' : '🔄 Refresh Ping'}
          </button>
        </div>

        <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
          Server-authoritative health check probe used for Render deployment and container liveness monitoring.
        </p>

        {healthError && (
          <div style={{ color: 'var(--color-danger)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            ⚠️ Healthcheck error: {healthError}
          </div>
        )}

        {healthData && (
          <div className="health-box">
            <pre>{JSON.stringify(healthData, null, 2)}</pre>
          </div>
        )}
      </section>

      {/* Milestone 1 Status Overview */}
      <section className="card">
        <span className="milestone-badge">Milestone 1 Completed</span>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem', fontFamily: 'var(--font-display)' }}>
          Project Scaffolding & Unified Server
        </h2>
        <ul style={{ paddingLeft: '1.25rem', color: 'var(--color-text-muted)', lineHeight: '1.7', fontSize: '0.92rem' }}>
          <li>
            <strong style={{ color: 'var(--color-text)' }}>Story 1 (Monorepo Scaffold):</strong> Root, client, server, and shared package architecture with unified TypeScript configurations.
          </li>
          <li>
            <strong style={{ color: 'var(--color-text)' }}>Story 2 (Unified Server):</strong> Express 4+ serves the compiled Vite client bundle statically while Socket.IO handles WebSocket events on the shared port.
          </li>
          <li>
            <strong style={{ color: 'var(--color-text)' }}>Shared Contracts:</strong> Cleanly imported types (<code style={{ color: '#38bdf8' }}>@skribbl/shared</code>) without path resolution issues.
          </li>
          <li>
            <strong style={{ color: 'var(--color-text)' }}>Ready for Milestone 2:</strong> Next up — Room Engine, Mandatory Public Matchmaking, and Lobby UI.
          </li>
        </ul>
      </section>
    </div>
  );
};

export default App;
