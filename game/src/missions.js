// Sunfall Heat — the story of Juno Reyes, told in five jobs for fixer
// Marisol Vega and old friend Deke Kane, plus the repeatable work that
// keeps Sunfall City alive: taxi fares, the Boardwalk Blitz street
// race, and ten golden shells hidden around town.
//
// A mission is a list of stages. Each stage knows where its marker is,
// what the objective line says, and when it is done. Side activities
// run underneath whatever the story is doing.

import {
  GRID, BEACH_X, clamp, dist, choice, FIRST_NAMES,
} from './config.js';
import { city, LAND } from './city.js';
import { addCrime } from './police.js';
import { spawnParticles } from './combat.js';
import { Ped } from './pedestrians.js';
import { saveProgress } from './savegame.js';
import { sfx } from './audio.js';

export const HERO = 'Juno Reyes';
export const MARISOL = 'Marisol Vega';
export const DEKE = 'Deke Kane';

const garageDoor = () => LAND.garage.door;
const garageBay = () => LAND.garage.bay;
const boardwalk = () => ({ x: BEACH_X + 170, y: GRID + 84 });

export const STORY = [
  {
    title: 'First Wheels',
    giver: DEKE,
    offer: boardwalk,
    intro: [
      [DEKE, 'Juno! You made it back to Sunfall. Still owe me for the boat thing.'],
      [DEKE, 'Easy money: a package washed up by the north beach. Grab it, drop it at Vega Customs.'],
      [HERO, 'Marisol still runs that garage? Fine — one job, Deke.'],
    ],
    stages: [
      { type: 'goto', x: BEACH_X + 120, y: 300, r: 58, text: 'Pick up the package on the north beach' },
      { type: 'goto', at: garageBay, r: 72, text: 'Deliver the package to Vega Customs' },
    ],
    outro: [
      [MARISOL, 'Deke talks too much, but the package is real. You drive clean, Juno.'],
      [MARISOL, 'Stick around. I may have steadier work than his beachcombing.'],
    ],
    reward: 250, rep: 5,
  },
  {
    title: 'Hot Property',
    giver: MARISOL,
    offer: garageDoor,
    intro: [
      [MARISOL, 'A collector left a yellow Viper GT in the Seabreeze lot, south-east corner.'],
      [MARISOL, 'My buyer wants it tonight. Take it — quietly if you can, loudly if you must.'],
    ],
    stages: [
      { type: 'takeCar', text: 'Steal the yellow Viper GT from the Seabreeze lot' },
      { type: 'deliverCar', at: garageBay, r: 76, text: 'Bring the Viper to Vega Customs', heat: 2.2 },
    ],
    outro: [
      [MARISOL, 'Pristine. The buyer wires double when the paint is untouched, you know.'],
    ],
    reward: 450, rep: 8,
  },
  {
    title: 'Beach Run',
    giver: MARISOL,
    offer: garageDoor,
    intro: [
      [MARISOL, 'Three crates came off a boat last night and scattered down the beach.'],
      [MARISOL, 'The tide — and the SFPD — will not wait. Collect all three, then the marina pier.'],
    ],
    stages: [
      {
        type: 'collect', r: 56, heat: 1.4,
        points: [
          { x: BEACH_X + 150, y: 620 }, { x: BEACH_X + 105, y: 1250 }, { x: BEACH_X + 165, y: 1900 },
        ],
        text: 'Collect the crates on the beach',
      },
      { type: 'goto', at: () => LAND.marina.pier, r: 70, text: 'Rendezvous at the marina pier' },
    ],
    outro: [
      [MARISOL, 'Every crate accounted for. The boat crew sends its regards — and this.'],
    ],
    reward: 550, rep: 10,
  },
  {
    title: 'The Set-Up',
    giver: DEKE,
    offer: garageDoor,
    intro: [
      [DEKE, 'Big meet, Juno. I need a driver I trust — pick me up at the garage, take me to the west lot.'],
      [DEKE, 'What could go wrong? Do not answer that.'],
    ],
    stages: [
      { type: 'goto', at: garageDoor, r: 60, needCar: true, text: 'Pick Deke up at Vega Customs (in a car)' },
      { type: 'goto', lotPoint: 0, r: 70, text: 'Drive Deke to the west parking lot' },
      { type: 'escape', text: 'It was an ambush — lose the SFPD!', heat: 3.4 },
    ],
    outro: [
      [DEKE, 'Half the force for one envelope. I am never telling you what was in it.'],
      [MARISOL, 'He is alive, the envelope is mine. That counts as a win in this town.'],
    ],
    reward: 800, rep: 14,
  },
  {
    title: 'Sunfall Heat',
    giver: MARISOL,
    offer: garageDoor,
    intro: [
      [MARISOL, 'Last job, Juno. A boat leaves the marina when the clock runs out.'],
      [MARISOL, 'Every unit in Sunfall will try to stop you. Drive like the city owes you money.'],
    ],
    stages: [
      { type: 'timerGoto', at: () => LAND.marina.pier, r: 74, time: 170, text: 'Reach the marina before the boat leaves!', heat: 5.4 },
    ],
    outro: [
      [MARISOL, 'You made the boat. Sunfall is yours now, Juno — try not to burn it down.'],
      [DEKE, 'Drinks at the boardwalk. You are buying. Obviously.'],
    ],
    reward: 1600, rep: 25,
  },
];

