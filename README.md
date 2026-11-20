# Sunfall Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/sholaah/sunfall-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![reward](https://make.fun/badge/gta6-01/sholaah/sunfall-heat/reward.svg)](https://make.fun/bounty/gta6-01)

**Sunfall Heat** is an original top-down 2D open-world crime game that
runs entirely in the browser — vanilla JavaScript and Canvas 2D, no
libraries, no network requests, no build step. You are **Juno Reyes**,
back in sun-soaked **Sunfall City**: a coastal grid of art-deco blocks,
palm-lined boardwalks and one long beach, where fixer **Marisol Vega**
and old friend **Deke Kane** have work for a driver who is not afraid
of the **SFPD**.

## What is in the game

- **A city to explore** on foot and by car: an 8×8 road grid with
  intersections, crosswalks and lane discipline, sidewalks, parks,
  parking lots, landmarks (Vega Customs, Sunfall General hospital,
  SFPD headquarters, the marina), a beach and open sea.
- **Cars everywhere**: parked cars to steal, live traffic that follows
  the lanes, brakes for pedestrians and honks when blocked — walk up
  to any car, press **E**, and drive it with arcade physics.
- **Pedestrians** who stroll the sidewalks and boardwalk, and flee
  screaming from gunfire, fights and fast cars.
- **A 1–5 star wanted system**: witnessed crimes raise your heat,
  squad cars spawn and pursue, and breaking sight long enough cools
  things down. Get pinned and you are **busted**; crash too hard and
  you wake up **wasted** at the hospital — both cost cash.
- **Combat**: fists with a swing arc, plus a pistol (find it in the
  crates by Vega Customs) with muzzle flash, synthesized gunshots and
  particle hit feedback.
- **A five-mission story** — *First Wheels*, *Hot Property*,
  *Beach Run*, *The Set-Up* and *Sunfall Heat* — with named
  characters, dialogue, on-screen objectives and waypoint markers on
  the world and the minimap, paying cash and reputation.
- **Side activities**: taxi fares that spawn around you, the
  *Boardwalk Blitz* checkpoint race against the clock, and ten
  golden shells hidden around the city.
- **HUD and minimap**: health, cash, reputation, wanted stars, current
  weapon or speed, mission objective, and a live minimap showing
  streets, traffic, police, waypoints and fares.
- **Start screen, pause menu, and saving**: progress (cash, story
  progress, shells, stats) persists in `localStorage`.
- **Synthesized sound**: engine, sirens, horns, gunshots, pickups and
  mission stingers are all WebAudio — there are no audio files.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Shift | Sprint |
| E | Enter / exit car, buy food, heal stops |
| Space / J | Attack (fists or pistol) |
| 1 / 2 | Fists / pistol |
| H | Horn |
| T | Start the Boardwalk Blitz at the start line |
| P / Esc | Pause |

## Run it

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

Then open the URL in a desktop browser. To produce the hand-in
output (copies `game/` and `screenshots/` and writes `dossier.json`):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Structure

```
main.ts                  hand-in program (copies the game, writes dossier.json)
serve.ts                 local dev server for game/
game/index.html          page shell + canvas
game/src/config.js       world metrics, palette, car/ped data, helpers
game/src/input.js        keyboard state and edge triggers
game/src/audio.js        WebAudio-synthesized effects, engine and siren
game/src/city.js         Sunfall City generation and collision queries
game/src/vehicles.js     traffic AI, parked cars, player driving, car art
game/src/pedestrians.js  sidewalk crowds that stroll, flee and fall
game/src/police.js       wanted heat, squad spawns, pursuit, bust meter
game/src/combat.js       melee, pistol, bullets, particles, damage
game/src/missions.js     the five-mission story, taxi, race, shells
game/src/hud.js          HUD, minimap, dialogue, title/pause/end screens
game/src/savegame.js     localStorage progress
game/src/render.js       camera and world rendering
game/src/main.js         state, frame loop, modes, screenshot staging
screenshots/             four real renders of the game running
vendor/makefun-game.ts   the vendored make.fun dossier library
```

Everything in `game/` is original to this entry: the city, characters,
vehicles, names, story and art were written for Sunfall Heat and owe
nothing to any commercial game.
