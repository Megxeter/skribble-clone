import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  socketId: string | null;
  transport: string;
  connectError: string | null;
}

export function useSocket(): UseSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [transport, setTransport] = useState<string>('N/A');
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    // When served statically in prod or proxied in dev, connecting to current origin or root / works
    const socketInstance: Socket = io({
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
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
      setSocketId(null);
      console.log(`[Socket] Disconnected: ${reason}`);
    });

    socketInstance.on('connect_error', (error) => {
      setConnectError(error.message);
      console.warn(`[Socket] Connection error: ${error.message}`);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return { socket, isConnected, socketId, transport, connectError };
}
