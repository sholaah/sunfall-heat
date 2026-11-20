// Sunfall Heat — Sunfall City itself: the road grid, buildings, parks,
// parking lots, landmarks, beach and props, plus the collision queries
// every moving thing uses. Generation uses a fixed seed so the city is
// the same on every visit (and in every screenshot).

import {
  PITCH, ROAD, BLOCK, COLS, ROWS, GRID, BEACH_X, WATER_X, WORLD_W, WORLD_H,
  BUILDING_COLORS, ROOF_COLORS, roadCenter,
} from './config.js';

// Small deterministic RNG (mulberry32) for layout only.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const city = {
  buildings: [],   // {x,y,w,h,floors,color,roof,sign}
  palms: [],       // {x,y,s}
  crates: [],      // {x,y}
  lamps: [],       // {x,y}
  lots: [],        // parking lot pads {x,y,w,h}
  parks: [],       // park pads {x,y,w,h}
  parkSpots: [],   // parking places for cars {x,y,angle}
  shells: [],      // golden shell spots {id,x,y}
  foodCarts: [],   // {x,y}
  blocks: [],      // per-block info, index = j*COLS+i
};

export const LAND = {
  garage: null,      // Vega Customs: delivery bay + door point
  hospital: null,    // Sunfall General: heal zone
  marina: null,      // marina pier tip (finale)
  raceStart: null,   // Boardwalk Blitz start line
  policeHQ: null,
  start: null,       // where a new game begins
};

const SIDE = 12; // sidewalk width inside each block

export function blockOrigin(i, j) { return { x: i * PITCH + ROAD, y: j * PITCH + ROAD }; }

function addBuilding(info, x, y, w, h, r, sign = null) {
  const b = {
    x, y, w, h,
    floors: 2 + Math.floor(r() * 6),
    color: BUILDING_COLORS[Math.floor(r() * BUILDING_COLORS.length)],
    roof: ROOF_COLORS[Math.floor(r() * ROOF_COLORS.length)],
    sign,
  };
  info.buildings.push(b);
  city.buildings.push(b);
}

function buildBlock(i, j, r) {
  const { x: bx, y: by } = blockOrigin(i, j);
  const inner = { x: bx + SIDE, y: by + SIDE, w: BLOCK - SIDE * 2, h: BLOCK - SIDE * 2 };
  const key = `${i},${j}`;
  const info = { i, j, kind: 'buildings', inner, buildings: [] };
  city.blocks[j * COLS + i] = info;

  if (key === '1,6') { // Vega Customs garage block
    info.kind = 'garage';
    addBuilding(info, inner.x, inner.y, 120, 90, r, 'VEGA CUSTOMS');
    LAND.garage = {
      bay: { x: bx + 150, y: by + 118 },
      door: { x: bx + 66, y: by + 108 },
      x: bx + BLOCK / 2, y: by + BLOCK / 2,
    };
    city.crates.push({ x: bx + 170, y: by + 40 }, { x: bx + 188, y: by + 58 }, { x: bx + 170, y: by + 76 });
    return;
  }
  if (key === '6,1') { // Sunfall General hospital
    info.kind = 'hospital';
    addBuilding(info, inner.x + 20, inner.y + 10, 160, 120, r, 'SUNFALL GENERAL');
    LAND.hospital = { x: bx + BLOCK / 2, y: by + 168, door: { x: bx + BLOCK / 2, y: by + 142 } };
    return;
  }
  if (key === '4,3') { // police headquarters
    info.kind = 'police';
    addBuilding(info, inner.x + 30, inner.y + 30, 150, 140, r, 'SFPD');
    LAND.policeHQ = { x: bx + BLOCK / 2, y: by + BLOCK / 2 };
    return;
  }
  if (key === '3,2' || key === '5,5') { // parks
    info.kind = 'park';
    city.parks.push({ ...inner });
    for (let n = 0; n < 7; n++) {
      city.palms.push({ x: inner.x + 20 + r() * (inner.w - 40), y: inner.y + 20 + r() * (inner.h - 40), s: 0.9 + r() * 0.4 });
    }
    return;
  }
  if (key === '2,4' || key === '6,6') { // parking lots
    info.kind = 'lot';
    city.lots.push({ ...inner });
    for (let row = 0; row < 2; row++) {
      for (let n = 0; n < 4; n++) {
        if (r() < 0.35) continue;
        city.parkSpots.push({
          x: inner.x + 30 + n * 48, y: inner.y + 44 + row * 96, angle: Math.PI / 2,
        });
      }
    }
    return;
  }

  // Ordinary block: one tower, a pair, or four walk-ups.
  const layout = r();
  if (layout < 0.34) {
    addBuilding(info, inner.x + 18, inner.y + 18, inner.w - 36, inner.h - 36, r);
  } else if (layout < 0.67) {
    const vertical = r() < 0.5;
    if (vertical) {
      addBuilding(info, inner.x + 8, inner.y + 10, inner.w / 2 - 16, inner.h - 20, r);
      addBuilding(info, inner.x + inner.w / 2 + 8, inner.y + 10, inner.w / 2 - 16, inner.h - 20, r);
    } else {
      addBuilding(info, inner.x + 10, inner.y + 8, inner.w - 20, inner.h / 2 - 16, r);
      addBuilding(info, inner.x + 10, inner.y + inner.h / 2 + 8, inner.w - 20, inner.h / 2 - 16, r);
    }
  } else {
    const qw = inner.w / 2 - 14, qh = inner.h / 2 - 14;
    addBuilding(info, inner.x + 6, inner.y + 6, qw, qh, r);
    addBuilding(info, inner.x + inner.w / 2 + 8, inner.y + 6, qw, qh, r);
    addBuilding(info, inner.x + 6, inner.y + inner.h / 2 + 8, qw, qh, r);
    addBuilding(info, inner.x + inner.w / 2 + 8, inner.y + inner.h / 2 + 8, qw, qh, r);
  }
  if (r() < 0.4) city.crates.push({ x: bx + 16 + r() * 30, y: by + BLOCK - 30 });
}

