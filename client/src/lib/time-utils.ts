/**
 * Round seconds to the nearest .05/.1 hour increment used for legal billing.
 *
 * Process:
 *  1. Round raw seconds to the nearest whole minute.
 *  2. Convert minutes to decimal hours.
 *  3. Find the nearest .05-hour floor (e.g. 0.75, 0.80, 0.85 …).
 *  4. If the leftover past that floor is ≤ 3 minutes (0.05 h), keep the floor.
 *     Otherwise round up to the next .1-hour mark.
 *
 * Examples:
 *   92 s  →  2 min  →  0.0333 h  →  floor is 0.00  →  remainder 2 min ≤ 3  →  0.00
 *   200 s →  3 min  →  0.05 h    →  floor is 0.05  →  remainder 0 min       →  0.05
 *   250 s →  4 min  →  0.0667 h  →  floor is 0.05  →  remainder 1 min ≤ 3  →  0.05
 *   290 s →  5 min  →  0.0833 h  →  floor is 0.05  →  remainder 2 min ≤ 3  →  0.05
 *   310 s →  5 min  →  0.0833 h  →  floor is 0.05  →  remainder 2 min      →  check: > 3? no → 0.05
 *   400 s →  7 min  →  0.1167 h  →  floor is 0.10  →  remainder 4 min > 3  →  0.20? no → 0.10 up to 0.20?
 *
 * Simplified rule per the spec:
 *   - remainder past .05 floor ≤ 3 min  → round down to floor
 *   - remainder past .05 floor  > 3 min → round up to next .1
 */
export function roundSecondsToHours(totalSeconds: number): number {
  if (totalSeconds <= 0) return 0;

  // Step 1: round to nearest minute
  const minutes = Math.round(totalSeconds / 60);

  // Step 2: to decimal hours
  const rawHours = minutes / 60;

  // Step 3: floor to nearest .05
  const floorUnit = 0.05;
  const floor05 = Math.floor(rawHours / floorUnit) * floorUnit;

  // Remainder in minutes beyond the .05 floor
  const remainderMinutes = (rawHours - floor05) * 60;

  // Step 4: apply rounding rule
  if (remainderMinutes <= 3) {
    return parseFloat(floor05.toFixed(2));
  } else {
    // Round up to next .1
    const nextTenth = (Math.floor(rawHours / 0.1) + 1) * 0.1;
    return parseFloat(nextTenth.toFixed(2));
  }
}

/**
 * Format decimal hours as h:mm for display (e.g. 1.25 → "1:15").
 */
export function formatDecimalHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

/**
 * Format a raw seconds count as H:MM:SS for the live timer display.
 */
export function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
