// Pin type definitions: emoji, label, color for the route/marker
export const PIN_TYPES = {
  GENERAL:      { emoji: '📍', label: 'General',       color: '#f97316' },
  STAY:         { emoji: '🏠', label: 'Stay',          color: '#8b5cf6' },
  HOTEL:        { emoji: '🏨', label: 'Hotel',         color: '#8b5cf6' },
  CAMPGROUND:   { emoji: '🏕️', label: 'Campground',    color: '#16a34a' },
  HIKING_TRAIL: { emoji: '🥾', label: 'Hiking Trail',  color: '#854d0e' },
  RESTAURANT:   { emoji: '🍴', label: 'Restaurant',    color: '#dc2626' },
  ATTRACTION:   { emoji: '🎡', label: 'Attraction',    color: '#0ea5e9' },
  GAS_STATION:  { emoji: '⛽', label: 'Gas Station',   color: '#374151' },
  EV_CHARGER:   { emoji: '⚡', label: 'EV Charger',    color: '#10b981' },
  AIRPORT:      { emoji: '✈️', label: 'Airport',        color: '#6366f1' },
  PARKING:      { emoji: '🅿️', label: 'Parking',       color: '#64748b' },
  OTHER:        { emoji: '📌', label: 'Other',         color: '#9ca3af' },
};

export const PIN_TYPE_LIST = Object.entries(PIN_TYPES).map(([value, meta]) => ({ value, ...meta }));

export const ITEM_COLORS = [
  { label: 'None',   value: null,      swatch: 'transparent' },
  { label: 'Red',    value: '#ef4444', swatch: '#ef4444' },
  { label: 'Orange', value: '#f97316', swatch: '#f97316' },
  { label: 'Yellow', value: '#eab308', swatch: '#eab308' },
  { label: 'Green',  value: '#22c55e', swatch: '#22c55e' },
  { label: 'Blue',   value: '#3b82f6', swatch: '#3b82f6' },
  { label: 'Purple', value: '#a855f7', swatch: '#a855f7' },
  { label: 'Pink',   value: '#ec4899', swatch: '#ec4899' },
  { label: 'Gray',   value: '#6b7280', swatch: '#6b7280' },
];