export function buildCity() {
  const r = rng(20261120);
  city.buildings.length = 0; city.palms.length = 0; city.crates.length = 0;
  city.lamps.length = 0; city.lots.length = 0; city.parks.length = 0;
  city.parkSpots.length = 0; city.shells.length = 0; city.foodCarts.length = 0;
  city.blocks.length = 0;

  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) buildBlock(i, j, r);

  // Curbside parking along a few road edges.
  for (let n = 0; n < 26; n++) {
    const vertical = r() < 0.5;
    const i = Math.floor(r() * COLS), j = Math.floor(r() * ROWS);
    if (vertical) {
      city.parkSpots.push({ x: roadCenter(i) + (r() < 0.5 ? -22 : 22), y: j * PITCH + ROAD + 30 + r() * (BLOCK - 60), angle: Math.PI / 2 });
    } else {
      city.parkSpots.push({ x: i * PITCH + ROAD + 30 + r() * (BLOCK - 60), y: roadCenter(j) + (r() < 0.5 ? -22 : 22), angle: 0 });
    }
  }

  // Palms: beach row, promenade, scattered sidewalk corners.
  for (let y = 60; y < GRID - 40; y += 92) city.palms.push({ x: BEACH_X + 44 + r() * 30, y: y + r() * 30, s: 1 + r() * 0.35 });
  for (let x = 120; x < GRID - 60; x += 150) city.palms.push({ x: x + r() * 40, y: GRID + 128 + r() * 16, s: 0.95 + r() * 0.3 });
  for (let n = 0; n < 30; n++) {
    const i = Math.floor(r() * COLS), j = Math.floor(r() * ROWS);
    const { x, y } = blockOrigin(i, j);
    city.palms.push({ x: x + (r() < 0.5 ? 8 : BLOCK - 8), y: y + (r() < 0.5 ? 8 : BLOCK - 8), s: 0.85 + r() * 0.3 });
  }

  // Street lamps at intersections.
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    city.lamps.push({ x: roadCenter(i) - ROAD / 2 + 5, y: roadCenter(j) - ROAD / 2 + 5 });
    city.lamps.push({ x: roadCenter(i) + ROAD / 2 - 5, y: roadCenter(j) + ROAD / 2 - 5 });
  }

  // Golden shells: ten keepsakes hidden in plain sight.
  const shellSpots = [
    [BEACH_X + 130, 130], [BEACH_X + 90, GRID - 200], [WATER_X - 60, GRID + 120],
    [PITCH * 3 + 40, PITCH * 2 + 40], [PITCH * 5 + BLOCK + 40, PITCH * 5 + 40],
    [PITCH + 40, PITCH * 6 + BLOCK + 40], [PITCH * 6 + 40, PITCH * 6 + BLOCK + 36],
    [PITCH * 2 + BLOCK + 36, PITCH * 4 + BLOCK + 36], [BEACH_X + 200, PITCH * 3 + 100],
    [PITCH * 7 + 60, PITCH + BLOCK + 30],
  ];
  shellSpots.forEach(([x, y], id) => city.shells.push({ id, x, y }));

  // Food carts along the boardwalk heal passers-by for a few dollars.
  city.foodCarts.push(
    { x: BEACH_X + 110, y: PITCH * 2 + 40 },
    { x: BEACH_X + 150, y: PITCH * 5 + 90 },
    { x: GRID - 300, y: GRID + 120 },
  );

  LAND.marina = { x: WATER_X - 30, y: WORLD_H - 130, pier: { x: WATER_X - 130, y: WORLD_H - 130 } };
  LAND.raceStart = { x: roadCenter(COLS - 1), y: GRID + 84 };
  LAND.start = { x: BEACH_X + 120, y: GRID + 84 };
}

