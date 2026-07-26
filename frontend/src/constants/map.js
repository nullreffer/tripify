export const COLOCATED_COORD_DECIMALS = 5;

export function getLocationGroupKey(lat, lng) {
  return `${Number(lat).toFixed(COLOCATED_COORD_DECIMALS)},${Number(lng).toFixed(COLOCATED_COORD_DECIMALS)}`;
}
