// Sunfall Heat — entry point and conductor. Owns the game state, the
// frame loop, the mode machine (title / play / pause / busted /
// wasted), crime-event processing, and the ?scene= staging used to
// take honest screenshots of the game running.

import {
  GRID, BEACH_X, PLAYER_R, CAR_TYPES, clamp, dist, rand,
} from './config.js';
import { initInput, keys, hit, moveAxis, endFrame } from './input.js';
import { initAudio, sfx, engineStop, sirenStop } from './audio.js';
import { buildCity, city, LAND, collideCircle } from './city.js';
import {
  Car, spawnTrafficCar, spawnParkedCars, updateTraffic,
  enterCar, exitCar, updatePlayerCar, makePoliceCar,
} from './vehicles.js';
import { spawnPeds, updatePeds, scarePeds, Ped } from './pedestrians.js';
import { newWanted, addCrime, updatePolice } from './police.js';
import {
  playerAttack, updateBullets, updateParticles, damagePlayer, spawnParticles,
} from './combat.js';
import {
  initMissions, updateMissions, failMission, startRace, STORY, RACE_CPS,
} from './missions.js';
import { defaultProgress, loadProgress, saveProgress, clearProgress, hasSave } from './savegame.js';
import { makeCamera, updateCamera, drawWorld } from './render.js';
import { drawHUD, drawTitle, drawPause, drawEndScreen } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
addEventListener('resize', resize);
resize();

function newPlayer(x, y) {
  return {
    x, y, angle: Math.PI, hp: 100, car: null,
    weapon: 'fists', ammo: 0, hasPistol: false,
    attackReadyAt: 0, swingT: 0, muzzleT: 0, hurtT: 0, invulnUntil: 0,
    walkPhase: 0, speedMag: 0, lastHurtAt: -99,
  };
}

const G = {
  mode: 'title',
  time: 0,
  shake: 0,
  cam: makeCamera(),
  player: newPlayer(0, 0),
  cars: [], peds: [], bullets: [], parts: [],
  wanted: newWanted(),
  events: [],
  progress: defaultProgress(),
  ms: null, taxi: null, race: null, banner: null,
  marker: null, objective: '', prompt: '', taxiNote: '', offerNpc: null,
  raceCps: { RACE_CPS },
  spawnCopT: 0,
  endFine: 0,
  menu: { items: [], sel: 0 },
  crateUsed: new Map(),
  scene: null,
};

// ---- world setup ----------------------------------------------------------

function resetWorld(progress) {
  G.progress = progress;
  G.cars = []; G.peds = []; G.bullets = []; G.parts = []; G.events = [];
  G.wanted = newWanted();
  G.player = newPlayer(LAND.start.x, LAND.start.y);
  G.crateUsed = new Map();
  spawnParkedCars(G);
  for (let n = 0; n < 10; n++) spawnTrafficCar(G);
  spawnPeds(G, 26);
  initMissions(G);
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  G.time = 0;
}

function setMenu(items) { G.menu.items = items; G.menu.sel = 0; }

function toTitle() {
  G.mode = 'title';
  engineStop(); sirenStop();
  setMenu(hasSave() ? ['New Game', 'Continue'] : ['New Game']);
}

function startGame(progress) {
  initAudio();
  resetWorld(progress);
  G.mode = 'play';
  status.textContent = 'Sunfall Heat started.';
}

// ---- crime & consequence events ------------------------------------------