// ---- collision ----------------------------------------------------------

// Push a circle out of every building/palm/crate near it and keep it out
// of the water and inside the world. Returns true if anything was hit.
export function collideCircle(p, radius) {
  let hit = false;
  if (p.x < radius) { p.x = radius; hit = true; }
  if (p.y < radius) { p.y = radius; hit = true; }
  if (p.x > WORLD_W - radius) { p.x = WORLD_W - radius; hit = true; }
  if (p.y > WORLD_H - radius) { p.y = WORLD_H - radius; hit = true; }
  if (p.x + radius > WATER_X + 4) { p.x = WATER_X + 4 - radius; hit = true; }

  const bi = Math.floor(p.x / PITCH), bj = Math.floor(p.y / PITCH);
  for (let j = bj - 1; j <= bj + 1; j++) {
    for (let i = bi - 1; i <= bi + 1; i++) {
      if (i < 0 || j < 0 || i >= COLS || j >= ROWS) continue;
      const info = city.blocks[j * COLS + i];
      if (!info) continue;
      for (const b of info.buildings) {
        if (resolveRect(p, radius, b)) hit = true;
      }
    }
  }
  for (const palm of city.palms) {
    const dx = p.x - palm.x, dy = p.y - palm.y;
    const d2 = dx * dx + dy * dy, rr = radius + 5;
    if (d2 < rr * rr && d2 > 0.01) {
      const d = Math.sqrt(d2);
      p.x = palm.x + (dx / d) * rr; p.y = palm.y + (dy / d) * rr;
      hit = true;
    }
  }
  for (const c of city.crates) {
    if (resolveRect(p, radius, { x: c.x - 9, y: c.y - 9, w: 18, h: 18 })) hit = true;
  }
  return hit;
}

function resolveRect(p, radius, b) {
  const nx = Math.max(b.x, Math.min(p.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(p.y, b.y + b.h));
  const dx = p.x - nx, dy = p.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > radius * radius) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    p.x = nx + (dx / d) * radius;
    p.y = ny + (dy / d) * radius;
  } else {
    // Centre inside the rect: leave by the shortest side.
    const left = p.x - b.x, right = b.x + b.w - p.x;
    const top = p.y - b.y, bottom = b.y + b.h - p.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) p.x = b.x - radius;
    else if (m === right) p.x = b.x + b.w + radius;
    else if (m === top) p.y = b.y - radius;
    else p.y = b.y + b.h + radius;
  }
  return true;
}

// A random point on a sidewalk (block perimeter) for pedestrian spawns.
export function randomSidewalkPoint(r) {
  const i = Math.floor(r() * COLS), j = Math.floor(r() * ROWS);
  const { x, y } = blockOrigin(i, j);
  const side = Math.floor(r() * 4), t = r() * BLOCK;
  if (side === 0) return { x: x + t, y: y + 6 };
  if (side === 1) return { x: x + t, y: y + BLOCK - 6 };
  if (side === 2) return { x: x + 6, y: y + t };
  return { x: x + BLOCK - 6, y: y + t };
}

// The four corners of a block's sidewalk loop, for strolling peds.
export function sidewalkCorners(i, j) {
  const { x, y } = blockOrigin(i, j);
  return [
    { x: x + 6, y: y + 6 }, { x: x + BLOCK - 6, y: y + 6 },
    { x: x + BLOCK - 6, y: y + BLOCK - 6 }, { x: x + 6, y: y + BLOCK - 6 },
  ];
}
