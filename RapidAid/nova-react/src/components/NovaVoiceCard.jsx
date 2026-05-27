import React from 'react';

export default function NovaVoiceCard({
  state,
  onMouseDown,
  onMouseUp,
  onTouchStart,
  onTouchEnd,
  isActivated,
  holdProgress = 0,
  isHolding = false,
  onToggleMute
}) {
  // SVG progress ring calculations
  // Radius = 120, Circumference = 2 * PI * R ≈ 754
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (holdProgress / 100) * circumference;

  if (!isActivated) {
    return (
      <div className="nova-unactivated-panel">
        <div
          className={`nova-orb-trigger ${isHolding ? 'holding' : ''}`}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <svg className="progress-ring-svg" viewBox="0 0 250 250">
            <circle
              className="progress-ring-circle"
              stroke="#EF4444"
              strokeWidth="6"
              fill="transparent"
              r={radius}
              cx="125"
              cy="125"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: strokeDashoffset,
              }}
            />
          </svg>
          <div className="nova-orb-text">NOVA</div>
          <div className="nova-orb-subtext">Press & Hold</div>
        </div>
        <p className="nova-hold-instruction">
          {isHolding ? 'Hold to activate Nova...' : 'Hold to activate Nova'}
        </p>
      </div>
    );
  }

  return (
    <div className="nova-voice-card">
      <div className="nova-status-pill">
        <span className={`nova-status-dot ${state !== 'idle' ? 'active' : ''}`} />
        {state === 'idle' && 'Nova Standby'}
        {state === 'listening' && 'Listening...'}
        {state === 'speaking' && 'Speaking...'}
        {state === 'thinking' && 'Nova is thinking'}
      </div>

      <div className={`nova-orb-active ${state}`} onClick={onToggleMute} style={{ cursor: 'pointer' }}>
        {/* Glowing layers for listening state */}
        {state === 'listening' && (
          <>
            <div className="pulse-wave pulse-wave-1" />
            <div className="pulse-wave pulse-wave-2" />
            <div className="pulse-wave pulse-wave-3" />
          </>
        )}

        {/* Audio rings for speaking state */}
        {state === 'speaking' && (
          <>
            <div className="speaking-ring" />
            <div className="speaking-ring-2" />
          </>
        )}

        <div className="nova-orb-icon-inner">NOVA</div>
      </div>

      {/* Dynamic bouncing voice bars */}
      <div className={`visualizer-container ${(state === 'speaking' || state === 'listening') ? 'active' : ''}`}>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="visualizer-bar" />
        ))}
      </div>

      <p className="nova-helper-text">
        {state === 'idle' && 'Hold orb or click to speak to Nova'}
        {state === 'listening' && 'Speak clearly...'}
        {state === 'speaking' && 'Nova is speaking. Click orb to mute.'}
        {state === 'thinking' && 'Analyzing context...'}
      </p>

      <button className="nova-action-btn" onClick={onToggleMute}>
        Mute Audio
      </button>
    </div>
  );
}
