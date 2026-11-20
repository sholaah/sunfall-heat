// Sunfall Heat — keyboard state. `keys` holds what is down right now,
// `pressed` holds what went down this frame (edge trigger for menus,
// entering cars, attacks). main.js clears `pressed` at the end of a frame.

export const keys = new Set();
export const pressed = new Set();

const GAME_KEYS = new Set([
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ',
]);

export function initInput() {
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (GAME_KEYS.has(k)) e.preventDefault();
    if (!e.repeat) pressed.add(k);
    keys.add(k);
  });
  addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
  });
  addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
  });
}

export function endFrame() { pressed.clear(); }

// Movement axes from WASD or arrows: x in -1..1, y in -1..1 (not normalised).
export function moveAxis() {
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  return { x, y };
}

export function down(...names) { return names.some((n) => keys.has(n)); }
export function hit(...names) { return names.some((n) => pressed.has(n)); }