function processEvents() {
  for (const ev of G.events) {
    switch (ev.type) {
      case 'carjack': {
        const ped = new Ped(ev.car.x + 14, ev.car.y + 10);
        ped.state = 'flee'; ped.fleeT = 3;
        ped.tx = ped.x + rand(-260, 260); ped.ty = ped.y + rand(-260, 260);
        G.peds.push(ped);
        addCrime(G, 'carjack', ev.car.x, ev.car.y);
        scarePeds(G, ev.car.x, ev.car.y, 200);
        break;
      }
      case 'stole':
        addCrime(G, 'stole', ev.car.x, ev.car.y);
        break;
      case 'pedDown':
        if (ev.cause === 'melee') addCrime(G, 'meleePed', ev.at.x, ev.at.y);
        else if (ev.cause === 'car') addCrime(G, 'pedDown', ev.at.x, ev.at.y);
        scarePeds(G, ev.at.x, ev.at.y, 260);
        sfx.hit();
        break;
      case 'shot':
        addCrime(G, 'shot', ev.at.x, ev.at.y, true);
        break;
      case 'shotPolice':
        addCrime(G, 'bumpPolice', ev.at.x, ev.at.y, true);
        break;
      case 'crash':
        sfx.crash(ev.big);
        spawnParticles(G, ev.at.x, ev.at.y, ev.big ? 16 : 8, '#cfd4da', 170, 3, 0.5);
        if (G.player.car) damagePlayer(G, ev.big ? 7 : 2.5);
        else addCrime(G, 'crash', ev.at.x, ev.at.y);
        break;
      case 'bump':
        sfx.crash(false);
        spawnParticles(G, ev.at.x, ev.at.y, 6, '#ffd76a', 140, 2.4, 0.3);
        if (ev.other.kind === 'police') addCrime(G, 'bumpPolice', ev.at.x, ev.at.y, true);
        else addCrime(G, 'bumpCar', ev.at.x, ev.at.y);
        break;
      case 'busted': {
        if (G.mode !== 'play') break;
        const fine = Math.min(G.progress.cash, 60 + G.wanted.stars * 45);
        G.progress.cash -= fine;
        G.progress.stats.busts++;
        G.endFine = fine;
        failMission(G, 'The SFPD shut the job down');
        saveProgress(G.progress);
        G.mode = 'busted';
        engineStop(); sirenStop();
        sfx.sting();
        break;
      }
      case 'wasted': {
        if (G.mode !== 'play') break;
        const fine = Math.min(G.progress.cash, 85);
        G.progress.cash -= fine;
        G.endFine = fine;
        failMission(G, 'The job ended at Sunfall General');
        saveProgress(G.progress);
        G.mode = 'wasted';
        engineStop(); sirenStop();
        sfx.fail();
        break;
      }
    }
  }
  G.events.length = 0;
}

// Pedestrian traffic accidents: a car moving fast through a ped.
function checkRunOvers() {
  for (const car of G.cars) {
    if (car.dead || Math.abs(car.speed) < 95) continue;
    for (const ped of G.peds) {
      if (ped.state === 'down' || ped.state === 'passenger') continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 24) {
        ped.state = 'down';
        ped.downT = rand(5, 8);
        ped.speed = 0;
        if (car === G.player.car || car.kind === 'traffic') {
          G.events.push({ type: 'pedDown', ped, cause: 'car', at: { x: ped.x, y: ped.y } });
        }
        car.speed *= 0.9;
      }
    }
  }
}

// ---- player ----------------------------------------------------------------

