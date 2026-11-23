import AsyncStorage from '@react-native-async-storage/async-storage';
import { conditionFor, getStudySettings } from './study';

// ─── Interaction log (append-only) ────────────────────────────────────────────
//
// One log for everything the evaluation needs. Each entry:
//   { t, event, condition, studyMode, ...data }
// Events:
//   session_start / session_end            { durationMs, kept, trashed }
//   banner_shown                           { advisory, phrasingId, pressure, summaryAgeMs }
//   banner_suppressed                      { reason }
//   banner_acted / banner_dismissed / banner_ignored  { advisory, phrasingId, afterMs }
//   reminder_scheduled / reminder_shown / reminder_acted / reminder_dismissed  { phrasingId }
//   bytes_freed                            { bytes, count, mode, deck, sort, sizesMeasured }
//   sort_used                              { sort, deck }
//   filter_changed                         { deck, type }
//   deck_reset                             { deck, restored }
// Kept in memory and written in the background; capped so storage can't grow forever.
const KEY = 'swipe-cleaner:events:v1';
const LIMIT = 20000;
const FLUSH_MS = 800;

let log = null;
let loading = null;
let flushTimer = null;

const load = () => {
  if (log) return Promise.resolve(log);
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((raw) => { log = raw ? JSON.parse(raw) : []; })
      .catch(() => { log = []; })
      .then(() => log);
  }
  return loading;
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    AsyncStorage.setItem(KEY, JSON.stringify(log.slice(-LIMIT))).catch(() => {});
  }, FLUSH_MS);
};

export const logEvent = (event, data = {}) => {
  const entry = { t: Date.now(), event, condition: conditionFor(), studyMode: getStudySettings().mode, ...data };
  load().then(() => {
    log.push(entry);
    if (log.length > LIMIT * 1.1) log = log.slice(-LIMIT);
    scheduleFlush();
  });
};

// Write immediately (app going to background)
export const flushEvents = async () => {
  if (!log) return;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  try { await AsyncStorage.setItem(KEY, JSON.stringify(log.slice(-LIMIT))); } catch {}
};

export const getEvents = async () => [...(await load())];

export const clearEvents = async () => {
  await load();
  log = [];
  await flushEvents();
};

const csvCell = (v) => {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Flat CSV: fixed columns first, then every other field that appears in the log
export const eventsToCsv = (events) => {
  const fixed = ['t', 'time_iso', 'event', 'condition', 'studyMode'];
  const extra = [...new Set(events.flatMap((e) => Object.keys(e)))].filter((k) => !fixed.includes(k)).sort();
  const header = [...fixed, ...extra];
  const rows = events.map((e) => header.map((k) => csvCell(k === 'time_iso' ? new Date(e.t).toISOString() : e[k])).join(','));
  return [header.join(','), ...rows].join('\n');
};
