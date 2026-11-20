// Sunfall Heat — everything the eye sees of the world: camera, ground,
// roads, buildings, beach and sea, props, markers, and the cast. The
// HUD lives in hud.js; this file draws only the world itself.

import {
  PITCH, ROAD, BLOCK, COLS, ROWS, GRID, BEACH_X, WATER_X, WORLD_W, WORLD_H,
  PAL, clamp, lerp, dist, roadCenter,
} from './config.js';
import { city, LAND } from './city.js';
import { drawCar } from './vehicles.js';
import { drawPed } from './pedestrians.js';
import { drawBullets, drawParticles } from './combat.js';

export function makeCamera() {
  return { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 };
}

export function updateCamera(G, dt, viewW, viewH) {
  const cam = G.cam;
  const p = G.player;
  const focus = p.car || p;
  const look = p.car ? clamp(Math.abs(p.car.speed) * 0.34, 0, 130) : 26;
  const tx = focus.x + Math.cos(focus.angle || 0) * look;
  const ty = focus.y + Math.sin(focus.angle || 0) * look;
  const k = clamp(dt * (p.car ? 3.4 : 5.2), 0, 1);
  cam.x = lerp(cam.x || tx, tx, k);
  cam.y = lerp(cam.y || ty, ty, k);
  const targetZoom = p.car ? 0.8 : 1.0;
  cam.zoom = lerp(cam.zoom, targetZoom, clamp(dt * 2.4, 0, 1));
  G.shake = Math.max(0, G.shake - dt * 16);
  cam.shakeX = (Math.random() - 0.5) * G.shake;
  cam.shakeY = (Math.random() - 0.5) * G.shake;
  const vw = viewW / cam.zoom, vh = viewH / cam.zoom;
  cam.x = clamp(cam.x, vw / 2 - 240, WORLD_W - vw / 2 + 240);
  cam.y = clamp(cam.y, vh / 2 - 240, WORLD_H - vh / 2 + 240);
  cam.viewW = vw; cam.viewH = vh;
}

function viewRect(G) {
  const cam = G.cam;
  return {
    x0: cam.x - cam.viewW / 2 - 90, y0: cam.y - cam.viewH / 2 - 90,
    x1: cam.x + cam.viewW / 2 + 90, y1: cam.y + cam.viewH / 2 + 90,
  };
}
const inView = (v, x, y, m = 0) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;

