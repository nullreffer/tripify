import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Public shared slideshow page.
 * Accessible without authentication via a share token.
 * Shows the trip slideshow in a read-only, standalone view.
 */
export default function SharedSlideshow() {
  const { token } = useParams();
  const [slides, setSlides] = useState(null);
  const [tripTitle, setTripTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/slideshow-share/${token}`, {
      signal: AbortSignal.timeout(30000),
    })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || 'Failed to load'))))
      .then(data => {
        setSlides(data.slides || []);
        setTripTitle(data.tripTitle || '');
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [token]);

  useEffect(() => {
    if (!playing || !slides?.length) return;
    intervalRef.current = setInterval(() => setCurrent(i => (i + 1) % slides.length), 5000);
    return () => clearInterval(intervalRef.current);
  }, [playing, slides]);

  const goTo = useCallback((idx) => {
    setCurrent(idx);
    clearInterval(intervalRef.current);
    if (playing && slides?.length) {
      intervalRef.current = setInterval(() => setCurrent(i => (i + 1) % slides.length), 5000);
    }
  }, [playing, slides]);

  const prev = useCallback(() => slides && goTo((current - 1 + slides.length) % slides.length), [current, goTo, slides]);
  const next = useCallback(() => slides && goTo((current + 1) % slides.length), [current, goTo, slides]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === ' ') setPlaying(p => !p);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next]);

  if (loading) {
    return (
      <div className="shared-slideshow">
        <div className="shared-slideshow-loading">
          <div className="spinner" />
          <p>Loading slideshow…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-slideshow">
        <div className="shared-slideshow-error">
          <p>⚠ {error}</p>
        </div>
      </div>
    );
  }

  if (!slides || slides.length === 0) {
    return (
      <div className="shared-slideshow">
        <div className="shared-slideshow-empty">
          <p>No photos in this slideshow yet.</p>
        </div>
      </div>
    );
  }

  const slide = slides[current];
  const slideDateStr = slide.date
    ? new Date(slide.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="shared-slideshow">
      <div className="shared-slideshow-header">
        <span className="shared-slideshow-title">{tripTitle || 'Trip Slideshow'}</span>
        <span className="shared-slideshow-count">{current + 1} / {slides.length}</span>
      </div>

      <div className="slideshow-stage">
        {slide.primaryPhoto ? (
          <img
            key={`${slide.stopId}-${slide.primaryPhoto}`}
            src={slide.primaryPhoto}
            alt={slide.stopName}
            className="slideshow-stage-img slideshow-ken-burns"
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="slideshow-stage-placeholder">📷</div>
        )}

        <div className="slideshow-stage-overlay">
          <div className="slideshow-stage-name">{slide.stopName}</div>
          {slideDateStr && <div className="slideshow-stage-date">{slideDateStr}</div>}
          {slide.caption && <div className="slideshow-stage-caption">{slide.caption}</div>}
          {slide.narrative && <div className="slideshow-stage-narrative">{slide.narrative}</div>}
        </div>

        <div className="slideshow-stage-controls">
          <button className="slideshow-ctrl-btn" onClick={prev} aria-label="Previous">‹</button>
          <button className="slideshow-ctrl-btn slideshow-ctrl-play" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="slideshow-ctrl-btn" onClick={next} aria-label="Next">›</button>
        </div>
      </div>

      <div className="slideshow-timeline" role="list">
        {slides.map((s, i) => (
          <button
            key={s.stopId}
            role="listitem"
            className={`slideshow-timeline-item${i === current ? ' active' : ''}`}
            onClick={() => goTo(i)}
            title={s.stopName}
          >
            {s.primaryPhoto ? (
              <img src={s.primaryPhoto} alt={s.stopName} className="slideshow-timeline-img" onError={e => { e.target.style.display = 'none'; }} />
            ) : (
              <span className="slideshow-timeline-placeholder">📷</span>
            )}
            <span className="slideshow-timeline-label">{s.stopName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