function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const car of G.cars) {
    if (car.dead || car.kind === 'police') continue;
    const d = dist(G.player.x, G.player.y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function updatePlayer(dt) {
  const p = G.player;
  p.swingT = Math.max(0, p.swingT - dt);
  p.muzzleT = Math.max(0, p.muzzleT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  if (p.hurtT > 0) p.lastHurtAt = G.time;
  else if (G.time - p.lastHurtAt > 9 && p.hp > 0 && p.hp < 60) p.hp = Math.min(60, p.hp + 2.4 * dt);

  const inDialog = !!G.ms.dialog;

  if (p.car) {
    updatePlayerCar(G, dt, moveAxis());
    p.speedMag = Math.abs(p.car.speed);
    if (hit('e')) { exitCar(G); return; }
    if (hit('h')) sfx.horn();
    if (hit('t') && !G.race.active && dist(p.x, p.y, LAND.raceStart.x, LAND.raceStart.y) < 78) startRace(G);
    G.prompt = !G.race.active && dist(p.x, p.y, LAND.raceStart.x, LAND.raceStart.y) < 78
      ? 'T — Start the Boardwalk Blitz ($300 to win)' : '';
    return;
  }

  // On foot.
  const axis = moveAxis();
  const sprint = keys.has('shift');
  let vx = 0, vy = 0;
  if (!inDialog && (axis.x || axis.y)) {
    const len = Math.hypot(axis.x, axis.y);
    const speed = sprint ? 208 : 130;
    vx = (axis.x / len) * speed;
    vy = (axis.y / len) * speed;
    p.angle = Math.atan2(vy, vx);
    p.walkPhase += dt * speed / 11;
  }
  p.speedMag = Math.hypot(vx, vy);
  p.x += vx * dt;
  p.y += vy * dt;
  const pos = { x: p.x, y: p.y };
  collideCircle(pos, PLAYER_R);
  p.x = pos.x; p.y = pos.y;

  if (!inDialog && hit(' ', 'j')) playerAttack(G);
  if (hit('1')) { p.weapon = 'fists'; sfx.click(); }
  if (hit('2') && p.hasPistol) { p.weapon = 'pistol'; sfx.click(); }

  // Interactions and prompts.
  G.prompt = '';
  const car = nearestCar(56);
  if (car) G.prompt = `E — Enter the ${CAR_TYPES[car.type].name}`;
  if (hit('e')) {
    if (car) { enterCar(G, car); return; }
    for (const cart of city.foodCarts) {
      if (dist(p.x, p.y, cart.x, cart.y) < 44) {
        if (G.progress.cash >= 10 && p.hp < 100) {
          G.progress.cash -= 10;
          p.hp = Math.min(100, p.hp + 40);
          saveProgress(G.progress);
          sfx.cash();
        } else sfx.click();
        return;
      }
    }
  }
  if (!car) {
    for (const cart of city.foodCarts) {
      if (dist(p.x, p.y, cart.x, cart.y) < 44) G.prompt = 'E — Hot meal $10 (+40 HP)';
    }
  }
  // Hospital grounds patch you up for free.
  if (dist(p.x, p.y, LAND.hospital.x, LAND.hospital.y) < 70) {
    p.hp = Math.min(100, p.hp + 14 * dt);
    if (!G.prompt) G.prompt = 'Sunfall General — patching you up…';
  }
  // Crates by the garage hold a pistol and shells.
  city.crates.forEach((crate, i) => {
    const usedAt = G.crateUsed.get(i) || -99;
    if (G.time - usedAt < 45) return;
    if (dist(p.x, p.y, crate.x, crate.y) < 27) {
      G.crateUsed.set(i, G.time);
      p.hasPistol = true;
      p.ammo += 10;
      if (p.weapon === 'fists') p.weapon = 'pistol';
      sfx.pickup();
      spawnParticles(G, crate.x, crate.y, 10, '#ffd76a', 120, 2.6, 0.5);
    }
  });
}

// ---- modes -------------------------------------------------------------------

function respawn() {
  const p = G.player;
  if (p.car) { p.car = null; engineStop(); }
  if (G.mode === 'busted') {
    p.x = LAND.policeHQ.x; p.y = LAND.policeHQ.y + 130;
  } else {
    p.x = LAND.hospital.door.x; p.y = LAND.hospital.door.y + 26;
    p.hp = 100;
  }
  G.wanted = newWanted();
  for (const car of G.cars) if (car.kind === 'police') car.dead = true;
  G.cars = G.cars.filter((c) => !c.dead);
  G.mode = 'play';
}

function menuNav() {
  if (hit('w', 'arrowup', 's', 'arrowdown')) {
    const dir = hit('w', 'arrowup') ? -1 : 1;
    G.menu.sel = (G.menu.sel + dir + G.menu.items.length) % G.menu.items.length;
    sfx.click();
  }
}

function update(dt) {
  G.time += dt;
  if (G.mode === 'title') {
    menuNav();
    if (hit('enter')) {
      const sel = G.menu.items[G.menu.sel];
      if (sel === 'Continue') startGame(loadProgress() || defaultProgress());
      else { clearProgress(); startGame(defaultProgress()); }
    }
    return;
  }
  if (G.mode === 'busted' || G.mode === 'wasted') {
    if (hit('enter')) respawn();
    return;
  }
  if (G.mode === 'pause') {
    menuNav();
    if (hit('enter')) {
      const sel = G.menu.items[G.menu.sel];
      if (sel === 'Resume') G.mode = 'play';
      else if (sel === 'Save & Quit to Title') { saveProgress(G.progress); toTitle(); }
      else if (sel === 'Restart Story') { clearProgress(); startGame(defaultProgress()); }
    }
    if (hit('p', 'escape')) G.mode = 'play';
    return;
  }

  // Play.
  if (hit('p', 'escape')) {
    G.mode = 'pause';
    setMenu(['Resume', 'Save & Quit to Title', 'Restart Story']);
    engineStop(); sirenStop();
    return;
  }
  if (G.ms.dialog && hit('enter')) {
    G.ms.dialog.idx++;
    G.ms.dialogT = 0;
    if (G.ms.dialog.idx >= G.ms.dialog.lines.length) G.ms.dialog = null;
  }

  updatePlayer(dt);
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt);
  updateBullets(G, dt);
  updateParticles(G, dt);
  checkRunOvers();
  updateMissions(G, dt);
  processEvents();
  // Clean recycled entities.
  if (G.cars.some((c) => c.dead)) G.cars = G.cars.filter((c) => !c.dead);
  if (G.peds.some((pd) => pd.dead)) G.peds = G.peds.filter((pd) => !pd.dead);
}

function draw() {
  const W = canvas.width, H = canvas.height;
  if (G.mode === 'title') { drawTitle(ctx, G, W, H); return; }
  updateCamera(G, 1 / 60, W, H);
  drawWorld(ctx, G, W, H);
  drawHUD(ctx, G, W, H);
  if (G.mode === 'pause') drawPause(ctx, G, W, H);
  if (G.mode === 'busted') drawEndScreen(ctx, G, W, H, 'busted');
  if (G.mode === 'wasted') drawEndScreen(ctx, G, W, H, 'wasted');
}

// ---- screenshot staging -----------------------------------------------------

function stageScene(name) {
  const p = G.player;
  if (name === 'drive') {
    const car = new Car(700, 906, 0, 'parked', 1);
    G.cars.push(car);
    for (let n = 0; n < 6; n++) spawnTrafficCar(G, 906, 906);
    enterCar(G, car);
    car.speed = 232;
    G.events.length = 0;
    G.wanted = newWanted();
    G.progress.cash = 640;
  } else if (name === 'chase') {
    const car = new Car(880, 1208, 0, 'parked', 4);
    car.color = '#ffd23e';
    G.cars.push(car);
    enterCar(G, car);
    car.speed = 252;
    G.events.length = 0;
    for (const [ox, oy] of [[-170, -20], [-250, 18], [-340, -4]]) {
      const cop = makePoliceCar(car.x + ox, 1208 + oy);
      cop.angle = 0;
      cop.speed = 215;
      G.cars.push(cop);
    }
    G.wanted.heat = 3.6;
    G.ms.active = STORY[3];
    G.ms.stageIdx = 2;
    G.ms.stageState = { t: 0, got: 0, armed: true, age: 5 };
    G.progress.missionIndex = 3;
    G.offerNpc = null;
  } else if (name === 'beach') {
    p.x = BEACH_X + 120; p.y = GRID - 430;
    p.angle = -Math.PI / 2;
    for (let n = 0; n < 9; n++) {
      const ped = new Ped(p.x + rand(-200, 200), p.y + rand(-160, 190));
      G.peds.push(ped);
    }
    G.progress.cash = 385;
  } else if (name === 'mission') {
    G.progress.missionIndex = 1;
    const viper = G.cars.find((c) => c.isMissionCar);
    if (viper) {
      p.x = viper.x - 74; p.y = viper.y + 30;
      p.angle = Math.atan2(viper.y - p.y, viper.x - p.x);
    }
    G.ms.active = STORY[1];
    G.ms.stageIdx = 0;
    G.ms.stageState = { t: 0, got: 0, armed: false, age: 0 };
    G.offerNpc = null;
    G.progress.cash = 370;
  }
  G.mode = 'play';
}

// ---- boot ---------------------------------------------------------------------

// A handle for automated smoke tests and curious players in devtools.
window.__sunfall = G;

buildCity();
initInput();
toTitle();

const params = new URLSearchParams(location.search);
const scene = params.get('scene');
if (scene) {
  resetWorld(defaultProgress());
  stageScene(scene);
  G.scene = scene;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (G.mode === 'play' || G.mode === 'pause') update(dt);
  else { G.time += dt; handleMenuOnly(); }
  draw();
  endFrame();
  requestAnimationFrame(frame);
}
function handleMenuOnly() {
  if (G.mode === 'title' || G.mode === 'busted' || G.mode === 'wasted') {
    // Reuse the play-state updater for menus by running a stripped pass.
    update(0);
  }
}
requestAnimationFrame(frame);
