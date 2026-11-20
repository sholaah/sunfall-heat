// Sunfall Heat — the SFPD. Crimes feed a heat meter that maps to 1–5
// stars; squad cars spawn off-screen, hunt the player's last seen
// position, and try to box the player in. Stay unseen and the heat
// bleeds away; get pinned at low speed and the bust meter fills.

import {
  COLS, ROWS, CAR_R, clamp, rand, dist, angleLerp, angleDelta,
} from './config.js';
import { collideCircle } from './city.js';
import { makePoliceCar, lanePoint } from './vehicles.js';
import { sirenStart, sirenSet, sirenStop } from './audio.js';

const HEAT_FOR_STARS = [0.05, 1.2, 2.6, 4.5, 7.0]; // index = stars-1 threshold
const SQUAD = [0, 2, 3, 4, 5, 6];

export function newWanted() {
  return {
    heat: 0, stars: 0, seen: false, timeSinceSeen: 99,
    lastSeenX: 0, lastSeenY: 0, bust: 0,
  };
}

export function starsFor(heat) {
  let s = 0;
  for (const t of HEAT_FOR_STARS) if (heat >= t) s++;
  return s;
}

// Witnesses: a conscious ped or a police car close enough to see it.
export function witnessed(G, x, y) {
  for (const ped of G.peds) {
    if (ped.state !== 'down' && dist(x, y, ped.x, ped.y) < 230) return true;
  }
  for (const car of G.cars) {
    if (car.kind === 'police' && dist(x, y, car.x, car.y) < 420) return true;
  }
  return false;
}

const CRIME_HEAT = {
  carjack: 1.1, stole: 0.7, pedDown: 1.3, meleePed: 0.9, shot: 0.8,
  bumpPolice: 1.0, bumpCar: 0.25, crash: 0.15, missionCrime: 1.6,
};

export function addCrime(G, kind, x, y, force = false) {
  const w = G.wanted;
  const seen = force || witnessed(G, x, y);
  if (!seen && kind !== 'shot') {
    w.heat += (CRIME_HEAT[kind] || 0.3) * 0.25; // rumours, not reports
    return;
  }
  w.heat += CRIME_HEAT[kind] || 0.3;
  w.lastSeenX = x; w.lastSeenY = y;
  w.timeSinceSeen = 0;
  w.stars = starsFor(w.heat);
}

function spawnCop(G) {
  const p = G.player;
  for (let tries = 0; tries < 12; tries++) {
    const i = clamp(Math.round(p.x / 294) + Math.floor(rand(-3, 4)), 0, COLS - 1);
    const j = clamp(Math.round(p.y / 294) + Math.floor(rand(-3, 4)), 0, ROWS - 1);
    const pt = lanePoint(i, j, 1, 0);
    const d = dist(pt.x, pt.y, p.x, p.y);
    if (d > 520 && d < 980) {
      const cop = makePoliceCar(pt.x, pt.y);
      cop.angle = Math.atan2(p.y - pt.y, p.x - pt.x);
      G.cars.push(cop);
      return cop;
    }
  }
  return null;
}

function updateCop(G, cop, dt) {
  const w = G.wanted;
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const dPlayer = dist(cop.x, cop.y, px, py);

  // Vision: close squad cars keep eyes on the player.
  if (dPlayer < 470) {
    w.lastSeenX = px; w.lastSeenY = py;
    w.timeSinceSeen = 0;
    w.seen = true;
  }
  const tx = w.lastSeenX, ty = w.lastSeenY;
  const dTarget = dist(cop.x, cop.y, tx, ty);

  const want = Math.atan2(ty - cop.y, tx - cop.x);
  const turn = clamp(angleDelta(cop.angle, want), -2.5 * dt, 2.5 * dt);
  cop.angle += turn;

  const topSpeed = 268 + w.stars * 14;
  let target = topSpeed;
  if (dTarget < 90) target = topSpeed * 0.35;          // arrived: circle the spot
  if (!p.car && dPlayer < 52) target = 0;              // don't run a suspect down
  if (p.car && dPlayer < 64) target = Math.abs(p.car.speed) * 0.92; // sit on the bumper

  if (cop.reverseT > 0) {
    cop.reverseT -= dt;
    cop.speed += clamp(-120 - cop.speed, -300 * dt, 300 * dt);
  } else {
    cop.speed += clamp(target - cop.speed, -380 * dt, 240 * dt);
  }
  const oldSpeed = cop.speed;
  cop.x += Math.cos(cop.angle) * cop.speed * dt;
  cop.y += Math.sin(cop.angle) * cop.speed * dt;

  for (const off of [cop.len * 0.32, -cop.len * 0.32]) {
    const pt = { x: cop.x + Math.cos(cop.angle) * off, y: cop.y + Math.sin(cop.angle) * off };
    if (collideCircle(pt, 15)) {
      cop.x += pt.x - (cop.x + Math.cos(cop.angle) * off);
      cop.y += pt.y - (cop.y + Math.sin(cop.angle) * off);
      cop.speed = -oldSpeed * 0.2;
      if (Math.abs(oldSpeed) < 26) cop.reverseT = 0.7; // wedged: back out
    }
  }
  const centre = { x: cop.x, y: cop.y };
  if (collideCircle(centre, CAR_R)) { cop.x = centre.x; cop.y = centre.y; }
}

export function updatePolice(G, dt) {
  const w = G.wanted;
  w.stars = starsFor(w.heat);
  w.timeSinceSeen += dt;
  w.seen = false;

  // Heat decay while unseen.
  if (w.heat > 0 && w.timeSinceSeen > 5) {
    w.heat = Math.max(0, w.heat - dt * 0.16);
    if (w.heat === 0 && w.stars > 0) G.events.push({ type: 'escaped' });
    w.stars = starsFor(w.heat);
  }

  const cops = G.cars.filter((c) => c.kind === 'police' && !c.dead);
  const want = SQUAD[w.stars];
  if (cops.length < want) {
    G.spawnCopT -= dt;
    if (G.spawnCopT <= 0) { spawnCop(G); G.spawnCopT = 1.6; }
  }
  let nearest = Infinity;
  for (const cop of cops) {
    const d = dist(cop.x, cop.y, G.player.x, G.player.y);
    nearest = Math.min(nearest, d);
    if (d > 1500 && w.timeSinceSeen > 4) { cop.dead = true; continue; }
    updateCop(G, cop, dt);
  }

  // Bust meter: pinned + close police = arrested.
  const p = G.player;
  const pinned = (!p.car && nearest < 66) ||
    (p.car && Math.abs(p.car.speed) < 26 && nearest < 84);
  if (w.stars > 0 && pinned) w.bust = Math.min(1, w.bust + dt * 0.5);
  else w.bust = Math.max(0, w.bust - dt * 0.3);
  if (w.bust >= 1) G.events.push({ type: 'busted' });

  // Siren follows the nearest squad car.
  if (nearest < 640 && w.stars > 0) {
    sirenStart();
    sirenSet(0.11 * (1 - nearest / 700));
  } else sirenStop();
}
