// Sunfall Heat — pedestrians. They stroll block perimeters and the
// boardwalk, chat in pairs, and run screaming from gunfire, fights and
// fast cars. A knocked-down ped stays down for a while, then gets up
// and limps off (unless the player keeps making things worse).

import {
  COLS, ROWS, GRID, BEACH_X, WATER_X, PED_SHIRTS, PED_PANTS,
  clamp, rand, choice, dist, angleLerp,
} from './config.js';
import { collideCircle, sidewalkCorners, randomSidewalkPoint } from './city.js';
import { sfx } from './audio.js';

let nextId = 1;

export class Ped {
  constructor(x, y) {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.angle = rand(0, Math.PI * 2);
    this.speed = 0;
    this.shirt = choice(PED_SHIRTS);
    this.pants = choice(PED_PANTS);
    this.skin = choice(['#f2c79b', '#c68863', '#8d5a3b', '#6e4429', '#ffd9b3']);
    this.state = 'stroll'; // stroll | flee | down | passenger
    this.tx = x; this.ty = y;
    this.waitT = rand(0, 2);
    this.fleeT = 0;
    this.downT = 0;
    this.walkPhase = rand(0, 6);
    this.dead = false;
    this.corner = 0;
    this.block = null;
  }
}

export function spawnPeds(G, count) {
  for (let n = 0; n < count; n++) {
    let ped;
    if (n % 4 === 3) {
      // Boardwalk crowd: sand path and promenade along the sea.
      ped = new Ped(rand(BEACH_X + 30, WATER_X - 60), rand(60, GRID + 120));
    } else {
      const p = randomSidewalkPoint(Math.random);
      ped = new Ped(p.x, p.y);
      ped.block = { i: Math.floor(p.x / 294), j: Math.floor(p.y / 294) };
    }
    pickTarget(G, ped);
    G.peds.push(ped);
  }
}

function pickTarget(G, ped) {
  if (ped.block) {
    const corners = sidewalkCorners(
      clamp(ped.block.i, 0, COLS - 1), clamp(ped.block.j, 0, ROWS - 1));
    ped.corner = (ped.corner + 1) % 4;
    const c = corners[ped.corner];
    ped.tx = c.x; ped.ty = c.y;
  } else {
    ped.tx = clamp(ped.x + rand(-260, 260), BEACH_X + 16, WATER_X - 26);
    ped.ty = clamp(ped.y + rand(-260, 260), 20, GRID + 140);
  }
}

// Something scary happened at (x,y): nearby peds run from it.
export function scarePeds(G, x, y, radius = 240) {
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.state === 'passenger') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      if (ped.state !== 'flee' && Math.random() < 0.5 && dist(ped.x, ped.y, G.player.x, G.player.y) < 380) sfx.scream();
      ped.state = 'flee';
      ped.fleeT = rand(1.6, 3.2);
      const a = Math.atan2(ped.y - y, ped.x - x);
      ped.tx = ped.x + Math.cos(a) * 320;
      ped.ty = ped.y + Math.sin(a) * 320;
    }
  }
}

export function knockDown(G, ped, cause) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downT = rand(5, 8);
  ped.speed = 0;
  G.events.push({ type: 'pedDown', ped, cause, at: { x: ped.x, y: ped.y } });
}

function updatePed(G, ped, dt) {
  if (ped.state === 'passenger') return;
  if (ped.state === 'down') {
    ped.downT -= dt;
    if (ped.downT <= 0) {
      ped.state = 'flee';
      ped.fleeT = 2;
      ped.tx = ped.x + rand(-200, 200);
      ped.ty = ped.y + rand(-200, 200);
    }
    return;
  }

  // A fast car or a swinging fist nearby is reason enough to run.
  if (ped.state === 'stroll') {
    const p = G.player;
    const threat = p.car && Math.abs(p.car.speed) > 150 ? p.car : null;
    if (threat && dist(ped.x, ped.y, threat.x, threat.y) < 90) {
      ped.state = 'flee'; ped.fleeT = rand(1.2, 2.2);
      const a = Math.atan2(ped.y - threat.y, ped.x - threat.x);
      ped.tx = ped.x + Math.cos(a) * 260; ped.ty = ped.y + Math.sin(a) * 260;
    }
  }

  const dx = ped.tx - ped.x, dy = ped.ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    if (ped.fleeT <= 0) { ped.state = 'stroll'; pickTarget(G, ped); }
  } else if (d < 8) {
    ped.waitT -= dt;
    ped.speed = 0;
    if (ped.waitT <= 0) { pickTarget(G, ped); ped.waitT = rand(0, 2.5); }
    return;
  }
  const want = ped.state === 'flee' ? 235 : 74;
  ped.speed += clamp(want - ped.speed, -300 * dt, 300 * dt);
  const dir = Math.atan2(dy, dx);
  ped.angle = angleLerp(ped.angle, dir, clamp(dt * 10, 0, 1));
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  ped.walkPhase += dt * (ped.speed / 12);
  const pos = { x: ped.x, y: ped.y };
  collideCircle(pos, 11);
  ped.x = pos.x; ped.y = pos.y;
}

export function updatePeds(G, dt) {
  // Recycle peds who wander too far from the action.
  for (const ped of G.peds) {
    if (ped.state !== 'passenger' && dist(ped.x, ped.y, G.player.x, G.player.y) > 1500) {
      const p = randomSidewalkPoint(Math.random);
      ped.x = G.player.x + (p.x - ped.x) * 0 + clamp(p.x, G.player.x - 700, G.player.x + 700);
      ped.y = clamp(p.y, G.player.y - 700, G.player.y + 700);
      ped.state = 'stroll';
      ped.block = { i: clamp(Math.floor(ped.x / 294), 0, COLS - 1), j: clamp(Math.floor(ped.y / 294), 0, ROWS - 1) };
      pickTarget(G, ped);
    }
    updatePed(G, ped, dt);
  }
}

export function drawPed(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  // Shadow
  ctx.fillStyle = 'rgba(50,35,15,0.25)';
  ctx.beginPath(); ctx.ellipse(1, 3, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-4, -2, 16, 5);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-13, -3, 10, 7);
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(-16, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(ped.walkPhase * 4) * (ped.speed > 5 ? 1.4 : 0.3);
  ctx.rotate(ped.angle);
  // Legs
  ctx.strokeStyle = ped.pants;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-3 + bob, 5);
  ctx.moveTo(0, 0); ctx.lineTo(-3 - bob, -5);
  ctx.stroke();
  // Torso
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 5.6, 0, 0, Math.PI * 2); ctx.fill();
  // Head
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(2.5, 0, 4.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (ped.state === 'flee') {
    ctx.fillStyle = '#ff5d47';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('!', ped.x, ped.y - 16 - Math.sin(time * 10) * 2);
  }
}
