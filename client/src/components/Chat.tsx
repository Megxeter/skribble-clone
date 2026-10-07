import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { SOCKET_EVENTS, ChatMessagePayload, ChatInputPayload } from '@skribbl/shared';

interface ChatProps {
  socket: Socket | null;
  myId: string;
  hasGuessed?: boolean;
  isDrawer?: boolean;
}

interface DisplayMessage extends ChatMessagePayload {
  id: string;
  timestamp: number;
}

export const Chat: React.FC<ChatProps> = ({
  socket,
  myId,
  hasGuessed = false,
  isDrawer = false,
}) => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputVal, setInputVal] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (msg: ChatMessagePayload) => {
      setMessages((prev) => [
        ...prev,
        {
          ...msg,
          id: `${Date.now()}_${Math.random()}`,
          timestamp: Date.now(),
        },
      ]);
    };

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);

    return () => {
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
    };
  }, [socket]);

  // Auto-scroll chat log to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || isDrawer) return;
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    const payload: ChatInputPayload = { text: trimmed };
    socket.emit(SOCKET_EVENTS.CHAT_INPUT, payload);
    setInputVal('');
  };

  const getPlaceholder = () => {
    if (isDrawer) {
      return 'You are drawing. Chatting is disabled.';
    }
    if (hasGuessed) {
      return 'You guessed the word! Chat here...';
    }
    return 'Type your guess here...';
  };

  return (
    <div className="card chat-card">
      <div className="card-title chat-header">
        <span>Chat &amp; Guesses</span>
      </div>

      <div className="chat-messages-container" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <span>No messages yet. Start guessing or chat below.</span>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === myId;
            if (m.type === 'system') {
              return (
                <div key={m.id} className="chat-msg chat-msg-system">
                  <span className="chat-system-text">{m.text}</span>
                </div>
              );
            }
            if (m.type === 'close') {
              return (
                <div key={m.id} className="chat-msg chat-msg-close">
                  <span className="chat-close-text">{m.text}</span>
                </div>
              );
            }
            return (
              <div key={m.id} className={`chat-msg ${isMe ? 'chat-msg-me' : ''}`}>
                <span className="chat-sender">{m.senderName}:</span>
                <span className="chat-body">{m.text}</span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSend}>
        <input
          type="text"
          className="form-input chat-input"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder={getPlaceholder()}
          maxLength={200}
          disabled={isDrawer}
          aria-label="Guess or chat message"
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm chat-send-btn"
          disabled={isDrawer || !inputVal.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
};
