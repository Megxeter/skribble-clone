import React, { useRef, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  DrawStartPayload,
  DrawMovePayload,
  DrawFillPayload,
  DrawSyncPayload,
  Stroke
} from '@skribbl/shared';
import { getNormalizedCoordinates, getCanvasCoordinates } from '../utils/coordinates';
import { floodFill } from '../utils/floodFill';

interface CanvasProps {
  socket: Socket | null;
  isDrawer: boolean;
  currentColor: string;
  currentSize: number;
  activeTool?: 'brush' | 'fill' | 'eraser';
  disabled?: boolean;
}

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

export const Canvas: React.FC<CanvasProps> = ({
  socket,
  isDrawer,
  currentColor,
  currentSize,
  activeTool = 'brush',
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const remoteLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const remoteStrokeStyleRef = useRef<{ color: string; size: number }>({ color: '#000000', size: 4 });

  // Clear canvas utility (pure white background)
  const clearLocalCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, []);

  // Initialize canvas on mount
  useEffect(() => {
    clearLocalCanvas();
  }, [clearLocalCanvas]);

  // Render a full stroke and fill array
  const renderStrokes = useCallback((strokes: Stroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokes) {
      if (stroke.type === 'fill' && stroke.x !== undefined && stroke.y !== undefined) {
        const pt = getCanvasCoordinates({ x: stroke.x, y: stroke.y }, CANVAS_WIDTH, CANVAS_HEIGHT);
        floodFill(ctx, pt.x, pt.y, stroke.color, CANVAS_WIDTH, CANVAS_HEIGHT);
        continue;
      }

      if (!stroke.points || stroke.points.length === 0) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();

      const start = getCanvasCoordinates(stroke.points[0], CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.moveTo(start.x, start.y);

      if (stroke.points.length === 1) {
        ctx.lineTo(start.x + 0.1, start.y + 0.1);
        ctx.stroke();
        continue;
      }

      for (let i = 1; i < stroke.points.length; i++) {
        const pt = getCanvasCoordinates(stroke.points[i], CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }
  }, []);

  // Setup Socket.IO remote drawing listeners
  useEffect(() => {
    if (!socket) return;

    const handleRemoteDrawStart = (payload: DrawStartPayload) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const pt = getCanvasCoordinates({ x: payload.x, y: payload.y }, CANVAS_WIDTH, CANVAS_HEIGHT);
      remoteLastPointRef.current = pt;
      remoteStrokeStyleRef.current = { color: payload.color, size: payload.size };

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = payload.color;
      ctx.lineWidth = payload.size;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
    };

    const handleRemoteDrawMove = (payload: DrawMovePayload) => {
      const canvas = canvasRef.current;
      if (!canvas || !remoteLastPointRef.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const pt = getCanvasCoordinates({ x: payload.x, y: payload.y }, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      remoteLastPointRef.current = pt;
    };

    const handleRemoteDrawEnd = () => {
      remoteLastPointRef.current = null;
    };

    const handleRemoteFill = (payload: DrawFillPayload) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const pt = getCanvasCoordinates({ x: payload.x, y: payload.y }, CANVAS_WIDTH, CANVAS_HEIGHT);
      floodFill(ctx, pt.x, pt.y, payload.color, CANVAS_WIDTH, CANVAS_HEIGHT);
    };

    const handleRemoteClear = () => {
      clearLocalCanvas();
    };

    const handleRemoteSync = (payload: DrawSyncPayload) => {
      renderStrokes(payload.strokes);
    };

    socket.on(SOCKET_EVENTS.DRAW_START, handleRemoteDrawStart);
    socket.on(SOCKET_EVENTS.DRAW_MOVE, handleRemoteDrawMove);
    socket.on(SOCKET_EVENTS.DRAW_END, handleRemoteDrawEnd);
    socket.on(SOCKET_EVENTS.DRAW_FILL, handleRemoteFill);
    socket.on(SOCKET_EVENTS.CANVAS_CLEAR, handleRemoteClear);
    socket.on(SOCKET_EVENTS.DRAW_SYNC, handleRemoteSync);

    return () => {
      socket.off(SOCKET_EVENTS.DRAW_START, handleRemoteDrawStart);
      socket.off(SOCKET_EVENTS.DRAW_MOVE, handleRemoteDrawMove);
      socket.off(SOCKET_EVENTS.DRAW_END, handleRemoteDrawEnd);
      socket.off(SOCKET_EVENTS.DRAW_FILL, handleRemoteFill);
      socket.off(SOCKET_EVENTS.CANVAS_CLEAR, handleRemoteClear);
      socket.off(SOCKET_EVENTS.DRAW_SYNC, handleRemoteSync);
    };
  }, [socket, clearLocalCanvas, renderStrokes]);

  // Local drawer mouse/touch handlers
  const startDrawing = (clientX: number, clientY: number) => {
    if (!isDrawer || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (activeTool === 'fill') {
      const norm = getNormalizedCoordinates({ clientX, clientY } as MouseEvent, canvas);
      const canvasPt = getCanvasCoordinates(norm, CANVAS_WIDTH, CANVAS_HEIGHT);
      const filled = floodFill(ctx, canvasPt.x, canvasPt.y, currentColor, CANVAS_WIDTH, CANVAS_HEIGHT);
      if (filled && socket) {
        const payload: DrawFillPayload = {
          x: norm.x,
          y: norm.y,
          color: currentColor,
        };
        socket.emit(SOCKET_EVENTS.DRAW_FILL, payload);
      }
      return;
    }

    isDrawingRef.current = true;
    const norm = getNormalizedCoordinates({ clientX, clientY } as MouseEvent, canvas);
    const canvasPt = getCanvasCoordinates(norm, CANVAS_WIDTH, CANVAS_HEIGHT);
    lastPointRef.current = canvasPt;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentSize;
    ctx.beginPath();
    ctx.moveTo(canvasPt.x, canvasPt.y);
    // Draw a single dot if clicked without moving
    ctx.lineTo(canvasPt.x + 0.1, canvasPt.y + 0.1);
    ctx.stroke();

    if (socket) {
      const payload: DrawStartPayload = {
        x: norm.x,
        y: norm.y,
        color: currentColor,
        size: currentSize,
      };
      socket.emit(SOCKET_EVENTS.DRAW_START, payload);
    }
  };

  const drawMove = (clientX: number, clientY: number) => {
    if (!isDrawer || disabled || !isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const norm = getNormalizedCoordinates({ clientX, clientY } as MouseEvent, canvas);
    const canvasPt = getCanvasCoordinates(norm, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.lineTo(canvasPt.x, canvasPt.y);
    ctx.stroke();
    lastPointRef.current = canvasPt;

    if (socket) {
      const payload: DrawMovePayload = {
        x: norm.x,
        y: norm.y,
      };
      socket.emit(SOCKET_EVENTS.DRAW_MOVE, payload);
    }
  };

  const endDrawing = () => {
    if (!isDrawer || disabled || !isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;

    if (socket) {
      socket.emit(SOCKET_EVENTS.DRAW_END, {});
    }
  };

  return (
    <div className="canvas-wrapper">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className={`drawing-canvas ${
          !isDrawer || disabled
            ? 'cursor-disabled'
            : activeTool === 'fill'
            ? 'cursor-fill'
            : 'cursor-draw'
        }`}
        onMouseDown={(e) => startDrawing(e.clientX, e.clientY)}
        onMouseMove={(e) => drawMove(e.clientX, e.clientY)}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={(e) => {
          if (e.touches.length > 0) {
            e.preventDefault();
            startDrawing(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length > 0) {
            e.preventDefault();
            drawMove(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          endDrawing();
        }}
      />
    </div>
  );
};
