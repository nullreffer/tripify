import React, { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Trip slideshow — fetches AI-captioned slides from the backend, plays a
 * Ken-Burns auto-advancing presentation, shows a timeline strip, and
 * supports Google Cast (Chromecast) when a receiver is available.
 *
 * Props:
 *   tripId   — string
 *   stops    — Stop[] (for offline fallback)
 *   onBack   — () => void
 */
export default function SlideshowView({ tripId, stops = [], onBack }) {
  const [slides, setSlides] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [castAvailable, setCastAvailable] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const intervalRef = useRef(null);
  const castContextRef = useRef(null);
  const containerRef = useRef(null);

  // ── Load slides ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tripId) return;

    // Try localStorage cache first
    const cacheKey = `azitrip-slideshow-${tripId}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached?.slides?.length) {
        // Restore dates
        const slides = cached.slides.map(s => ({ ...s, date: s.date ? new Date(s.date) : null }));
        setSlides(slides);
        setLoading(false);
        return;
      }
    } catch { /* ignore */ }

    setLoading(true);
    fetch(`${API_BASE}/api/trips/${tripId}/slideshow`, {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(30000),
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load')))
      .then(data => {
        if (!data.slides || data.slides.length === 0) {
          // Fallback: build slides from stops that have photos
          const fallback = stops
            .filter(s => s?.metadata?.photo || (Array.isArray(s?.metadata?.photos) && s.metadata.photos.length > 0))
            .map(s => {
              const photos = Array.isArray(s.metadata?.photos) ? s.metadata.photos
                : s.metadata?.photo ? [s.metadata.photo] : [];
              return {
                stopId: s.id, stopName: s.name, address: s.address,
                date: s.targetDate, photos, primaryPhoto: photos[0],
                caption: s.name, narrative: s.notes || null, order: s.order,
              };
            });
          setSlides(fallback);
        } else {
          setSlides(data.slides);
          // Cache the response
          try { localStorage.setItem(cacheKey, JSON.stringify({ slides: data.slides, cachedAt: Date.now() })); } catch { /* storage full */ }
        }
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-play ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !slides?.length) return;
    intervalRef.current = setInterval(() => {
      setCurrent(i => (i + 1) % slides.length);
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [playing, slides]);

  const goTo = useCallback((idx) => {
    setCurrent(idx);
    // Restart interval on manual nav
    clearInterval(intervalRef.current);
    if (playing && slides?.length) {
      intervalRef.current = setInterval(() => setCurrent(i => (i + 1) % slides.length), 5000);
    }
  }, [playing, slides]);

  const prev = useCallback(() => slides && goTo((current - 1 + slides.length) % slides.length), [current, goTo, slides]);
  const next = useCallback(() => slides && goTo((current + 1) % slides.length), [current, goTo, slides]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === ' ') setPlaying(p => !p);
      else if (e.key === 'Escape') { setFullscreen(false); onBack?.(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next, onBack]);

  // ── Fullscreen ───────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  }, []);

  // ── Chromecast / Cast SDK ────────────────────────────────────────────────
  useEffect(() => {
    // Load Cast sender SDK
    if (!window.__castSDKLoaded) {
      window.__castSDKLoaded = true;
      window['__onGCastApiAvailable'] = (isAvailable) => {
        if (!isAvailable) return;
        try {
          cast.framework.CastContext.getInstance().setOptions({
            receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
            autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          });
          const ctx = cast.framework.CastContext.getInstance();
          castContextRef.current = ctx;
          ctx.addEventListener(
            cast.framework.CastContextEventType.CAST_STATE_CHANGED,
            () => setCastAvailable(ctx.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE)
          );
          setCastAvailable(ctx.getCastState() !== cast.framework.CastState.NO_DEVICES_AVAILABLE);
        } catch { /* Cast SDK not available */ }
      };
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      document.head.appendChild(script);
    }
  }, []);

  const handleCast = useCallback(async () => {
    if (!castContextRef.current || !slides?.[current]) return;
    try {
      await castContextRef.current.requestSession();
      const session = castContextRef.current.getCurrentSession();
      if (!session) return;
      const mediaInfo = new chrome.cast.media.MediaInfo(
        slides[current].primaryPhoto,
        'image/jpeg'
      );
      const request = new chrome.cast.media.LoadRequest(mediaInfo);
      request.metadata = new chrome.cast.media.PhotoMediaMetadata();
      request.metadata.title = slides[current].caption;
      request.metadata.subtitle = slides[current].narrative || '';
      session.loadMedia(request);
    } catch { /* user cancelled or cast failed */ }
  }, [slides, current]);

  const handleShare = useCallback(async () => {
    if (!tripId) return;
    setSharing(true);
    try {
      const res = await fetch(`${API_BASE}/api/trips/${tripId}/slideshow/share`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create share link');
      const data = await res.json();
      setShareUrl(data.shareUrl);
    } catch {
      // silently ignore — share button stays available
    } finally {
      setSharing(false);
    }
  }, [tripId]);

  const handleCopyShareUrl = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  }, [shareUrl]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="slideshow-view">
        <div className="slideshow-view-header">
          <button className="btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <h3>Trip Slideshow</h3>
        </div>
        <div className="slideshow-loading">
          <div className="spinner" />
          <p>Generating AI captions…</p>
        </div>
      </div>
    );
  }

  if (error || !slides || slides.length === 0) {
    return (
      <div className="slideshow-view">
        <div className="slideshow-view-header">
          <button className="btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <h3>Trip Slideshow</h3>
        </div>
        <p className="slideshow-empty">
          {error || 'No stop photos yet — add photos to your stops to create a slideshow.'}
        </p>
      </div>
    );
  }

  const slide = slides[current];
  const slideDateStr = slide.date
    ? new Date(slide.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className={`slideshow-view${fullscreen ? ' slideshow-fullscreen' : ''}`} ref={containerRef}>
      {/* Header (hidden in fullscreen) */}
      {!fullscreen && (
        <div className="slideshow-view-header">
          <button className="btn-ghost btn-sm" onClick={onBack}>← Back</button>
          <h3>Trip Slideshow</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="slideshow-view-count">{slides.length} stop{slides.length !== 1 ? 's' : ''}</span>
            {tripId && (
              <button
                className="btn-ghost btn-sm"
                title="Regenerate slideshow"
                onClick={() => {
                  try { localStorage.removeItem(`azitrip-slideshow-${tripId}`); } catch { /* ignore */ }
                  setSlides(null);
                  setLoading(true);
                  setError(null);
                  fetch(`${API_BASE}/api/trips/${tripId}/slideshow`, {
                    method: 'POST', credentials: 'include', signal: AbortSignal.timeout(30000),
                  })
                    .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
                    .then(data => {
                      if (data.slides?.length) {
                        setSlides(data.slides);
                        try { localStorage.setItem(`azitrip-slideshow-${tripId}`, JSON.stringify({ slides: data.slides, cachedAt: Date.now() })); } catch { /* ignore */ }
                      } else {
                        setSlides([]);
                      }
                      setLoading(false);
                    })
                    .catch(err => { setError(err.message); setLoading(false); });
                }}
              >
                🔄
              </button>
            )}
            {tripId && (
              <button
                className="btn-ghost btn-sm"
                onClick={shareUrl ? handleCopyShareUrl : handleShare}
                disabled={sharing}
                title={shareUrl ? 'Copy share link' : 'Share slideshow'}
              >
                {sharing ? '⏳' : shareUrl ? (shareCopied ? '✓ Copied!' : '🔗 Copy link') : '🔗 Share'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Share URL banner */}
      {shareUrl && !fullscreen && (
        <div className="slideshow-share-banner">
          <span className="slideshow-share-url" title={shareUrl}>{shareUrl}</span>
          <button className="btn-primary btn-sm" onClick={handleCopyShareUrl}>
            {shareCopied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
      )}

      {/* Main stage */}
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

        {/* Overlay info */}
        <div className="slideshow-stage-overlay">
          <div className="slideshow-stage-name">{slide.stopName}</div>
          {slideDateStr && <div className="slideshow-stage-date">{slideDateStr}</div>}
          {slide.caption && <div className="slideshow-stage-caption">{slide.caption}</div>}
          {slide.narrative && <div className="slideshow-stage-narrative">{slide.narrative}</div>}
        </div>

        {/* Controls overlay */}
        <div className="slideshow-stage-controls">
          <button className="slideshow-ctrl-btn" onClick={prev} aria-label="Previous">‹</button>
          <button className="slideshow-ctrl-btn slideshow-ctrl-play" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="slideshow-ctrl-btn" onClick={next} aria-label="Next">›</button>
        </div>

        {/* Top-right actions */}
        <div className="slideshow-stage-actions">
          <span className="slideshow-stage-counter">{current + 1} / {slides.length}</span>
          {castAvailable && (
            <button className="slideshow-cast-btn" onClick={handleCast} title="Cast to TV">
              📺
            </button>
          )}
          <button className="slideshow-fullscreen-btn" onClick={toggleFullscreen} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {fullscreen ? '⊠' : '⛶'}
          </button>
        </div>
      </div>

      {/* Timeline strip */}
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
