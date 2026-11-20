// Sunfall Heat — shared tuning, palette and small math helpers.
// Every module imports from here so the whole game agrees on sizes:
// the city is a grid of blocks and roads, with sand and sea to the east.

export const TAU = Math.PI * 2;

// World layout (pixels). The road grid covers GRID x GRID; east of it is
// the beach strip and then open water, which nothing may enter.
export const PITCH = 294;          // distance between neighbouring road centres
export const ROAD = 64;            // road width
export const BLOCK = PITCH - ROAD; // buildable square between roads (230)
export const COLS = 8;             // vertical roads
export const ROWS = 8;             // horizontal roads
export const GRID = COLS * PITCH;  // 2352 — grid spans 0..GRID on both axes
export const BEACH_X = GRID;       // sand starts here
export const WATER_X = GRID + 300; // water starts here
export const WORLD_W = WATER_X + 460;
export const WORLD_H = GRID + 170; // a promenade strip along the south edge

export const PLAYER_R = 13;        // collision radius on foot
export const CAR_R = 21;           // collision radius for cars
export const WALK_SPEED = 128;
export const RUN_SPEED = 205;
export const SAVE_KEY = 'sunfall-heat-save-v1';

// Warm daytime palette.
export const PAL = {
  grass: '#79b657', grassDark: '#6da34e',
  sidewalk: '#cfc8b8', sidewalkEdge: '#b7b09c',
  road: '#4a4a52', roadEdge: '#3a3a42', lane: '#e8e4d2',
  crosswalk: '#ddd8c8',
  sand: '#eed9a0', sandDark: '#e3cb8a',
  water: '#2e9db8', waterDeep: '#2386a3', foam: '#bfeef5',
  palmTrunk: '#8a6b46', palmLeaf: '#3f9e4d', palmLeaf2: '#57b563',
  shadow: 'rgba(60,40,20,0.25)',
  hudPanel: 'rgba(16,20,28,0.72)',
  accent: '#ffb52e', accent2: '#ff5d47', good: '#57e389',
  ink: '#10131a',
};

// Building paint jobs: pastel art-deco colours that suit a coastal city.
export const BUILDING_COLORS = [
  '#f2e3c6', '#f6cf9f', '#eeb4a0', '#f9e08a', '#bfe3d0', '#a8d8e8',
  '#f4a9c0', '#d9c6f0', '#ffe9d6', '#c3e6a8', '#f7f0e1', '#ffc98a',
];
export const ROOF_COLORS = [
  '#c96f4a', '#a8573f', '#8f9aa8', '#b5524a', '#7d8fa3', '#c98a4a',
];

export const CAR_COLORS = [
  '#e74c3c', '#f39c2c', '#f7e14b', '#39c2d7', '#3f7fbf', '#8e5fc0',
  '#ef7fb0', '#f2f2f2', '#2f3542', '#27ae60', '#ff7847', '#95a5a6',
];

// Car models: name, top speed (px/s), acceleration, grip, price flavour.
export const CAR_TYPES = [
  { name: 'Palmetto Buggy', top: 235, accel: 240, turn: 2.6 },
  { name: 'Sundowner Coupe', top: 305, accel: 320, turn: 2.9 },
  { name: 'Marina Sedan', top: 265, accel: 270, turn: 2.7 },
  { name: 'Cargomaster Van', top: 215, accel: 200, turn: 2.2 },
  { name: 'Viper GT', top: 385, accel: 410, turn: 3.1 },
  { name: 'Taxi Cab', top: 255, accel: 260, turn: 2.6 },
];

export const PED_SHIRTS = ['#ff6b5e', '#ffd23e', '#4ecdc4', '#f7f7f7', '#ff9ff3', '#54a0ff', '#5f27cd', '#1dd1a1', '#ff9f43', '#48dbfb'];
export const PED_PANTS = ['#2f3542', '#576574', '#8395a7', '#222f3e', '#c8d6e5', '#341f97'];

// First names for pedestrians, passengers and radio chatter.
export const FIRST_NAMES = [
  'Rosa', 'Felix', 'June', 'Marco', 'Priya', 'Tomas', 'Lena', 'Omar',
  'Sofia', 'Hank', 'Ivy', 'Diego', 'Nina', 'Caleb', 'Mona', 'Rudy',
  'Alba', 'Vince', 'Tara', 'Emil', 'Cleo', 'Hugo', 'Mira', 'Sal',
];

// ---- tiny helpers -------------------------------------------------------

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randi(a, b) { return Math.floor(rand(a, b + 1)); }
export function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

// Shortest signed turn from angle a to angle b, in (-PI, PI].
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDelta(a, b) * t; }

// Is point (x,y) on a road (either orientation, including intersections)?
export function onRoad(x, y) {
  if (x < 0 || y < 0 || x > GRID + ROAD / 2 || y > WORLD_H) return false;
  const mx = ((x % PITCH) + PITCH) % PITCH;
  const my = ((y % PITCH) + PITCH) % PITCH;
  return mx < ROAD || my < ROAD || y > GRID; // south strip is promenade road
}

// Road centre lines: centres sit at ROAD/2 + i*PITCH.
export function roadCenter(i) { return ROAD / 2 + i * PITCH; }
