import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../config';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectionStatus: ConnectionStatus;
  socketId: string | null;
  transport: string;
  connectError: string | null;
}

export function useSocket(): UseSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [socketId, setSocketId] = useState<string | null>(null);
  const [transport, setTransport] = useState<string>('N/A');
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    // When BACKEND_URL is configured (e.g. Vercel pointing to Render), connect to the external origin.
    // When unset, connect without URL to use the current window origin / local Vite dev proxy.
    const socketOptions = {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep retrying while Render free backend wakes up
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    };

    const socketInstance: Socket = BACKEND_URL
      ? io(BACKEND_URL, socketOptions)
      : io(socketOptions);

    socketInstance.on('connect', () => {
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionStatus('connected');
      setSocketId(socketInstance.id ?? null);
      setConnectError(null);
      if (socketInstance.io.engine) {
        setTransport(socketInstance.io.engine.transport.name);
        socketInstance.io.engine.on('upgrade', (rawTransport) => {
          setTransport(rawTransport.name);
        });
      }
    });

    socketInstance.on('disconnect', (reason) => {
      setIsConnected(false);
      setIsConnecting(true);
      setConnectionStatus('connecting');
      setSocketId(null);
      console.log(`[Socket] Disconnected: ${reason}`);
      if (reason === 'io server disconnect') {
        // Explicitly reconnect if disconnected by the server
        socketInstance.connect();
      }
    });

    socketInstance.on('connect_error', (error) => {
      setIsConnected(false);
      setIsConnecting(true);
      setConnectionStatus('connecting');
      setConnectError(error.message);
      console.warn(`[Socket] Connection error: ${error.message}`);
    });

    socketInstance.io.on('reconnect_attempt', () => {
      setIsConnecting(true);
      setConnectionStatus('connecting');
    });

    socketInstance.io.on('reconnect', () => {
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionStatus('connected');
      setConnectError(null);
    });

    socketInstance.io.on('reconnect_failed', () => {
      setIsConnecting(false);
      setConnectionStatus('disconnected');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return {
    socket,
    isConnected,
    isConnecting,
    connectionStatus,
    socketId,
    transport,
    connectError,
  };
}
