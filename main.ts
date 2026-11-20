// Sunfall Heat — hand-in program for the gta6-01 bounty (Node 22,
// standard library only).
//
// The entry is the game/ folder: a complete top-down open-world crime
// game (Sunfall City, story missions, traffic, police, combat) written
// in plain JavaScript with Canvas 2D — no libraries, no network, fully
// offline. This program copies game/ and screenshots/ next to itself
// into the output directory and writes dossier.json there with the
// vendored make.fun library, so the judge can read the source, check
// the gate limits, and play the game.
//
// Run locally to play:   node serve.ts        (then open the URL it prints)
// Run to hand in:        node main.ts         (writes to /output)
//                        MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(name: string) {
  const from = join(repoDir, name);
  if (!existsSync(from)) return;
  cpSync(from, join(outDir, name), { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyTree('game');
copyTree('screenshots');

// The gate limits from the competition's scoring rules: at most 4
// screenshots of 256 KiB each, at most 993 game files totalling
// 48 MiB, no game path over 1000 bytes, and 160 KiB of source text in
// the dossier. buildDossier refuses anything over those caps.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
