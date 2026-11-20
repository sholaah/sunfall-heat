// Sunfall Heat — fists, one pistol, bullets and particles. Combat is
// deliberately simple and readable: a swing arcs in front of the
// player, the pistol fires hitscan-fast projectiles with a muzzle
// flash, and everything that gets hit says so with sparks and sound.

import { clamp, rand, dist } from './config.js';
import { collideCircle } from './city.js';
import { knockDown, scarePeds } from './pedestrians.js';
import { sfx } from './audio.js';

export const WEAPONS = {
  fists: { name: 'Fists', rate: 0.34 },
  pistol: { name: 'Pistol', rate: 0.26 },
};

// ---- particles ----------------------------------------------------------

export function spawnParticles(G, x, y, n, color, speed = 130, size = 3, life = 0.5, grav = 0) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(speed * 0.25, speed);
    G.parts.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(life * 0.5, life), maxLife: life,
      color, size: rand(size * 0.6, size * 1.3), grav,
    });
  }
}

export function updateParticles(G, dt) {
  for (const pt of G.parts) {
    pt.life -= dt;
    pt.vy += pt.grav * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= (1 - 1.6 * dt);
    pt.vy *= (1 - 1.6 * dt);
  }
  G.parts = G.parts.filter((pt) => pt.life > 0);
}

export function drawParticles(ctx, G) {
  for (const pt of G.parts) {
    ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

// ---- player attacks -----------------------------------------------------

export function playerAttack(G) {
  const p = G.player;
  if (p.car || G.time < p.attackReadyAt) return;
  const weapon = WEAPONS[p.weapon];
  p.attackReadyAt = G.time + weapon.rate;
  p.swingT = 0.18;

  if (p.weapon === 'pistol') {
    if (p.ammo <= 0) { sfx.dryFire(); return; }
    p.ammo--;
    p.muzzleT = 0.06;
    sfx.shot();
    G.shake = Math.min(7, G.shake + 2.2);
    const a = p.angle;
    G.bullets.push({
      x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18,
      vx: Math.cos(a) * 920, vy: Math.sin(a) * 920,
      life: 0.55, fromPlayer: true,
    });
    spawnParticles(G, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, 3, '#ffd76a', 90, 2.4, 0.18);
    scarePeds(G, p.x, p.y, 300);
    G.events.push({ type: 'shot', at: { x: p.x, y: p.y } });
    return;
  }

  // Melee: an arc in front of the player.
  sfx.swing();
  const range = 46;
  const fx = p.x + Math.cos(p.angle) * range * 0.7;
  const fy = p.y + Math.sin(p.angle) * range * 0.7;
  let hitSomething = false;
  for (const ped of G.peds) {
    if (ped.state !== 'down' && dist(fx, fy, ped.x, ped.y) < 30) {
      knockDown(G, ped, 'melee');
      spawnParticles(G, ped.x, ped.y, 6, '#ffffff', 110, 2.6, 0.35);
      hitSomething = true;
    }
  }
  for (const car of G.cars) {
    if (dist(fx, fy, car.x, car.y) < 40) {
      car.damage = Math.min(1, car.damage + 0.06);
      spawnParticles(G, fx, fy, 7, '#ffd76a', 150, 2.4, 0.3);
      sfx.hit();
      hitSomething = true;
    }
  }
  if (hitSomething) sfx.punch();
}

// ---- bullets ------------------------------------------------------------

function pointBlocked(x, y) {
  const pt = { x, y };
  collideCircle(pt, 2);
  return Math.abs(pt.x - x) > 0.01 || Math.abs(pt.y - y) > 0.01;
}

export function updateBullets(G, dt) {
  for (const b of G.bullets) {
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) continue;
    if (pointBlocked(b.x, b.y)) {
      spawnParticles(G, b.x, b.y, 5, '#e8ddc0', 120, 2.2, 0.3);
      b.life = 0;
      continue;
    }
    for (const ped of G.peds) {
      if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 13) {
        knockDown(G, ped, 'shot');
        spawnParticles(G, ped.x, ped.y, 8, '#d94f3d', 130, 3, 0.45);
        b.life = 0;
        break;
      }
    }
    if (b.life <= 0) continue;
    for (const car of G.cars) {
      if (!car.dead && dist(b.x, b.y, car.x, car.y) < 26) {
        car.damage = Math.min(1, car.damage + 0.07);
        spawnParticles(G, b.x, b.y, 6, '#ffd76a', 170, 2.4, 0.3);
        sfx.hit();
        if (car.kind === 'police') G.events.push({ type: 'shotPolice', at: { x: car.x, y: car.y } });
        b.life = 0;
        break;
      }
    }
  }
  G.bullets = G.bullets.filter((b) => b.life > 0);
}

export function drawBullets(ctx, G) {
  ctx.fillStyle = '#ffe9a3';
  for (const b of G.bullets) ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
}

// ---- damage -------------------------------------------------------------

export function damagePlayer(G, amount) {
  const p = G.player;
  if (G.time < p.invulnUntil) return;
  p.hp -= amount;
  p.hurtT = 0.35;
  p.invulnUntil = G.time + 0.4;
  G.shake = Math.min(9, G.shake + amount * 0.24);
  if (p.hp <= 0) {
    p.hp = 0;
    G.events.push({ type: 'wasted' });
  }
}
