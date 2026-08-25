import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// Compress an image File to base64 JPEG
function compressImage(file, maxDim = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getStopPhotos(stop) {
  const meta = stop?.metadata || {};
  if (Array.isArray(meta.photos) && meta.photos.length > 0) return meta.photos;
  if (meta.photo) return [meta.photo];
  return [];
}

/**
 * GalleryView — shows all stop photos grouped by stop.
 *
 * Props:
 *   stops         — Stop[]
 *   onBack        — () => void
 *   onOpenStop    — (stop) => void
 *   onDeletePhoto — (stop, photoIndex) => Promise<void>
 *   onAddPhoto    — (stop, dataUrl) => Promise<void>
 *   onSlideshow   — () => void
 */
export default function GalleryView({ stops, onBack, onOpenStop, onDeletePhoto, onAddPhoto, onSlideshow }) {
  // Build a flat list of all photos with stop + index info for the lightbox
  const allPhotos = useMemo(() =>
    stops.flatMap(stop => {
      const photos = getStopPhotos(stop);
      return photos.map((url, photoIdx) => ({ stop, url, photoIdx }));
    }),
  [stops]);

  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadingStopId, setUploadingStopId] = useState(null);
  const closeButtonRef = useRef(null);
  const triggerRef = useRef(null);
  const fileInputRefs = useRef({});

  const stopsWithPhotos = stops.filter(s => getStopPhotos(s).length > 0);
  const totalPhotos = allPhotos.length;

  const openLightbox = useCallback((flatIdx, triggerEl) => {
    triggerRef.current = triggerEl || null;
    setLightboxIdx(flatIdx);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIdx(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const prevPhoto = useCallback(() =>
    setLightboxIdx(i => (i - 1 + allPhotos.length) % allPhotos.length), [allPhotos.length]);
  const nextPhoto = useCallback(() =>
    setLightboxIdx(i => (i + 1) % allPhotos.length), [allPhotos.length]);

  useEffect(() => {
    if (lightboxIdx !== null) requestAnimationFrame(() => closeButtonRef.current?.focus());
  }, [lightboxIdx]);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e) => {
      if (e.key === 'ArrowLeft') prevPhoto();
      else if (e.key === 'ArrowRight') nextPhoto();
      else if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIdx, prevPhoto, nextPhoto, closeLightbox]);

  const handleDelete = useCallback(async () => {
    if (!onDeletePhoto || lightboxIdx === null) return;
    const { stop, photoIdx } = allPhotos[lightboxIdx];
    if (!window.confirm(`Delete this photo from "${stop.name}"?`)) return;
    setDeleting(true);
    try {
      await onDeletePhoto(stop, photoIdx);
      const afterLen = allPhotos.length - 1;
      if (afterLen === 0) closeLightbox();
      else setLightboxIdx(i => Math.min(i, afterLen - 1));
    } finally {
      setDeleting(false);
    }
  }, [onDeletePhoto, lightboxIdx, allPhotos, closeLightbox]);

  const handleAddPhoto = useCallback(async (stop, file) => {
    if (!onAddPhoto || !file) return;
    setUploadingStopId(stop.id);
    try {
      const dataUrl = await compressImage(file);
      await onAddPhoto(stop, dataUrl);
    } finally {
      setUploadingStopId(null);
    }
  }, [onAddPhoto]);

  const currentPhoto = lightboxIdx !== null ? allPhotos[lightboxIdx] : null;

  return (
    <div className="gallery-view">
      <div className="gallery-header">
        <button className="btn-ghost btn-sm" onClick={onBack}>← Back to More</button>
        <h3>Gallery</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="more-gallery-count">{totalPhotos} photo{totalPhotos === 1 ? '' : 's'}</span>
          {onSlideshow && totalPhotos > 0 && (
            <button className="btn-primary btn-sm" onClick={onSlideshow} title="Open slideshow">🎞 Slideshow</button>
          )}
        </div>
      </div>

      {stopsWithPhotos.length === 0 && (
        <p className="more-empty">No stop photos yet — add photos to your stops to see them here.</p>
      )}

      {stops.map(stop => {
        const photos = getStopPhotos(stop);
        const isUploading = uploadingStopId === stop.id;

        return (
          <div key={stop.id} className="gallery-stop-group">
            <div className="gallery-stop-header">
              <span className="gallery-stop-name">{stop.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="gallery-stop-count">{photos.length} photo{photos.length === 1 ? '' : 's'}</span>
                {onAddPhoto && (
                  <>
                    <button
                      className="gallery-icon-btn"
                      onClick={() => fileInputRefs.current[stop.id]?.click()}
                      disabled={isUploading}
                      title="Add photo"
                      aria-label="Add photo"
                    >
                      {isUploading ? '⏳' : '➕'}
                    </button>
                    <input
                      ref={el => { fileInputRefs.current[stop.id] = el; }}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleAddPhoto(stop, file);
                        e.target.value = '';
                      }}
                    />
                  </>
                )}
                {onOpenStop && (
                  <button className="gallery-icon-btn" onClick={() => onOpenStop(stop)} title="View stop" aria-label="View stop">🔗</button>
                )}
              </div>
            </div>
            {photos.length > 0 && (
              <div className="more-gallery-grid">
                {photos.map((url, photoIdx) => {
                  const flatIdx = allPhotos.findIndex(p => p.stop.id === stop.id && p.photoIdx === photoIdx);
                  return (
                    <button
                      key={`${stop.id}-${photoIdx}`}
                      className="more-gallery-card"
                      onClick={e => openLightbox(flatIdx, e.currentTarget)}
                      type="button"
                    >
                      <img src={url} alt={`${stop.name} photo ${photoIdx + 1}`} className="more-gallery-img" />
                    </button>
                  );
                })}
              </div>
            )}
            {photos.length === 0 && onAddPhoto && (
              <p className="gallery-stop-empty">No photos yet — tap ➕ to upload.</p>
            )}
          </div>
        );
      })}

      {currentPhoto && (
        <div className="slideshow-overlay" onClick={closeLightbox}>
          <div className="slideshow-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Photo viewer">
            <button ref={closeButtonRef} className="slideshow-close" onClick={closeLightbox} aria-label="Close">✕</button>
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
            <div className="slideshow-counter">{lightboxIdx + 1} / {allPhotos.length}</div>
            <img
              src={currentPhoto.url}
              alt={`${currentPhoto.stop.name} photo`}
              className="slideshow-img"
            />
            <div className="slideshow-caption">{currentPhoto.stop.name}</div>
            <div className="slideshow-nav">
              <button className="slideshow-nav-btn" onClick={prevPhoto} aria-label="Previous photo">‹</button>
              {onOpenStop && (
                <button className="slideshow-open-btn btn-ghost btn-sm" onClick={() => { closeLightbox(); onOpenStop(currentPhoto.stop); }}>
                  View stop
                </button>
              )}
              <button className="slideshow-nav-btn" onClick={nextPhoto} aria-label="Next photo">›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
