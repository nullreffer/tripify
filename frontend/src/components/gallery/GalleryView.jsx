import React from 'react';

export default function GalleryView({ stops, onBack, onOpenStop }) {
  const galleryStops = stops.filter(s => s?.metadata?.photo);

  return (
    <div className="gallery-view">
      <div className="gallery-header">
        <button className="btn-ghost btn-sm" onClick={onBack}>← Back to More</button>
        <h3>Gallery</h3>
        <span className="more-gallery-count">{galleryStops.length} photo{galleryStops.length === 1 ? '' : 's'}</span>
      </div>

      {galleryStops.length === 0 ? (
        <p className="more-empty">No stop photos yet</p>
      ) : (
        <div className="more-gallery-grid">
          {galleryStops.map(stop => (
            <button
              key={stop.id}
              className="more-gallery-card"
              onClick={() => onOpenStop && onOpenStop(stop)}
              type="button"
            >
              <img src={stop.metadata.photo} alt={`${stop.name} photo`} className="more-gallery-img" />
              <span className="more-gallery-label">{stop.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
