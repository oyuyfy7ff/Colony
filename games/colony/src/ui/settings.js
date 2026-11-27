// Player settings (accessibility + audio), kept apart from the game save.
const KEY = 'pixel-colony-settings';
export const DEFAULTS = { music: 0.75, sfx: 0.8, shake: 1, reduceFlash: false };

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: settings last this session */ }
}
