// Sunfall Heat — localStorage persistence. Only durable progress is
// saved: cash, reputation, the story-mission index, collected shells
// and lifetime stats. Position and wanted level always start fresh.

import { SAVE_KEY } from './config.js';

export function defaultProgress() {
  return {
    cash: 120,
    rep: 0,
    missionIndex: 0,     // next story mission to offer
    storyDone: false,
    shells: [],          // ids of golden shells already collected
    stats: { fares: 0, racesWon: 0, busts: 0, missionsDone: 0 },
  };
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const base = defaultProgress();
    return {
      ...base,
      ...data,
      stats: { ...base.stats, ...(data.stats || {}) },
      shells: Array.isArray(data.shells) ? data.shells : [],
    };
  } catch {
    return null;
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    // Storage can be unavailable (private mode); the game plays on.
  }
}

export function clearProgress() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function hasSave() {
  try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
}
