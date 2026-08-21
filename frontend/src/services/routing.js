const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Get a road route between ordered stops.
 * Returns { geometry: GeoJSON LineString, distance (m), duration (s), legs } or null.
 */
export async function getRoute(stops) {
  if (!stops || stops.length < 2) return null;
  const coords = stops.map(s => `${s.lng},${s.lat}`).join(';');
  try {
    const res = await fetch(
      `${API_BASE}/api/routing/route?coords=${encodeURIComponent(coords)}`,
      { credentials: 'include', signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes[0]) return null;
    const route = data.routes[0];
    return {
      geometry: route.geometry,            // GeoJSON LineString
      distance: route.distance,            // meters
      duration: route.duration,            // seconds
      legs: route.legs.map(l => ({         // per-segment info
        distance: l.distance,
        duration: l.duration
      }))
    };
  } catch {
    return null;
  }
}

/**
 * Get step-by-step navigation data between an origin and a destination.
 * Returns OSRM route data with full steps, or null.
 */
export async function getNavigationRoute(origin, destination) {
  if (!origin || !destination) return null;
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  try {
    const res = await fetch(
      `${API_BASE}/api/routing/navigate?coords=${encodeURIComponent(coords)}`,
      { credentials: 'include', signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;
    const route = data.routes[0];
    // Flatten all steps from all legs
    const steps = route.legs.flatMap(leg =>
      (leg.steps || []).map(step => ({
        instruction: step.maneuver?.instruction || humanizeManeuver(step.maneuver),
        distance: step.distance,
        duration: step.duration,
        type: step.maneuver?.type,
        modifier: step.maneuver?.modifier,
        location: step.maneuver?.location, // [lng, lat]
        name: step.name,
      }))
    );
    return {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      steps,
    };
  } catch {
    return null;
  }
}

/** Convert an OSRM maneuver object to a human-readable string when instruction is absent. */
function humanizeManeuver(maneuver) {
  if (!maneuver) return 'Continue';
  const { type, modifier } = maneuver;
  if (type === 'arrive') return 'Arrive at destination';
  if (type === 'depart') return 'Depart';
  if (type === 'turn') {
    if (modifier === 'left') return 'Turn left';
    if (modifier === 'right') return 'Turn right';
    if (modifier === 'slight left') return 'Turn slight left';
    if (modifier === 'slight right') return 'Turn slight right';
    if (modifier === 'sharp left') return 'Turn sharp left';
    if (modifier === 'sharp right') return 'Turn sharp right';
    if (modifier === 'straight') return 'Continue straight';
    if (modifier === 'uturn') return 'Make a U-turn';
    return 'Turn';
  }
  if (type === 'merge') return `Merge${modifier ? ' ' + modifier : ''}`;
  if (type === 'ramp') return `Take the ramp${modifier ? ' ' + modifier : ''}`;
  if (type === 'roundabout') return 'Enter the roundabout';
  if (type === 'exit roundabout') return 'Exit the roundabout';
  return `Continue ${modifier || ''}`.trim();
}

export function formatDistance(meters, units = 'imperial') {
  if (meters == null) return '';
  if (units === 'metric') {
    if (meters < 1000) return `${Math.round(meters)} m`;
    const km = meters / 1000;
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  }
  // imperial
  if (meters < 500) return `${Math.round(meters * 3.28084)} ft`;
  const miles = meters / 1609.34;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

export function formatDuration(seconds) {
  if (seconds == null) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}


