// Sunfall Heat — heads-up display and full-screen states: health, cash,
// wanted stars, weapon, objective line, the live minimap, dialogue,
// banners, and the title / pause / busted / wasted screens.

import {
  GRID, BEACH_X, WATER_X, WORLD_W, WORLD_H, PAL, clamp, roadCenter, COLS, ROWS,
} from './config.js';
import { WEAPONS } from './combat.js';

function panel(ctx, x, y, w, h, r = 10) {
  ctx.fillStyle = PAL.hudPanel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function star(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) { ctx.fillStyle = '#ffd23e'; ctx.fill(); }
  ctx.strokeStyle = filled ? '#a86e00' : 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

export function drawHUD(ctx, G, W, H) {
  const p = G.player;
  const prog = G.progress;

  // Hurt / low-health vignette.
  if (p.hurtT > 0 || p.hp < 32) {
    const a = p.hurtT > 0 ? 0.28 : 0.16 + Math.sin(G.time * 5) * 0.05;
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.85);
    grad.addColorStop(0, 'rgba(200,30,20,0)');
    grad.addColorStop(1, `rgba(200,30,20,${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Top-left: health, cash, reputation.
  panel(ctx, 14, 14, 216, 74);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('JUNO REYES', 26, 33);
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(26, 42, 180, 13);
  ctx.fillStyle = p.hp > 30 ? PAL.good : PAL.accent2;
  ctx.fillRect(26, 42, 180 * clamp(p.hp / 100, 0, 1), 13);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui';
  ctx.fillText(`${Math.ceil(p.hp)}`, 30, 53);
  ctx.font = 'bold 15px system-ui';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText(`$${prog.cash.toLocaleString('en-US')}`, 26, 76);
  ctx.fillStyle = '#9fd8e8';
  ctx.font = 'bold 12px system-ui';
  ctx.fillText(`REP ${prog.rep}`, 130, 76);

  // Top-right: wanted stars.
  if (G.wanted.stars > 0 || G.wanted.heat > 0.05) {
    panel(ctx, W - 196, 14, 182, 44);
    for (let i = 0; i < 5; i++) star(ctx, W - 172 + i * 34, 36, 13, i < G.wanted.stars);
    if (!G.wanted.seen && G.wanted.stars > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('losing them…', W - 105, 52);
    }
  }

  // Top-centre: mission + objective.
  const title = G.ms.active ? G.ms.active.title : (G.progress.storyDone ? 'Sunfall City' : 'Story');
  ctx.font = 'bold 13px system-ui';
  const tw = Math.max(280, ctx.measureText(G.objective || '').width + 56);
  panel(ctx, W / 2 - tw / 2, 14, tw, 52);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText(title.toUpperCase(), W / 2, 34);
  ctx.fillStyle = '#fff';
  ctx.font = '13px system-ui';
  ctx.fillText(G.objective || '', W / 2, 54);
  if (G.taxiNote && G.taxi.phase !== 'idle') {
    ctx.fillStyle = '#ffe9a3';
    ctx.font = '12px system-ui';
    ctx.fillText(G.taxiNote, W / 2, 82);
  }
  if (G.race.active) {
    ctx.fillStyle = '#57e389';
    ctx.font = 'bold 14px system-ui';
    ctx.fillText(`BLITZ ${G.race.t.toFixed(1)}s · checkpoint ${Math.min(G.race.cp + 1, 6)}/6`, W / 2, 82);
  }

  drawMinimap(ctx, G, 14, H - 178, 208, 164);

  // Bottom-right: weapon or speed.
  panel(ctx, W - 190, H - 62, 176, 48);
  ctx.textAlign = 'center';
  if (p.car) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 19px system-ui';
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.42)} km/h`, W - 102, H - 32);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui';
    const wname = WEAPONS[p.weapon].name.toUpperCase();
    ctx.fillText(p.weapon === 'pistol' ? `${wname} · ${p.ammo}` : wname, W - 102, H - 32);
  }

  // Bust meter.
  if (G.wanted.bust > 0.02) {
    panel(ctx, W / 2 - 130, H - 128, 260, 30);
    ctx.fillStyle = '#e33';
    ctx.fillRect(W / 2 - 120, H - 118, 240 * G.wanted.bust, 10);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', W / 2, H - 124 + 24);
  }

  // Context prompt.
  if (G.prompt) {
    ctx.font = 'bold 15px system-ui';
    const pw = ctx.measureText(G.prompt).width + 36;
    panel(ctx, W / 2 - pw / 2, H - 108, pw, 34);
    ctx.fillStyle = '#ffd23e';
    ctx.textAlign = 'center';
    ctx.fillText(G.prompt, W / 2, H - 86);
  }

  // Mission banner.
  if (G.banner) {
    const t = G.banner.t;
    const a = clamp(t > 2.9 ? (3.4 - t) * 2 : t, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 44px system-ui';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText(G.banner.text, W / 2, H * 0.3);
    ctx.font = 'bold 17px system-ui';
    ctx.fillStyle = '#fff';
    ctx.fillText(G.banner.sub, W / 2, H * 0.3 + 34);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // Dialogue box.
  if (G.ms.dialog) {
    const line = G.ms.dialog.lines[G.ms.dialog.idx];
    if (line) {
      panel(ctx, W / 2 - 330, H - 96, 660, 78, 12);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 13px system-ui';
      ctx.fillText(line[0], W / 2 - 312, H - 72);
      ctx.fillStyle = '#fff';
      ctx.font = '15px system-ui';
      wrapText(ctx, line[1], W / 2 - 312, H - 50, 624, 19);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('ENTER ▸', W / 2 + 312, H - 26);
    }
  }
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word; yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawMinimap(ctx, G, x, y, w, h) {
  panel(ctx, x - 4, y - 4, w + 8, h + 8, 12);
  const sx = w / WORLD_W, sy = h / WORLD_H;
  const X = (wx) => x + wx * sx, Y = (wy) => y + wy * sy;
  ctx.fillStyle = '#79b657';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#eed9a0';
  ctx.fillRect(X(BEACH_X), y, (WATER_X - BEACH_X) * sx, h);
  ctx.fillStyle = '#2e9db8';
  ctx.fillRect(X(WATER_X), y, (WORLD_W - WATER_X) * sx, h);
  // Roads
  ctx.strokeStyle = 'rgba(40,40,48,0.85)';
  ctx.lineWidth = 2;
  for (let i = 0; i < COLS; i++) {
    ctx.beginPath(); ctx.moveTo(X(roadCenter(i)), y); ctx.lineTo(X(roadCenter(i)), Y(GRID)); ctx.stroke();
  }
  for (let j = 0; j < ROWS; j++) {
    ctx.beginPath(); ctx.moveTo(x, Y(roadCenter(j))); ctx.lineTo(X(GRID), Y(roadCenter(j))); ctx.stroke();
  }
  const dot = (wx, wy, color, r = 3) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(X(wx), Y(wy), r, 0, Math.PI * 2); ctx.fill();
  };
  for (const car of G.cars) {
    if (car.dead) continue;
    if (car.kind === 'police') dot(car.x, car.y, '#ff3b30', 3.2);
    else if (car === G.player.car) continue;
    else dot(car.x, car.y, 'rgba(255,255,255,0.55)', 1.8);
  }
  if (G.taxi.phase === 'dropoff' && G.taxi.dest) dot(G.taxi.dest.x, G.taxi.dest.y, '#57e389', 4);
  if (G.taxi.phase === 'pickup' && G.taxi.ped) dot(G.taxi.ped.x, G.taxi.ped.y, '#ffd23e', 4);
  if (G.marker) dot(G.marker.x, G.marker.y, G.marker.color, 4.4);
  // Player arrow
  const p = G.player;
  const px = X(p.x), py = Y(p.y);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(p.car ? p.car.angle : p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = 'bold 9px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('SUNFALL CITY', x + 6, y + h - 6);
}

// ---- full screens ---------------------------------------------------------

function menuDraw(ctx, items, sel, cx, y0, gap = 46) {
  ctx.textAlign = 'center';
  items.forEach((item, i) => {
    const y = y0 + i * gap;
    if (i === sel) {
      ctx.fillStyle = 'rgba(255,181,46,0.9)';
      const w = ctx.measureText(item).width + 70;
      ctx.beginPath(); ctx.roundRect(cx - w / 2, y - 26, w, 38, 9); ctx.fill();
      ctx.fillStyle = '#20242c';
    } else ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = 'bold 21px system-ui';
    ctx.fillText(item, cx, y);
  });
}

export function drawTitle(ctx, G, W, H) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#7ec8e3');
  sky.addColorStop(0.55, '#ffd98a');
  sky.addColorStop(1, '#ff9e7a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // Sun
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath(); ctx.arc(W * 0.78, H * 0.24, 54, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,243,176,0.35)';
  ctx.beginPath(); ctx.arc(W * 0.78, H * 0.24, 84, 0, Math.PI * 2); ctx.fill();
  // Sea + skyline silhouettes
  ctx.fillStyle = '#2e9db8';
  ctx.fillRect(0, H * 0.78, W, H * 0.22);
  ctx.fillStyle = '#eed9a0';
  ctx.fillRect(0, H * 0.74, W, H * 0.05);
  ctx.fillStyle = 'rgba(38,44,64,0.85)';
  const base = H * 0.74;
  const towers = [[0.04, 150], [0.13, 210], [0.24, 120], [0.33, 250], [0.45, 170], [0.56, 230], [0.67, 130], [0.9, 190]];
  for (const [fx, th] of towers) ctx.fillRect(W * fx, base - th, 52, th);
  // Palms
  ctx.strokeStyle = 'rgba(24,50,32,0.9)';
  ctx.lineWidth = 5;
  for (const fx of [0.07, 0.93]) {
    const px = W * fx, py = base + 8;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 8, py - 60, px + 16, py - 92); ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * (0.15 + k * 0.14);
      ctx.beginPath();
      ctx.moveTo(px + 16, py - 92);
      ctx.quadraticCurveTo(px + 16 + Math.cos(a) * 26, py - 92 - Math.sin(a) * 22, px + 16 + Math.cos(a) * 44, py - 92 - Math.sin(a) * 26 + 12);
      ctx.stroke();
    }
  }
  // Title
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(90,30,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 92px system-ui';
  ctx.fillText('SUNFALL', W / 2, H * 0.3);
  ctx.fillStyle = '#ff5d47';
  ctx.font = 'bold 92px system-ui';
  ctx.fillText('HEAT', W / 2, H * 0.3 + 88);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(32,36,44,0.85)';
  ctx.font = '16px system-ui';
  ctx.fillText('An original open-world crime story in Sunfall City — steal cars, run jobs, outrun the SFPD.', W / 2, H * 0.3 + 126);

  menuDraw(ctx, G.menu.items, G.menu.sel, W / 2, H * 0.62);

  ctx.fillStyle = 'rgba(32,36,44,0.75)';
  ctx.font = '13px system-ui';
  ctx.fillText('WASD drive / walk · E enter car · SPACE attack · 1/2 weapons · SHIFT sprint · T race · P pause', W / 2, H - 26);
}

export function drawPause(ctx, G, W, H) {
  ctx.fillStyle = 'rgba(10,12,18,0.66)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 46px system-ui';
  ctx.fillText('PAUSED', W / 2, H * 0.3);
  menuDraw(ctx, G.menu.items, G.menu.sel, W / 2, H * 0.44);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '14px system-ui';
  const lines = [
    'CONTROLS — WASD / arrows: move & drive · SHIFT: sprint · E: enter / exit car, buy food',
    'SPACE or J: attack · 1: fists · 2: pistol (find ammo in crates by Vega Customs)',
    'T: start the Boardwalk Blitz at the south-east start line · P / ESC: pause',
    'Crimes raise your stars. Break sight with the SFPD and stay hidden to cool down.',
  ];
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, H * 0.68 + i * 22));
}

export function drawEndScreen(ctx, G, W, H, kind) {
  ctx.fillStyle = kind === 'busted' ? 'rgba(20,30,80,0.72)' : 'rgba(80,14,10,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'busted' ? '#9fd8e8' : '#ffb0a0';
  ctx.font = 'bold 74px system-ui';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', W / 2, H * 0.38);
  ctx.fillStyle = '#fff';
  ctx.font = '17px system-ui';
  const prog = G.progress;
  ctx.fillText(
    kind === 'busted'
      ? `The SFPD impounded your ride and fined you $${G.endFine}. Cash left: $${prog.cash}.`
      : `Sunfall General patched you up for $${G.endFine}. Cash left: $${prog.cash}.`,
    W / 2, H * 0.48);
  ctx.fillText(`Missions done: ${prog.stats.missionsDone} · Fares: ${prog.stats.fares} · Shells: ${prog.shells.length}/10`, W / 2, H * 0.54);
  ctx.font = 'bold 16px system-ui';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText('Press ENTER to get back out there', W / 2, H * 0.64);
}
