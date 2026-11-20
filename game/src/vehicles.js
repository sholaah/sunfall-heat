// Sunfall Heat — cars: traffic that follows the road grid lane by lane,
// parked cars, and the arcade driving model for whichever car the
// player is sitting in. Police cars are built here too; police.js
// steers them.

import {
  COLS, ROWS, CAR_R, CAR_TYPES, CAR_COLORS, clamp, rand, choice,
  angleLerp, angleDelta, roadCenter, dist,
} from './config.js';
import { collideCircle, city } from './city.js';
import { sfx, engineStart, engineSet, engineStop } from './audio.js';

export const LANE = 16; // lane offset from road centre (right-hand traffic)

let nextId = 1;

export class Car {
  constructor(x, y, angle, kind, typeIndex = -1) {
    this.id = nextId++;
    this.x = x; this.y = y; this.angle = angle;
    this.speed = 0;
    this.kind = kind; // 'traffic' | 'parked' | 'police'
    this.type = typeIndex >= 0 ? typeIndex : Math.floor(rand(0, CAR_TYPES.length - 1));
    if (kind === 'police') this.type = 2;
    this.color = kind === 'police' ? '#f4f6f8' : choice(CAR_COLORS);
    this.len = this.type === 3 ? 56 : 46;
    this.damage = 0;
    this.dead = false;
    // Traffic navigation: grid heading (di,dj) and target intersection.
    this.di = 1; this.dj = 0;
    this.ti = 0; this.tj = 0;
    this.cruise = rand(92, 132);
    this.blockedFor = 0;
    this.honkAt = 0;
    this.steerVis = 0;
  }
  get topSpeed() { return CAR_TYPES[this.type].top; }
  front() { return { x: this.x + Math.cos(this.angle) * this.len * 0.32, y: this.y + Math.sin(this.angle) * this.len * 0.32 }; }
}

// The point in the correct lane at intersection (i,j) for a car heading (di,dj).
export function lanePoint(i, j, di, dj) {
  const rx = -dj, ry = di; // right-hand side of the heading
  return { x: roadCenter(i) + rx * LANE, y: roadCenter(j) + ry * LANE };
}

function setCourse(car, i, j, di, dj) {
  car.di = di; car.dj = dj; car.ti = i; car.tj = j;
}

// Place a traffic car on a random intersection course.
export function spawnTrafficCar(G, nearX, nearY) {
  let i = Math.floor(rand(0, COLS - 1)), j = Math.floor(rand(0, ROWS - 1));
  if (nearX !== undefined) {
    i = clamp(Math.round(nearX / 294) + Math.floor(rand(-3, 3)), 0, COLS - 1);
    j = clamp(Math.round(nearY / 294) + Math.floor(rand(-3, 3)), 0, ROWS - 1);
  }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let [di, dj] = choice(dirs);
  if (i + di < 0 || i + di >= COLS) di = -di;
  if (j + dj < 0 || j + dj >= ROWS) dj = -dj;
  const p = lanePoint(i, j, di, dj);
  const car = new Car(p.x, p.y, Math.atan2(dj, di), 'traffic');
  setCourse(car, i + di, j + dj, di, dj);
  G.cars.push(car);
  return car;
}

export function spawnParkedCars(G) {
  for (const spot of city.parkSpots) {
    if (Math.random() < 0.3) continue;
    const car = new Car(spot.x, spot.y, spot.angle, 'parked');
    G.cars.push(car);
  }
  // A collector's Viper GT sits in the Seabreeze lot — mission 2's target.
  const lot = city.lots[city.lots.length - 1];
  const viper = new Car(lot.x + 70, lot.y + 48, 0, 'parked', 4);
  viper.color = '#ffd23e';
  viper.isMissionCar = true;
  G.cars.push(viper);
}

export function makePoliceCar(x, y) {
  const car = new Car(x, y, 0, 'police', 2);
  car.color = '#f4f6f8';
  return car;
}

// ---- traffic ------------------------------------------------------------

function obstacleAhead(G, car, lookDist) {
  const hx = Math.cos(car.angle), hy = Math.sin(car.angle);
  const ax = car.x + hx * lookDist, ay = car.y + hy * lookDist;
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    if (dist(ax, ay, other.x, other.y) < 30) return other;
  }
  const p = G.player;
  if (!p.car && dist(ax, ay, p.x, p.y) < 26) return p;
  if (p.car && p.car !== car && dist(ax, ay, p.car.x, p.car.y) < 32) return p.car;
  for (const ped of G.peds) {
    if (!ped.down && dist(ax, ay, ped.x, ped.y) < 24) return ped;
  }
  return null;
}

