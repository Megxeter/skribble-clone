import React from 'react';
import { Socket } from 'socket.io-client';
import { SOCKET_EVENTS, ChooseWordPayload } from '@skribbl/shared';

interface WordSelectModalProps {
  socket: Socket | null;
  wordOptions: string[];
  remainingTime: number;
}

export const WordSelectModal: React.FC<WordSelectModalProps> = ({
  socket,
  wordOptions,
  remainingTime,
}) => {
  const handleSelectWord = (word: string) => {
    if (!socket) return;
    const payload: ChooseWordPayload = { word };
    socket.emit(SOCKET_EVENTS.CHOOSE_WORD, payload);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-content word-select-content">
        <div className="modal-header">
          <h2 className="modal-title">Select a Word</h2>
          <span className="selection-timer-badge">{remainingTime}s remaining</span>
        </div>
        <p className="word-select-desc">
          Choose a word to draw this round. If no selection is made, the first word is chosen automatically.
        </p>

        <div className="word-options-grid">
          {wordOptions.map((word) => (
            <button
              key={word}
              type="button"
              className="btn btn-primary word-option-btn"
              onClick={() => handleSelectWord(word)}
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