export function drawWorld(ctx, G, viewW, viewH) {
  const cam = G.cam;
  ctx.fillStyle = PAL.waterDeep;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(viewW / cam.zoom / 2 - cam.x + cam.shakeX, viewH / cam.zoom / 2 - cam.y + cam.shakeY);
  const v = viewRect(G);
  drawGround(ctx, G, v);
  drawProps(ctx, G, v);
  drawMarkers(ctx, G);
  // Cast, roughly sorted by depth.
  for (const ped of G.peds) if (!ped.dead && inView(v, ped.x, ped.y, 30)) drawPed(ctx, ped, G.time);
  const cars = G.cars.filter((c) => !c.dead && inView(v, c.x, c.y, 80));
  cars.sort((a, b) => a.y - b.y);
  for (const car of cars) drawCar(ctx, car, G.time);
  if (!G.player.car) drawPlayer(ctx, G);
  drawBullets(ctx, G);
  drawParticles(ctx, G);
  ctx.restore();
  // Warm sunlight wash + vignette, in screen space.
  const grad = ctx.createRadialGradient(viewW * 0.32, viewH * 0.2, viewH * 0.3, viewW / 2, viewH / 2, viewH * 1.05);
  grad.addColorStop(0, 'rgba(255,190,90,0.10)');
  grad.addColorStop(1, 'rgba(40,16,60,0.20)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewW, viewH);
}

function drawGround(ctx, G, v) {
  // City grass base and the south promenade.
  ctx.fillStyle = PAL.grass;
  ctx.fillRect(0, 0, GRID + ROAD, GRID);
  ctx.fillStyle = PAL.road;
  ctx.fillRect(0, GRID, BEACH_X + ROAD, WORLD_H - GRID);
  ctx.fillStyle = PAL.sidewalk;
  ctx.fillRect(0, GRID + 118, BEACH_X + ROAD, 10);
  // Beach and sea.
  ctx.fillStyle = PAL.sand;
  ctx.fillRect(BEACH_X, 0, WATER_X - BEACH_X, WORLD_H);
  ctx.fillStyle = PAL.sandDark;
  ctx.fillRect(WATER_X - 26, 0, 26, WORLD_H);
  ctx.fillStyle = PAL.water;
  ctx.fillRect(WATER_X, 0, WORLD_W - WATER_X, WORLD_H);
  ctx.strokeStyle = PAL.foam;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  for (let y = 0; y <= WORLD_H; y += 46) {
    const x = WATER_X + 8 + Math.sin(G.time * 1.3 + y * 0.05) * 7;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 16, y + 18);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Marina pier.
  ctx.fillStyle = '#9a7648';
  ctx.fillRect(LAND.marina.pier.x - 90, LAND.marina.pier.y - 12, 190, 24);
  ctx.fillStyle = '#7d5f39';
  for (let x = LAND.marina.pier.x - 84; x < LAND.marina.pier.x + 96; x += 24) ctx.fillRect(x, LAND.marina.pier.y - 12, 3, 24);

  // Blocks: sidewalks, then inner ground by kind.
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const info = city.blocks[j * COLS + i];
      const bx = i * PITCH + ROAD, by = j * PITCH + ROAD;
      if (!inView(v, bx + BLOCK / 2, by + BLOCK / 2, BLOCK)) continue;
      ctx.fillStyle = PAL.sidewalk;
      ctx.fillRect(bx, by, BLOCK, BLOCK);
      ctx.strokeStyle = PAL.sidewalkEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, BLOCK - 2, BLOCK - 2);
      const inr = info.inner;
      if (info.kind === 'park') {
        ctx.fillStyle = '#5da24a';
        ctx.fillRect(inr.x, inr.y, inr.w, inr.h);
        ctx.strokeStyle = '#cbb98a';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(inr.x, inr.y + inr.h / 2); ctx.lineTo(inr.x + inr.w, inr.y + inr.h / 2);
        ctx.moveTo(inr.x + inr.w / 2, inr.y); ctx.lineTo(inr.x + inr.w / 2, inr.y + inr.h);
        ctx.stroke();
      } else if (info.kind === 'lot') {
        ctx.fillStyle = '#55565e';
        ctx.fillRect(inr.x, inr.y, inr.w, inr.h);
        ctx.strokeStyle = '#d8d4c4';
        ctx.lineWidth = 2;
        for (let rIdx = 0; rIdx < 2; rIdx++) {
          for (let n = 0; n < 4; n++) ctx.strokeRect(inr.x + 12 + n * 48, inr.y + 22 + rIdx * 96, 38, 62);
        }
      } else if (info.kind === 'garage' || info.kind === 'hospital' || info.kind === 'police') {
        ctx.fillStyle = '#b9b2a2';
        ctx.fillRect(inr.x, inr.y, inr.w, inr.h);
      } else {
        ctx.fillStyle = '#a9bd8a';
        ctx.fillRect(inr.x, inr.y, inr.w, inr.h);
      }
    }
  }

  drawRoads(ctx, G, v);

  // Garage drop-off bay and hospital apron.
  ctx.strokeStyle = '#ffd23e';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.arc(LAND.garage.bay.x, LAND.garage.bay.y, 42, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e33';
  ctx.fillRect(LAND.hospital.x - 4, LAND.hospital.y - 16, 8, 32);
  ctx.fillRect(LAND.hospital.x - 16, LAND.hospital.y - 4, 32, 8);

  // Buildings with a sun-side shadow.
  for (const b of city.buildings) {
    if (!inView(v, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    ctx.fillStyle = PAL.shadow;
    ctx.fillRect(b.x + 9, b.y + 11, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 7);
    // Window rows hint at the floors.
    ctx.fillStyle = 'rgba(40,50,70,0.35)';
    const rows = Math.min(4, b.floors);
    for (let rIdx = 0; rIdx < rows; rIdx++) {
      for (let wx = b.x + 14; wx < b.x + b.w - 12; wx += 22) {
        ctx.fillRect(wx, b.y + 16 + rIdx * ((b.h - 24) / rows), 9, 6);
      }
    }
    if (b.sign) {
      ctx.fillStyle = '#20242c';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
}

function drawRoads(ctx, G, v) {
  ctx.fillStyle = PAL.road;
  for (let i = 0; i < COLS; i++) {
    const x = i * PITCH;
    if (x + ROAD < v.x0 || x > v.x1) continue;
    ctx.fillRect(x, 0, ROAD, WORLD_H);
  }
  for (let j = 0; j < ROWS; j++) {
    const y = j * PITCH;
    if (y + ROAD < v.y0 || y > v.y1) continue;
    ctx.fillRect(0, y, BEACH_X + ROAD, ROAD);
  }
  // Edge lines and centre dashes.
  ctx.strokeStyle = PAL.lane;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < COLS; i++) {
    const cx = roadCenter(i);
    ctx.beginPath(); ctx.moveTo(cx - ROAD / 2 + 3, 0); ctx.lineTo(cx - ROAD / 2 + 3, WORLD_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + ROAD / 2 - 3, 0); ctx.lineTo(cx + ROAD / 2 - 3, WORLD_H); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#f5efce';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  for (let i = 0; i < COLS; i++) {
    const cx = roadCenter(i);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, WORLD_H); ctx.stroke();
  }
  for (let j = 0; j < ROWS; j++) {
    const cy = roadCenter(j);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(BEACH_X + ROAD, cy); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at intersections near the camera.
  ctx.fillStyle = PAL.crosswalk;
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const cx = roadCenter(i), cy = roadCenter(j);
      if (!inView(v, cx, cy, 80)) continue;
      for (let s = -24; s <= 24; s += 12) {
        ctx.fillRect(cx + s - 4, cy - ROAD / 2 + 2, 8, 10);
        ctx.fillRect(cx + s - 4, cy + ROAD / 2 - 12, 8, 10);
        ctx.fillRect(cx - ROAD / 2 + 2, cy + s - 4, 10, 8);
        ctx.fillRect(cx + ROAD / 2 - 12, cy + s - 4, 10, 8);
      }
    }
  }
}

function drawProps(ctx, G, v) {
  // Lamps
  ctx.fillStyle = '#3c414c';
  for (const lamp of city.lamps) {
    if (!inView(v, lamp.x, lamp.y, 20)) continue;
    ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
    ctx.fillStyle = '#ffe9a3';
    ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3c414c';
  }
  // Crates
  for (const c of city.crates) {
    if (!inView(v, c.x, c.y, 30)) continue;
    ctx.fillStyle = '#a4763f';
    ctx.fillRect(c.x - 9, c.y - 9, 18, 18);
    ctx.strokeStyle = '#7d5a2c';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - 9, c.y - 9, 18, 18);
    ctx.beginPath(); ctx.moveTo(c.x - 9, c.y - 9); ctx.lineTo(c.x + 9, c.y + 9); ctx.stroke();
  }
  // Palms: trunk and a star of fronds.
  for (const palm of city.palms) {
    if (!inView(v, palm.x, palm.y, 50)) continue;
    ctx.strokeStyle = PAL.palmTrunk;
    ctx.lineWidth = 4 * palm.s;
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(palm.x + 4, palm.y - 4); ctx.stroke();
    ctx.strokeStyle = PAL.palmLeaf;
    ctx.lineWidth = 3 * palm.s;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + palm.x * 0.01;
      ctx.beginPath();
      ctx.moveTo(palm.x + 4, palm.y - 4);
      ctx.quadraticCurveTo(
        palm.x + 4 + Math.cos(a) * 13 * palm.s, palm.y - 4 + Math.sin(a) * 13 * palm.s - 4,
        palm.x + 4 + Math.cos(a) * 21 * palm.s, palm.y - 4 + Math.sin(a) * 21 * palm.s + 3);
      ctx.stroke();
    }
  }
  // Food carts: striped awnings on the boardwalk.
  for (const cart of city.foodCarts) {
    if (!inView(v, cart.x, cart.y, 40)) continue;
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(cart.x - 14, cart.y - 9, 28, 18);
    ctx.fillStyle = '#ff5d47';
    for (let s = 0; s < 4; s++) ctx.fillRect(cart.x - 14 + s * 7, cart.y - 13, 4, 5);
    ctx.fillStyle = '#20242c';
    ctx.font = 'bold 7px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('EATS', cart.x, cart.y + 3);
  }
  // Golden shells still waiting.
  for (const shell of city.shells) {
    if (G.progress.shells.includes(shell.id)) continue;
    if (!inView(v, shell.x, shell.y, 30)) continue;
    const pulse = 1 + Math.sin(G.time * 4 + shell.id) * 0.18;
    ctx.fillStyle = '#ffe066';
    ctx.beginPath(); ctx.arc(shell.x, shell.y, 8 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d9a521';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(shell.x, shell.y, 4.5 * pulse, 0, Math.PI * 1.5); ctx.stroke();
  }
}