function updateTrafficCar(G, car, dt) {
  const target = lanePoint(car.ti, car.tj, car.di, car.dj);
  const dx = target.x - car.x, dy = target.y - car.y;
  const d = Math.hypot(dx, dy);
  if (d < 14) {
    // Arrived at the intersection: pick the next leg (no U-turns unless cornered).
    const options = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (di === -car.di && dj === -car.dj) continue;
      const ni = car.ti + di, nj = car.tj + dj;
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
      options.push([di, dj, ni, nj]);
    }
    if (options.length === 0) setCourse(car, car.ti - car.di, car.tj - car.dj, -car.di, -car.dj);
    else {
      const [di, dj, ni, nj] = choice(options);
      setCourse(car, ni, nj, di, dj);
    }
  }
  const want = Math.atan2(dy, dx);
  car.angle = angleLerp(car.angle, want, clamp(dt * 5, 0, 1));

  const blocked = obstacleAhead(G, car, 52);
  const cruise = blocked ? 0 : car.cruise;
  if (blocked) {
    car.blockedFor += dt;
    if (car.blockedFor > 2.5 && G.time > car.honkAt && dist(car.x, car.y, G.player.x, G.player.y) < 420) {
      sfx.horn();
      car.honkAt = G.time + rand(3, 7);
    }
  } else car.blockedFor = 0;
  const accel = blocked ? 320 : 130;
  car.speed += clamp(cruise - car.speed, -accel * dt * 3, accel * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const p = { x: car.x, y: car.y };
  if (collideCircle(p, CAR_R)) { car.x = p.x; car.y = p.y; car.speed *= 0.6; }
}

export function updateTraffic(G, dt) {
  // Keep a living ring of traffic around the player; recycle the far ones.
  let near = 0;
  for (const car of G.cars) {
    if (car.kind !== 'traffic' || car.dead) continue;
    const d = dist(car.x, car.y, G.player.x, G.player.y);
    if (d < 1250) near++;
    if (d > 1700) car.dead = true;
  }
  for (let n = near; n < 11; n++) spawnTrafficCar(G, G.player.x, G.player.y);
  for (const car of G.cars) {
    if (car.kind === 'traffic' && !car.dead) updateTrafficCar(G, car, dt);
  }
}

// ---- player driving -----------------------------------------------------

export function enterCar(G, car) {
  const p = G.player;
  p.car = car;
  p.x = car.x; p.y = car.y;
  car.wasParked = car.kind === 'parked';
  if (car.kind === 'traffic') {
    car.kind = 'parked'; // driver bails out; pedestrians.js spawns the runner
    G.events.push({ type: 'carjack', car });
  } else if (car.wasParked) {
    G.events.push({ type: 'stole', car });
  }
  sfx.door();
  engineStart();
}

export function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  car.speed = 0;
  // Step out on the left side of the car.
  const lx = car.x + Math.cos(car.angle - Math.PI / 2) * 30;
  const ly = car.y + Math.sin(car.angle - Math.PI / 2) * 30;
  p.x = lx; p.y = ly;
  const spot = { x: p.x, y: p.y };
  collideCircle(spot, 13);
  p.x = spot.x; p.y = spot.y;
  p.car = null;
  sfx.door();
  engineStop();
}

