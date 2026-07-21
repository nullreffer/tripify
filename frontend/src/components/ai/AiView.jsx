import React, { useState, useEffect, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const SUGGESTIONS = [
  'What are the must-see attractions along our route?',
  'Are there any safety tips for our destinations?',
  'Suggest local foods to try at each stop',
  'What should we pack for this trip?',
  'What's the weather typically like in these areas?',
  'Any tips for road tripping with a camper van?',
];

export default function AiView({ tripId, tripName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Load history
  useEffect(() => {
    fetch(`${API}/api/trips/${tripId}/ai/history`, { credentials: 'include' })
      .then(r => r.json())
      .then(msgs => {
        setMessages(Array.isArray(msgs) ? msgs : []);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, [tripId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/trips/${tripId}/ai`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.error || 'Sorry, something went wrong.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Could not reach AI service. Check your connection.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="ai-view">
      <div className="ai-header">
        <h2>✨ AI Assistant</h2>
        <span className="ai-subtitle">Ask anything about your trip</span>
      </div>

      <div className="ai-messages">
        {!historyLoaded && <div className="ai-loading"><div className="spinner" /></div>}

        {historyLoaded && messages.length === 0 && (
          <div className="ai-welcome">
            <p>Hi! I'm your trip assistant for <strong>{tripName}</strong>. Ask me anything about your route, stops, packing, or local tips.</p>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className="ai-suggestion" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`ai-msg ai-msg-${msg.role}`}>
            {msg.role === 'assistant' && <div className="ai-avatar">✨</div>}
            <div className="ai-bubble">
              {msg.content.split('\n').map((line, j) => (
                <React.Fragment key={j}>{line}<br /></React.Fragment>
              ))}
            </div>
          </div>
        ))}

        {loading && (
          <div className="ai-msg ai-msg-assistant">
            <div className="ai-avatar">✨</div>
            <div className="ai-bubble ai-thinking">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="ai-input-area">
        <input
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }}}
          placeholder="Ask about your trip…"
          disabled={loading}
        />
        <button className="ai-send-btn" onClick={() => send(input)} disabled={!input.trim() || loading}>
          ↑
        </button>
      </div>
    </div>
  );
}
