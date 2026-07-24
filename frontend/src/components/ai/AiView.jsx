import React, { useState, useEffect, useRef, useMemo } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const SUGGESTIONS = [
  'What are the must-see attractions along our route?',
  'Are there any safety tips for our destinations?',
  'Suggest local foods to try at each stop',
  'What should we pack for this trip?',
  "What's the weather typically like in these areas?",
  'Any tips for road tripping with a camper van?',
];

// Parse a text string into segments: plain text and [[location]] links
function parseLocationLinks(text) {
  const parts = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) });
    parts.push({ type: 'location', value: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

function MessageLine({ line, stopsByName, onLocationClick }) {
  const parts = parseLocationLinks(line);
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'location') {
          // Look up in the pre-built normalized map for O(1) matching
          const matchedStop = stopsByName?.get(part.value.toLowerCase());
          return (
            <button
              key={i}
              className="ai-location-link"
              onClick={() => onLocationClick?.(part.value, matchedStop)}
              title={matchedStop ? `View ${part.value} on map` : `Search for ${part.value} on map`}
            >
              📍 {part.value}
            </button>
          );
        }
        return <React.Fragment key={i}>{part.value}</React.Fragment>;
      })}
    </>
  );
}

export default function AiView({ tripId, tripName, stops, route, autoPromptRequest, onAutoPromptDone, onOpenMapSearch, onFlyToStop }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Pre-build a normalized name→stop lookup map for O(1) matching in message rendering
  const stopsByName = useMemo(() => {
    if (!stops?.length) return new Map();
    return new Map(stops.map(s => [s.name.toLowerCase(), s]));
  }, [stops]);

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
    if (/pre-?download|offline map|download map/i.test(msg)) {
      setInput('');
      setMessages(prev => [...prev,
        { role: 'user', content: msg },
        { role: 'assistant', content: 'Got it — preparing offline maps and saving your current route/pins now.' }
      ]);
      window.dispatchEvent(new CustomEvent('tripify:offline-prep-request'));
      return;
    }
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
      const assistantReply = data?.reply || data?.message?.content || data?.error || 'Sorry, something went wrong.';
      setMessages(prev => [...prev, { role: 'assistant', content: assistantReply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Could not reach AI service. Check your connection.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!autoPromptRequest?.text) return;
    send(autoPromptRequest.text);
    onAutoPromptDone?.();
  }, [autoPromptRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLocationClick = (name, matchedStop) => {
    if (matchedStop) {
      onFlyToStop?.(matchedStop);
    } else {
      onOpenMapSearch?.(name);
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
                <React.Fragment key={j}>
                  <MessageLine line={line} stopsByName={stopsByName} onLocationClick={handleLocationClick} />
                  <br />
                </React.Fragment>
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
