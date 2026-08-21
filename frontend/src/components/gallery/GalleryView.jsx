import React, { useState, useEffect, useCallback, useRef } from 'react';

export default function GalleryView({ stops, onBack, onOpenStop, onDeletePhoto, onSlideshow }) {
  const galleryStops = stops.filter(s => s?.metadata?.photo);
  const [slideIndex, setSlideIndex] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);

  const openSlide = useCallback((index, triggerEl) => {
    triggerRef.current = triggerEl || null;
    setSlideIndex(index);
  }, []);

  const closeSlide = useCallback(() => {
    setSlideIndex(null);
    // restore focus to the card that opened the modal
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const handleDelete = useCallback(async () => {
    if (!onDeletePhoto || slideIndex === null) return;
    const stop = galleryStops[slideIndex];
    if (!window.confirm(`Delete photo for "${stop.name}"?`)) return;
    setDeleting(true);
    try {
      await onDeletePhoto(stop);
      // After deletion the galleryStops list will shrink by 1.
      // Use the snapshot length to derive next index without relying on re-render.
      const afterLen = galleryStops.length - 1;
      if (afterLen === 0) {
        closeSlide();
      } else {
        setSlideIndex(i => Math.min(i, afterLen - 1));
      }
    } finally {
      setDeleting(false);
    }
  }, [onDeletePhoto, slideIndex, galleryStops, closeSlide]);

  const prev = useCallback(() =>
    setSlideIndex(i => (i - 1 + galleryStops.length) % galleryStops.length), [galleryStops.length]);
  const next = useCallback(() =>
    setSlideIndex(i => (i + 1) % galleryStops.length), [galleryStops.length]);

  // Move focus into the modal when it opens
  useEffect(() => {
    if (slideIndex !== null) {
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
  }, [slideIndex]);

  useEffect(() => {
    if (slideIndex === null) return;
    const handler = (e) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') closeSlide();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slideIndex, prev, next, closeSlide]);

  const current = slideIndex !== null ? galleryStops[slideIndex] : null;

  return (
    <div className="gallery-view">
      <div className="gallery-header">
        <button className="btn-ghost btn-sm" onClick={onBack}>← Back to More</button>
        <h3>Gallery</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="more-gallery-count">{galleryStops.length} photo{galleryStops.length === 1 ? '' : 's'}</span>
          {onSlideshow && galleryStops.length > 0 && (
            <button className="btn-primary btn-sm" onClick={onSlideshow} title="Open slideshow">🎞 Slideshow</button>
          )}
        </div>
      </div>

      {galleryStops.length === 0 ? (
        <p className="more-empty">No stop photos yet</p>
      ) : (
        <div className="more-gallery-grid">
          {galleryStops.map((stop, idx) => (
            <button
              key={stop.id}
              className="more-gallery-card"
              onClick={(e) => openSlide(idx, e.currentTarget)}
              type="button"
            >
              <img src={stop.metadata.photo} alt={`${stop.name} photo`} className="more-gallery-img" />
              <span className="more-gallery-label">{stop.name}</span>
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="slideshow-overlay" onClick={closeSlide}>
          <div className="slideshow-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Photo slideshow">
            <button ref={closeButtonRef} className="slideshow-close" onClick={closeSlide} aria-label="Close slideshow">✕</button>
            {onDeletePhoto && (
              <button
                className="slideshow-delete"
                onClick={handleDelete}
                disabled={deleting}
                aria-label="Delete photo"
              >
                {deleting ? '…' : '🗑'}
              </button>
            )}
            <div className="slideshow-counter">{slideIndex + 1} / {galleryStops.length}</div>
            <img
              src={current.metadata.photo}
              alt={`${current.name} photo`}
              className="slideshow-img"
            />
            <div className="slideshow-caption">{current.name}</div>
            <div className="slideshow-nav">
              <button className="slideshow-nav-btn" onClick={prev} aria-label="Previous photo">‹</button>
              {onOpenStop && (
                <button className="slideshow-open-btn btn-ghost btn-sm" onClick={() => { closeSlide(); onOpenStop(current); }}>
                  View stop
                </button>
              )}
              <button className="slideshow-nav-btn" onClick={next} aria-label="Next photo">›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
