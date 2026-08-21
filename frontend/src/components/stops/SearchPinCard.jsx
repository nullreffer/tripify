import React, { useState, useEffect } from 'react';
import { fetchPlaceDetails } from '../../services/placeDetails.js';

/**
 * Rich place-details card for search pins and POI attraction pins.
 * Props:
 *   pin      — { name, displayName, lat, lng, type, category, extratags, tags, wikipedia }
 *   onAdd    — ({ mode }) => void — called with 'next' | 'afterNearest' | 'beforeNearest' | 'saveForLater'
 *   onClose  — () => void
 *   showAdd  — bool (default true) — whether to show add-stop buttons
 */
export default function SearchPinCard({ pin, onAdd, onClose, showAdd = true }) {
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);

  // Gather photos from OSM tags (existing data) + Wikipedia details
  const osmPhotos = (() => {
    const tags = pin.tags || {};
    const photos = [];
    if (tags.wikimedia_commons) {
      const fname = encodeURIComponent(tags.wikimedia_commons.replace(/^File:/i, ''));
      photos.push(`https://commons.wikimedia.org/wiki/Special:FilePath/${fname}?width=600`);
    }
    if (tags.image && tags.image.startsWith('http')) photos.push(tags.image);
    return photos;
  })();

  const allPhotos = (() => {
    const wikiPhotos = details?.commonsImages || [];
    const combined = [...osmPhotos];
    for (const p of wikiPhotos) {
      if (!combined.includes(p)) combined.push(p);
    }
    return combined.slice(0, 8);
  })();

  const displayName = pin.displayName || pin.address || '';
  const type = pin.type || pin.category || '';
  const tags = pin.tags || {};
  const extratags = pin.extratags || {};
  const hours = tags.opening_hours || extratags.opening_hours || null;
  const phone = tags.phone || tags['contact:phone'] || extratags.phone || null;
  const website = tags.website || tags['contact:website'] || extratags.website || null;
  const rating = extratags.rating ?? null;
  const reviewCount = extratags.user_ratings_total ?? null;

  useEffect(() => {
    setPhotoIdx(0);
    setDetails(null);
    if (!pin?.name) return;
    setLoadingDetails(true);
    fetchPlaceDetails({
      name: pin.name,
      lat: pin.lat,
      lng: pin.lng,
      wikipedia: tags.wikipedia || pin.wikipedia || null,
    }).then(d => {
      setDetails(d);
      setLoadingDetails(false);
    });
  }, [pin?.name, pin?.lat, pin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="spc-overlay" onClick={onClose}>
      <div className="spc-card" onClick={e => e.stopPropagation()}>
        <div className="spc-handle" />

        {/* Header */}
        <div className="spc-header">
          <div className="spc-title-col">
            <div className="spc-name">{pin.name}</div>
            {type && <div className="spc-type">{type}</div>}
          </div>
          <button className="spc-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="spc-body">
          {/* Photo carousel */}
          {allPhotos.length > 0 && (
            <div className="spc-photo-wrap">
              <img
                key={allPhotos[photoIdx]}
                src={allPhotos[photoIdx]}
                alt={pin.name}
                className="spc-photo"
                onError={e => {
                  // skip broken image
                  if (photoIdx < allPhotos.length - 1) setPhotoIdx(i => i + 1);
                  else e.target.style.display = 'none';
                }}
              />
              {allPhotos.length > 1 && (
                <div className="spc-photo-dots">
                  {allPhotos.map((_, i) => (
                    <button
                      key={i}
                      className={`spc-photo-dot${i === photoIdx ? ' active' : ''}`}
                      onClick={() => setPhotoIdx(i)}
                      aria-label={`Photo ${i + 1}`}
                    />
                  ))}
                </div>
              )}
              {allPhotos.length > 1 && (
                <>
                  <button className="spc-photo-prev" onClick={() => setPhotoIdx(i => (i - 1 + allPhotos.length) % allPhotos.length)}>‹</button>
                  <button className="spc-photo-next" onClick={() => setPhotoIdx(i => (i + 1) % allPhotos.length)}>›</button>
                </>
              )}
            </div>
          )}
          {loadingDetails && allPhotos.length === 0 && (
            <div className="spc-photo-placeholder">
              <div className="spinner xs" />
            </div>
          )}

          {/* Address */}
          {displayName && <div className="spc-addr">{displayName}</div>}

          {/* Rating */}
          {rating != null && (
            <div className="spc-row">
              {'⭐'.repeat(Math.min(5, Math.round(rating)))}
              <span className="spc-row-val">{Number(rating).toFixed(1)}{reviewCount ? ` (${reviewCount.toLocaleString()} reviews)` : ''}</span>
            </div>
          )}

          {/* Wikipedia summary */}
          {details?.summary && (
            <p className="spc-summary">{details.summary}</p>
          )}

          {/* Hours */}
          {hours && (
            <div className="spc-row">⏰ <span className="spc-row-val">{hours}</span></div>
          )}

          {/* Phone */}
          {phone && (
            <div className="spc-row">📞 <a href={`tel:${phone}`} className="spc-link">{phone}</a></div>
          )}

          {/* Website */}
          {website && (
            <div className="spc-row">🌐 <a href={website} target="_blank" rel="noopener noreferrer" className="spc-link">Website</a></div>
          )}

          {/* Wikipedia link */}
          {details?.wikiUrl && (
            <div className="spc-row">📖 <a href={details.wikiUrl} target="_blank" rel="noopener noreferrer" className="spc-link">Wikipedia</a></div>
          )}

          {/* Add-stop actions */}
          {showAdd && onAdd && (
            <div className="spc-actions">
              <button className="btn-primary btn-sm" onClick={() => onAdd('next')}>↑ Add as next stop</button>
              <button className="btn-primary btn-sm" onClick={() => onAdd('afterNearest')}>+ Add after nearest pin</button>
              <button className="btn-primary btn-sm" onClick={() => onAdd('beforeNearest')}>↓ Add before nearest pin</button>
              <button className="btn-secondary btn-sm" onClick={() => onAdd('saveForLater')}>🔖 Save for later</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
