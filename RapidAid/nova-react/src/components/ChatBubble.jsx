import React from 'react';

export default function ChatBubble({ role, text, timestamp }) {
  const isNova = role === 'nova';

  return (
    <div className={`message-bubble-wrapper ${isNova ? 'nova' : 'user'}`}>
      <div className={`avatar-box ${isNova ? 'nova' : 'user'}`}>
        {isNova ? '🤖' : '🧑'}
      </div>
      <div className="bubble-content-box">
        <div className="bubble-text">{text}</div>
        <div className="bubble-time">{timestamp}</div>
      </div>
    </div>
  );
}