function stagePoint(stage) {
  if (stage.at) return stage.at();
  if (stage.lotPoint !== undefined) {
    const lot = city.lots[stage.lotPoint];
    return { x: lot.x + lot.w / 2, y: lot.y + lot.h / 2 };
  }
  return { x: stage.x, y: stage.y };
}

// ---- runtime ------------------------------------------------------------

export function initMissions(G) {
  G.ms = { active: null, stageIdx: 0, stageState: null, dialog: null, dialogT: 0, failNote: '' };
  G.taxi = { phase: 'idle', ped: null, dest: null, fare: 0, spawnT: 8 };
  G.race = { active: false, cp: 0, t: 0, best: 0 };
  G.banner = null;
  updateOffer(G);
}

function updateOffer(G) {
  const idx = G.progress.missionIndex;
  if (idx < STORY.length && !G.ms.active) {
    const m = STORY[idx];
    const p = m.offer();
    G.offerNpc = { x: p.x, y: p.y, name: m.giver, shirt: m.giver === MARISOL ? '#ff5d47' : '#ffd23e' };
  } else G.offerNpc = null;
}

function say(G, lines) {
  G.ms.dialog = { lines, idx: 0 };
  G.ms.dialogT = 0;
}

function setBanner(G, text, sub = '') {
  G.banner = { text, sub, t: 3.4 };
}

function startStage(G) {
  const ms = G.ms;
  const stage = ms.active.stages[ms.stageIdx];
  ms.stageState = { t: stage.time || 0, got: 0, armed: false, age: 0 };
  if (stage.heat) addCrime(G, 'missionCrime', G.player.x, G.player.y, true), G.wanted.heat = Math.max(G.wanted.heat, stage.heat);
  if (stage.type === 'escape') G.wanted.heat = Math.max(G.wanted.heat, stage.heat || 3);
}

function startMission(G, mission) {
  G.ms.active = mission;
  G.ms.stageIdx = 0;
  G.offerNpc = null;
  say(G, mission.intro);
  startStage(G);
}

function completeMission(G) {
  const m = G.ms.active;
  G.progress.cash += m.reward;
  G.progress.rep += m.rep;
  G.progress.stats.missionsDone++;
  G.progress.missionIndex++;
  if (G.progress.missionIndex >= STORY.length) G.progress.storyDone = true;
  saveProgress(G.progress);
  G.ms.active = null;
  say(G, m.outro);
  setBanner(G, 'MISSION COMPLETE', `${m.title}  ·  +$${m.reward}`);
  sfx.complete();
  spawnParticles(G, G.player.x, G.player.y - 10, 26, '#ffd23e', 190, 3.4, 0.9, -60);
  updateOffer(G);
}

export function failMission(G, why) {
  if (!G.ms.active) return;
  G.ms.active = null;
  G.ms.dialog = null;
  setBanner(G, 'MISSION FAILED', why);
  sfx.fail();
  updateOffer(G);
}

function advanceStage(G) {
  const ms = G.ms;
  ms.stageIdx++;
  if (ms.stageIdx >= ms.active.stages.length) completeMission(G);
  else {
    sfx.pickup();
    startStage(G);
  }
}

// ---- per-frame update ----------------------------------------------------

