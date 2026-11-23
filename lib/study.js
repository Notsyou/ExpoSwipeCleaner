import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Study mode (feasibility evaluation) ─────────────────────────────────────
//
//   'on'        advisory condition every day (banner + 24h reminder)
//   'off'       baseline: the purely reactive swipe app (no banner, no reminder)
//   'alternate' single-user ABAB design: day 0 baseline (A), day 1 advisory (B), ...
//               counted in local calendar days from the moment the mode was chosen
//
// Library analysis keeps running in every condition so both conditions log the
// same tailoring variables; only what the user sees changes.
const KEY = 'swipe-cleaner:study:v1';
const DAY_MS = 24 * 60 * 60 * 1000;

let settings = { mode: 'on', startedAt: Date.now() };
const listeners = new Set();

export const STUDY_MODES = [
  { key: 'on', label: 'Advisory on' },
  { key: 'off', label: 'Baseline (off)' },
  { key: 'alternate', label: 'Alternate daily' },
];

export const loadStudySettings = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) settings = { ...settings, ...JSON.parse(raw) };
  } catch {}
  return settings;
};

export const getStudySettings = () => settings;

export const setStudyMode = async (mode) => {
  settings = { mode, startedAt: Date.now() };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  listeners.forEach((fn) => fn(settings));
};

export const onStudyChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const localMidnight = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Day number since the mode was chosen (0-based), in local calendar days
export const studyDay = (now = Date.now()) =>
  Math.round((localMidnight(now) - localMidnight(settings.startedAt)) / DAY_MS);

// 'advisory' | 'baseline'
export const conditionFor = (now = Date.now()) => {
  if (settings.mode === 'off') return 'baseline';
  if (settings.mode === 'alternate') return studyDay(now) % 2 === 0 ? 'baseline' : 'advisory';
  return 'advisory';
};

export const conditionLabel = (now = Date.now()) => {
  const c = conditionFor(now);
  const name = c === 'advisory' ? 'Advisory' : 'Baseline';
  if (settings.mode !== 'alternate') return name;
  return `Day ${studyDay(now) + 1} · ${c === 'advisory' ? 'B' : 'A'} (${name.toLowerCase()})`;
};
