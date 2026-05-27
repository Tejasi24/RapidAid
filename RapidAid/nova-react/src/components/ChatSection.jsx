import React, { useEffect, useRef } from 'react';
import ChatBubble from './ChatBubble';

export default function ChatSection({ messages, state, onExitSession }) {
  const scrollRef = useRef(null);

  // Automatically scroll to the bottom when messages or states change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, state]);

  return (
    <div className="chat-section">
      <div className="chat-header">
        <h2 className="chat-header-title">
          <span>🚨</span> LIVE CONVERSATION
        </h2>
        <span className="chat-header-sub">Emergency Session</span>
      </div>

      <div className="messages-list" ref={scrollRef}>
        {messages.map((msg, idx) => (
          <ChatBubble
            key={idx}
            role={msg.role}
            text={msg.text}
            timestamp={msg.timestamp}
          />
        ))}

        {/* Dynamic Speaking / Thinking indicators */}
        {state === 'thinking' && (
          <div className="message-bubble-wrapper nova">
            <div className="avatar-box nova">🤖</div>
            <div className="bubble-content-box">
              <div className="bubble-text" style={{ display: 'flex', alignItems: 'center', minWidth: '80px', padding: '12px 14px' }}>
                <span className="dot-flashing" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-footer">
        <div className="speaking-indicator-container">
          {state === 'speaking' && (
            <>
              <span className="dot-flashing" />
              <span className="nova-speaking-indicator-text">Nova is speaking...</span>
            </>
          )}
          {state === 'listening' && (
            <>
              <span className="dot-flashing" style={{ backgroundColor: '#EF4444' }} />
              <span className="nova-speaking-indicator-text" style={{ color: '#EF4444' }}>Listening...</span>
            </>
          )}
          {state === 'idle' && (
            <span className="nova-speaking-indicator-text" style={{ opacity: 0.6, fontSize: '12px' }}>
              Hold and speak to continue
            </span>
          )}
        </div>

        <button className="exit-btn" onClick={onExitSession}>
          Exit Emergency
        </button>
      </div>
    </div>
  );
}
