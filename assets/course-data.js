// Course layout for the predictive map. Fill these in once known —
// the map still renders a generic lap loop while they are empty.

// Distance of one full lap, in miles.
export const LAP_MILES = 5;

// Obstacles around a single lap, ordered by mile (distance from lap start).
// Example: { name: "Mud Mile", mile: 0.8 }
export const OBSTACLES = [
];

// Timing mats — usually co-located with an obstacle. The feed's LastSeen
// label should match a mat `name` so the map can place athletes precisely.
// Example: { name: "Start/Finish", mile: 0 }
export const TIMING_MATS = [
];