export function updatePlayerCar(G, dt, input) {
  const car = G.player.car;
  if (!car) return;
  const type = CAR_TYPES[car.type];
  const fwd = input.y < 0, back = input.y > 0;
  let throttle = 0;
  if (fwd) { car.speed += type.accel * dt; throttle = 1; }
  else if (back) {
    if (car.speed > 12) car.speed -= 460 * dt; // braking
    else car.speed -= type.accel * 0.55 * dt;  // reverse
  }
  car.speed -= car.speed * 0.55 * dt; // drag
  if (!fwd && !back) car.speed -= car.speed * 0.8 * dt;
  car.speed = clamp(car.speed, -type.top * 0.38, type.top);

  const steer = input.x;
  const sf = clamp(car.speed / 130, -1, 1);
  car.angle += steer * type.turn * sf * dt * (car.speed < 0 ? -1 : 1);
  car.steerVis = steer;

  const oldSpeed = car.speed;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // Building collision sampled at the nose and tail.
  for (const off of [car.len * 0.32, -car.len * 0.32]) {
    const pt = { x: car.x + Math.cos(car.angle) * off, y: car.y + Math.sin(car.angle) * off };
    if (collideCircle(pt, 15)) {
      car.x += pt.x - (car.x + Math.cos(car.angle) * off);
      car.y += pt.y - (car.y + Math.sin(car.angle) * off);
      if (Math.abs(oldSpeed) > 130) {
        G.events.push({ type: 'crash', big: Math.abs(oldSpeed) > 230, at: { x: car.x, y: car.y } });
        car.damage = Math.min(1, car.damage + Math.abs(oldSpeed) / 900);
      }
      car.speed = -oldSpeed * 0.22;
    }
  }
  const centre = { x: car.x, y: car.y };
  if (collideCircle(centre, CAR_R)) { car.x = centre.x; car.y = centre.y; }

  // Bumping other cars.
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    const min = 40;
    if (d < min && d > 0.01) {
      const push = (min - d) / 2;
      const nx = (car.x - other.x) / d, ny = (car.y - other.y) / d;
      car.x += nx * push; car.y += ny * push;
      other.x -= nx * push; other.y -= ny * push;
      if (Math.abs(car.speed) > 90) {
        G.events.push({ type: 'bump', other, at: { x: other.x, y: other.y } });
        other.damage = Math.min(1, other.damage + 0.12);
        car.speed *= 0.55;
      } else car.speed *= 0.8;
    }
  }

  G.player.x = car.x; G.player.y = car.y;
  engineSet(Math.abs(car.speed) / type.top, throttle);
}

// ---- drawing ------------------------------------------------------------

export function drawCar(ctx, car, time) {
  const { len } = car;
  const wid = car.type === 3 ? 26 : 23;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow
  ctx.fillStyle = 'rgba(50,35,15,0.28)';
  ctx.beginPath(); ctx.ellipse(3, 5, len / 2, wid / 2, 0, 0, Math.PI * 2); ctx.fill();
  // Wheels
  ctx.fillStyle = '#17181c';
  const wx = len / 2 - 11, wy = wid / 2 - 2;
  for (const [x, y] of [[-wx, -wy], [wx, -wy], [-wx, wy], [wx, wy]]) {
    ctx.fillRect(x - 5, y - 3, 10, 6);
  }
  // Body
  ctx.fillStyle = car.color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, -len / 2, -wid / 2, len, 5, 7); ctx.fill();
  // Cabin + glass
  ctx.fillStyle = '#22303e';
  roundRect(ctx, -len * 0.18, -wid / 2 + 3, len * 0.36, wid - 6, 4); ctx.fill();
  ctx.fillStyle = '#9fd8e8';
  roundRect(ctx, len * 0.06, -wid / 2 + 4, len * 0.1, wid - 8, 3); ctx.fill();
  // Police livery: black doors and a light bar.
  if (car.kind === 'police') {
    ctx.fillStyle = '#20242c';
    roundRect(ctx, -len * 0.16, -wid / 2 + 3, len * 0.3, wid - 6, 4); ctx.fill();
    const flash = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3b30' : '#7a130d';
    ctx.fillRect(-7, -wid / 2 + 4, 6, wid / 2 - 4);
    ctx.fillStyle = flash ? '#2f7bff' : '#123a7a';
    ctx.fillRect(1, -wid / 2 + 4, 6, wid / 2 - 4);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 7px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('SFPD', 0, 2.5);
  }
  // Taxi sign
  if (car.type === 5) {
    ctx.fillStyle = '#ffd23e';
    ctx.fillRect(-6, -4, 12, 8);
    ctx.fillStyle = '#20242c';
    ctx.font = 'bold 6px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2);
  }
  // Headlights
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 5);
  ctx.fillRect(len / 2 - 2, wid / 2 - 8, 3, 5);
  ctx.fillStyle = '#e33';
  ctx.fillRect(-len / 2 - 1, -wid / 2 + 3, 3, 5);
  ctx.fillRect(-len / 2 - 1, wid / 2 - 8, 3, 5);
  // Damage smoke stain
  if (car.damage > 0.45) {
    ctx.fillStyle = 'rgba(30,30,30,0.35)';
    ctx.beginPath(); ctx.arc(len / 2 - 6, 0, 7 + car.damage * 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
