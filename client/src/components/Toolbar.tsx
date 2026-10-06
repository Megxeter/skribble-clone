import React from 'react';
import { Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@skribbl/shared';

interface ToolbarProps {
  socket: Socket | null;
  currentColor: string;
  onSelectColor: (color: string) => void;
  currentSize: number;
  onSelectSize: (size: number) => void;
  isEraser: boolean;
  onToggleEraser: (isEraser: boolean) => void;
  disabled?: boolean;
}

const PALETTE_COLORS = [
  '#000000', '#4b5563', '#9ca3af', '#ffffff',
  '#ef4444', '#991b1b', '#f97316', '#f59e0b',
  '#eab308', '#84cc16', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#a855f7',
];

const BRUSH_SIZES = [
  { size: 3, label: 'Fine' },
  { size: 8, label: 'Medium' },
  { size: 16, label: 'Thick' },
  { size: 30, label: 'Broad' },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  socket,
  currentColor,
  onSelectColor,
  currentSize,
  onSelectSize,
  isEraser,
  onToggleEraser,
  disabled = false,
}) => {
  const handleUndo = () => {
    if (!socket || disabled) return;
    socket.emit(SOCKET_EVENTS.DRAW_UNDO, {});
  };

  const handleClear = () => {
    if (!socket || disabled) return;
    socket.emit(SOCKET_EVENTS.CANVAS_CLEAR, {});
  };

  return (
    <div className={`canvas-toolbar ${disabled ? 'toolbar-disabled' : ''}`}>
      {/* Palette Colors */}
      <div className="toolbar-section">
        <span className="toolbar-label">Color</span>
        <div className="color-palette-grid">
          {PALETTE_COLORS.map((col) => {
            const isSelected = !isEraser && currentColor.toLowerCase() === col.toLowerCase();
            return (
              <button
                key={col}
                type="button"
                className={`color-swatch ${isSelected ? 'selected' : ''}`}
                style={{ backgroundColor: col }}
                onClick={() => {
                  onToggleEraser(false);
                  onSelectColor(col);
                }}
                aria-label={`Select color ${col}`}
                disabled={disabled}
              />
            );
          })}
        </div>
      </div>

      {/* Brush Sizes */}
      <div className="toolbar-section">
        <span className="toolbar-label">Size</span>
        <div className="size-selector-group">
          {BRUSH_SIZES.map((item) => {
            const isSelected = currentSize === item.size;
            return (
              <button
                key={item.size}
                type="button"
                className={`btn btn-secondary btn-sm size-btn ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectSize(item.size)}
                disabled={disabled}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Tools: Eraser, Undo, Clear */}
      <div className="toolbar-section toolbar-actions-section">
        <span className="toolbar-label">Tools</span>
        <div className="tool-actions-group">
          <button
            type="button"
            className={`btn btn-secondary btn-sm tool-btn ${isEraser ? 'active' : ''}`}
            onClick={() => onToggleEraser(!isEraser)}
            disabled={disabled}
          >
            {isEraser ? 'Brush Mode' : 'Eraser'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm tool-btn"
            onClick={handleUndo}
            disabled={disabled}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm tool-btn"
            onClick={handleClear}
            disabled={disabled}
          >
            Clear Canvas
          </button>
        </div>
      </div>
    </div>
  );
};