export function updateMissions(G, dt) {
  const ms = G.ms;
  const p = G.player;

  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }

  // Dialogue lines advance on a timer; gameplay waits politely.
  if (ms.dialog) {
    ms.dialogT += dt;
    if (ms.dialogT > 3.6) {
      ms.dialogT = 0;
      ms.dialog.idx++;
      if (ms.dialog.idx >= ms.dialog.lines.length) ms.dialog = null;
    }
    G.objective = ms.active ? stageText(G) : 'Free roam — find work around Sunfall City';
    G.marker = null;
    return;
  }

  // Standing offer: walk up to the glowing contact to start the next job.
  if (!ms.active) {
    updateOffer(G);
    if (G.offerNpc && !p.car && dist(p.x, p.y, G.offerNpc.x, G.offerNpc.y) < 44) {
      startMission(G, STORY[G.progress.missionIndex]);
      return;
    }
    G.objective = G.progress.storyDone
      ? 'Story complete — taxi fares, the Boardwalk Blitz and golden shells remain'
      : `Talk to ${STORY[G.progress.missionIndex].giver} to start “${STORY[G.progress.missionIndex].title}”`;
    G.marker = G.offerNpc ? { x: G.offerNpc.x, y: G.offerNpc.y, color: '#ffd23e', label: '!' } : null;
  } else {
    updateStage(G, dt);
  }

  updateTaxi(G, dt);
  updateRace(G, dt);
  updateShells(G);
}

function stageText(G) {
  const ms = G.ms;
  const stage = ms.active.stages[ms.stageIdx];
  let text = stage.text;
  if (stage.type === 'collect') text += `  (${ms.stageState.got}/${stage.points.length})`;
  if (stage.type === 'timerGoto') text += `  — ${Math.max(0, Math.ceil(ms.stageState.t))}s`;
  return text;
}

function updateStage(G, dt) {
  const ms = G.ms;
  const stage = ms.active.stages[ms.stageIdx];
  const st = ms.stageState;
  const p = G.player;
  st.age += dt;
  G.objective = stageText(G);

  if (stage.type === 'takeCar') {
    const target = G.cars.find((c) => c.isMissionCar && !c.dead);
    G.marker = target ? { x: target.x, y: target.y, color: '#ffd23e', label: '▼' } : null;
    if (p.car && p.car.isMissionCar) advanceStage(G);
    return;
  }
  if (stage.type === 'deliverCar') {
    const pt = stagePoint(stage);
    G.marker = { x: pt.x, y: pt.y, color: '#57e389', label: '▼' };
    if (p.car && p.car.isMissionCar && dist(p.x, p.y, pt.x, pt.y) < stage.r) advanceStage(G);
    return;
  }
  if (stage.type === 'collect') {
    const pt = stage.points[st.got];
    G.marker = { x: pt.x, y: pt.y, color: '#ffd23e', label: '▼' };
    if (dist(p.x, p.y, pt.x, pt.y) < stage.r) {
      st.got++;
      sfx.pickup();
      spawnParticles(G, pt.x, pt.y, 14, '#ffd23e', 150, 3, 0.6);
      if (st.got >= stage.points.length) advanceStage(G);
    }
    return;
  }
  if (stage.type === 'escape') {
    G.marker = null;
    if (st.age > 3 && G.wanted.stars === 0) advanceStage(G);
    return;
  }
  // goto / timerGoto
  const pt = stagePoint(stage);
  G.marker = { x: pt.x, y: pt.y, color: '#ffd23e', label: '▼' };
  if (stage.type === 'timerGoto') {
    st.t -= dt;
    if (st.t <= 0) {
      setBanner(G, 'TOO SLOW', 'The boat left — try the run again');
      sfx.fail();
      startStage(G); // same stage, fresh clock
      return;
    }
  }
  if (stage.needCar && !p.car) { G.objective = stage.text; return; }
  if (dist(p.x, p.y, pt.x, pt.y) < stage.r) advanceStage(G);
}

// ---- taxi ---------------------------------------------------------------

