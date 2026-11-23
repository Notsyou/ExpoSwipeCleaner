import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Date-indexed freed-storage log ──────────────────────────────────────────
// One entry per successful delete: { t, date: 'YYYY-MM-DD' (local), bytes, count, mode, deck, sizesMeasured }
const KEY = 'swipe-cleaner:freed-log:v1';
const DAY_MS = 24 * 60 * 60 * 1000;

export const localDate = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const getFreedLog = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const appendFreed = async (entry) => {
  const log = await getFreedLog();
  const t = Date.now();
  log.push({ t, date: localDate(t), ...entry });
  try { await AsyncStorage.setItem(KEY, JSON.stringify(log)); } catch {}
  return log;
};

export const clearFreedLog = () => AsyncStorage.removeItem(KEY).catch(() => {});

// Last `days` calendar days, oldest first, zero-filled
export const dailyTotals = (log, days, now = Date.now()) => {
  const byDate = new Map();
  for (const e of log) {
    const cur = byDate.get(e.date) ?? { bytes: 0, count: 0 };
    cur.bytes += e.bytes ?? 0;
    cur.count += e.count ?? 0;
    byDate.set(e.date, cur);
  }
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = localDate(now - i * DAY_MS);
    out.push({ date, ...(byDate.get(date) ?? { bytes: 0, count: 0 }) });
  }
  return out;
};

export const freedSince = (log, sinceMs) =>
  log.filter((e) => e.t >= sinceMs).reduce((acc, e) => acc + (e.bytes ?? 0), 0);

// Tailoring variable: bytes freed in the last 7 days vs the 7 before
export const freedTrend = (log, now = Date.now()) => {
  const last7 = freedSince(log, now - 7 * DAY_MS);
  const prev7 = freedSince(log, now - 14 * DAY_MS) - last7;
  const lastDeleteAt = log.length ? log[log.length - 1].t : null;
  return { last7, prev7, total: freedSince(log, 0), lastDeleteAt };
};