function drawMarkers(ctx, G) {
  const beam = (x, y, color, label) => {
    const grad = ctx.createLinearGradient(0, y - 190, 0, y);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x - 9, y - 190, 18, 190);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 20 + Math.sin(G.time * 5) * 3, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 20px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 42 - Math.sin(G.time * 5) * 3);
  };
  if (G.marker) beam(G.marker.x, G.marker.y, G.marker.color, G.marker.label);
  if (G.taxi.phase === 'dropoff' && G.taxi.dest) beam(G.taxi.dest.x, G.taxi.dest.y, '#57e389', '$');
  if (G.taxi.phase === 'pickup' && G.taxi.ped && !G.taxi.ped.dead) {
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI!', G.taxi.ped.x, G.taxi.ped.y - 24);
  }
  if (G.race.active) {
    const cp = G.race.cp;
    const { RACE_CPS } = G.raceCps;
    if (cp < RACE_CPS.length) beam(RACE_CPS[cp].x, RACE_CPS[cp].y, '#57e389', String(cp + 1));
  }
  // The standing contact, name overhead.
  if (G.offerNpc) {
    const n = G.offerNpc;
    ctx.fillStyle = 'rgba(50,35,15,0.25)';
    ctx.beginPath(); ctx.ellipse(n.x + 1, n.y + 3, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = n.shirt;
    ctx.beginPath(); ctx.ellipse(n.x, n.y, 7.5, 5.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath(); ctx.arc(n.x + 2.5, n.y, 4.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('!', n.x, n.y - 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui';
    ctx.fillText(n.name, n.x, n.y - 40);
  }
}

export function drawPlayer(ctx, G) {
  const p = G.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(50,35,15,0.28)';
  ctx.beginPath(); ctx.ellipse(1, 3, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(p.angle);
  const bob = Math.sin(p.walkPhase * 4) * (p.speedMag > 5 ? 1.5 : 0.3);
  // Legs
  ctx.strokeStyle = '#26324e';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-3 + bob, 5.4);
  ctx.moveTo(0, 0); ctx.lineTo(-3 - bob, -5.4);
  ctx.stroke();
  // Swing arc
  if (p.swingT > 0 && p.weapon === 'fists') {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(10, 0, 20, -0.9, 0.9); ctx.stroke();
  }
  // Torso: Juno's teal shirt.
  ctx.fillStyle = p.hurtT > 0 ? '#ff8a7a' : '#12b5a5';
  ctx.beginPath(); ctx.ellipse(0, 0, 8.2, 6.1, 0, 0, Math.PI * 2); ctx.fill();
  // Pistol in hand
  if (p.weapon === 'pistol') {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(6, 3.4, 11, 3.4);
    if (p.muzzleT > 0) {
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath(); ctx.arc(20, 5, 6, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Head + cap
  ctx.fillStyle = '#c68863';
  ctx.beginPath(); ctx.arc(2.5, 0, 4.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5d47';
  ctx.beginPath(); ctx.arc(2.5, 0, 4.4, Math.PI * 0.9, Math.PI * 2.05); ctx.fill();
  ctx.restore();
}