function updateTaxi(G, dt) {
  const taxi = G.taxi;
  const p = G.player;
  if (taxi.phase === 'idle') {
    taxi.spawnT -= dt;
    if (taxi.spawnT <= 0 && p.car && G.wanted.stars === 0) {
      // A fare appears on a sidewalk a few blocks away.
      const a = Math.random() * Math.PI * 2;
      const ped = new Ped(p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 300);
      ped.state = 'passenger';
      ped.shirt = '#ffd23e';
      G.peds.push(ped);
      taxi.ped = ped;
      taxi.phase = 'pickup';
      G.taxiNote = `${choice(FIRST_NAMES)} is waiting for a cab`;
    } else if (taxi.spawnT <= 0) taxi.spawnT = 6;
    return;
  }
  if (taxi.phase === 'pickup') {
    const ped = taxi.ped;
    if (!p.car) { releaseFare(G); return; }
    if (dist(p.x, p.y, ped.x, ped.y) < 46 && Math.abs(p.car.speed) < 30) {
      ped.dead = true;
      taxi.phase = 'dropoff';
      const a = Math.random() * Math.PI * 2, d = 620 + Math.random() * 500;
      taxi.dest = {
        x: clamp(p.x + Math.cos(a) * d, 90, GRID - 60),
        y: clamp(p.y + Math.sin(a) * d, 90, GRID + 90),
      };
      taxi.fare = Math.round(dist(p.x, p.y, taxi.dest.x, taxi.dest.y) * 0.09) + 6;
      sfx.door();
      G.taxiNote = `Fare aboard — $${taxi.fare} to the marker`;
    }
    return;
  }
  if (taxi.phase === 'dropoff') {
    if (!p.car) { releaseFare(G); return; }
    if (dist(p.x, p.y, taxi.dest.x, taxi.dest.y) < 58 && Math.abs(p.car.speed) < 40) {
      G.progress.cash += taxi.fare;
      G.progress.rep += 1;
      G.progress.stats.fares++;
      saveProgress(G.progress);
      sfx.cash();
      setBanner(G, 'FARE PAID', `+$${taxi.fare}`);
      taxi.phase = 'idle';
      taxi.ped = null;
      taxi.dest = null;
      taxi.spawnT = 14;
    }
  }
}

function releaseFare(G) {
  if (G.taxi.ped) { G.taxi.ped.state = 'stroll'; G.taxi.ped.dead = false; }
  G.taxi.phase = 'idle';
  G.taxi.ped = null;
  G.taxi.dest = null;
  G.taxi.spawnT = 10;
}

// ---- Boardwalk Blitz race -------------------------------------------------

export const RACE_CPS = [
  { x: 2090, y: 1980 }, { x: 2090, y: 1390 }, { x: 2090, y: 800 },
  { x: 2090, y: 210 }, { x: 1500, y: 32 }, { x: 620, y: 32 },
];
export const RACE_PAR = 45;

export function updateRace(G, dt) {
  const race = G.race;
  if (!race.active) return;
  race.t += dt;
  const p = G.player;
  if (!p.car) { race.active = false; setBanner(G, 'RACE OFF', 'You left the car'); return; }
  const cp = RACE_CPS[race.cp];
  if (dist(p.x, p.y, cp.x, cp.y) < 84) {
    sfx.pickup();
    spawnParticles(G, cp.x, cp.y, 12, '#57e389', 140, 3, 0.5);
    race.cp++;
    if (race.cp >= RACE_CPS.length) {
      race.active = false;
      const won = race.t <= RACE_PAR;
      if (won) {
        G.progress.cash += 300;
        G.progress.rep += 10;
        G.progress.stats.racesWon++;
        setBanner(G, 'BLITZ WON!', `${race.t.toFixed(1)}s — +$300`);
        sfx.complete();
      } else {
        G.progress.cash += 60;
        setBanner(G, 'BLITZ FINISHED', `${race.t.toFixed(1)}s — par is ${RACE_PAR}s · +$60`);
        sfx.cash();
      }
      saveProgress(G.progress);
    }
  }
}

export function startRace(G) {
  G.race.active = true;
  G.race.cp = 0;
  G.race.t = 0;
  setBanner(G, 'BOARDWALK BLITZ', `Beat ${RACE_PAR}s through the checkpoints`);
  sfx.complete();
}

// ---- golden shells --------------------------------------------------------

function updateShells(G) {
  const p = G.player;
  for (const shell of city.shells) {
    if (G.progress.shells.includes(shell.id)) continue;
    if (dist(p.x, p.y, shell.x, shell.y) < 32) {
      G.progress.shells.push(shell.id);
      G.progress.cash += 25;
      G.progress.rep += 2;
      saveProgress(G.progress);
      sfx.pickup();
      spawnParticles(G, shell.x, shell.y, 16, '#ffe066', 160, 3.2, 0.7);
      setBanner(G, 'GOLDEN SHELL', `${G.progress.shells.length}/10 · +$25`);
    }
  }
}
