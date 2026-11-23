import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── JITAI-style launch decision engine ──────────────────────────────────────
//
// Decision point:  every app launch / return to the foreground (at most once per session)
// Tailoring vars:  from the cached summary (lib/summary.js) + this engine's own state:
//                  screenshot share & count, near-duplicate redundant count & bytes,
//                  bytes in the 25 largest photos, recoverable bytes, freed-storage trend,
//                  hours since the last banner, consecutive dismissals
// Decision rules (in order; the first that fails suppresses the banner):
//   1. condition      baseline days never show a banner                      -> 'baseline'
//   2. data           at least MIN_ANALYSED photos measured/analysed          -> 'not_enough_data'
//   3. spacing        >= MIN_GAP_HOURS since the last banner                  -> 'min_gap'
//   4. cooldown       after k consecutive dismissals/ignores, wait
//                     BASE_COOLDOWN_HOURS * 2^(k-1), capped at MAX_COOLDOWN_HOURS -> 'cooldown'
//   5. just cleaned   no banner within RECENT_CLEANUP_HOURS of a delete        -> 'recently_cleaned'
//   6. pressure       each advisory type has a pressure = value / threshold;
//                     the highest pressure >= 1 is shown, otherwise           -> 'below_threshold'
// Intervention options: one of three data-specific banners, or no banner (suppressed).
export const RULES = {
  MIN_ANALYSED: 50,
  MIN_GAP_HOURS: 20,
  BASE_COOLDOWN_HOURS: 24,
  MAX_COOLDOWN_HOURS: 168,
  RECENT_CLEANUP_HOURS: 12,
  SCREENSHOT_SHARE: 0.15,         // screenshots >= 15% of photo storage ...
  SCREENSHOT_MIN_COUNT: 10,       // ... and at least 10 left to review
  DUPLICATE_REDUNDANT: 10,        // >= 10 redundant near-duplicate photos
  LARGEST_BYTES: 200 * 1024 * 1024, // the 25 largest unreviewed photos use >= 200 MB
  IGNORE_AFTER_SWIPES: 3,         // banner left alone for 3 swipes counts as ignored
};

const HOUR = 60 * 60 * 1000;
const KEY = 'swipe-cleaner:advisor:v1';
const EMPTY = { lastShownAt: 0, consecutiveDismissals: 0, cooldownUntil: 0, lastActedAt: 0 };

export const fmtBytes = (b, approx = false) => {
  const pre = approx ? '~' : '';
  if (b >= 1024 ** 3) return `${pre}${(b / 1024 ** 3).toFixed(1)} GB`;
  return `${pre}${Math.max(1, Math.round(b / 1024 ** 2))} MB`;
};

// Three phrasings per advisory, picked at random each time and logged (micro-randomized):
//   numbers  leads with the count     benefit  leads with the space freed     short  one line
export const PHRASINGS = {
  screenshots: [
    { id: 'shots_numbers', title: (d) => `${d.count} screenshots are using ${d.bytes}`, body: () => 'Most are only needed once. Clear them out?' },
    { id: 'shots_benefit', title: (d) => `Free up ${d.bytes} in about a minute`, body: (d) => `Go through your ${d.count} screenshots and keep only what matters.` },
    { id: 'shots_short', title: (d) => `Screenshot cleanup: ${d.bytes}`, body: () => null },
  ],
  duplicates: [
    { id: 'dups_numbers', title: (d) => `${d.count} near-duplicate photos found`, body: (d) => `Keep the best shot of each and free ${d.bytes}.` },
    { id: 'dups_benefit', title: (d) => `Free ${d.bytes} by clearing repeat shots`, body: (d) => `${d.clusters} groups of similar photos. Keep one of each.` },
    { id: 'dups_short', title: (d) => `${d.count} repeat shots to clear`, body: () => null },
  ],
  largest: [
    { id: 'large_numbers', title: (d) => `Your ${d.count} largest photos use ${d.bytes}`, body: () => 'Start with the biggest files.' },
    { id: 'large_benefit', title: (d) => `Clear ${d.bytes} the fastest way`, body: () => 'Biggest files first, so every swipe frees more space.' },
    { id: 'large_short', title: (d) => `Biggest files first: ${d.bytes}`, body: () => null },
  ],
};

// What tapping each advisory opens
export const ACTIONS = {
  screenshots: { deck: 'screenshots', sort: 'newest', cta: 'Review screenshots' },
  duplicates: { deck: 'similar', sort: 'newest', cta: 'Review duplicates' },
  largest: { deck: 'all', sort: 'largest', cta: 'Biggest first' },
};

export const loadAdvisorState = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
};
const saveState = (s) => AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});

export const pressures = (summary) => {
  const s = summary.screenshots;
  const d = summary.duplicates;
  return {
    screenshots: s.pendingCount >= RULES.SCREENSHOT_MIN_COUNT ? s.share / RULES.SCREENSHOT_SHARE : 0,
    duplicates: d.redundantCount / RULES.DUPLICATE_REDUNDANT,
    largest: summary.largest.bytes / RULES.LARGEST_BYTES,
  };
};

// Pure: same inputs, same decision (randomness only picks the phrasing)
export const decide = ({ summary, state, condition, now = Date.now(), random = Math.random }) => {
  const base = { show: false, pressure: summary ? pressures(summary) : null };
  if (condition !== 'advisory') return { ...base, reason: 'baseline' };
  if (!summary || Math.max(summary.analysedPhotos, Math.round(summary.photos * summary.sizesMeasuredRatio)) < RULES.MIN_ANALYSED) {
    return { ...base, reason: 'not_enough_data' };
  }
  if (now - state.lastShownAt < RULES.MIN_GAP_HOURS * HOUR) return { ...base, reason: 'min_gap' };
  if (now < state.cooldownUntil) return { ...base, reason: 'cooldown' };
  const lastDelete = summary.freed?.lastDeleteAt;
  if (lastDelete && now - lastDelete < RULES.RECENT_CLEANUP_HOURS * HOUR) return { ...base, reason: 'recently_cleaned' };

  const p = base.pressure;
  const [type, value] = Object.entries(p).sort((a, b) => b[1] - a[1])[0];
  if (value < 1) return { ...base, reason: 'below_threshold' };

  const approx = summary.sizesMeasuredRatio < 0.9;
  const data = type === 'screenshots'
    ? { count: summary.screenshots.pendingCount, bytes: fmtBytes(summary.screenshots.pendingBytes, approx) }
    : type === 'duplicates'
      ? { count: summary.duplicates.redundantCount, clusters: summary.duplicates.clusters, bytes: fmtBytes(summary.duplicates.redundantBytes, approx) }
      : { count: summary.largest.count, bytes: fmtBytes(summary.largest.bytes, approx) };
  const options = PHRASINGS[type];
  const phrasing = options[Math.floor(random() * options.length)];
  return {
    ...base, show: true, reason: 'shown', type, phrasingId: phrasing.id,
    title: phrasing.title(data), body: phrasing.body(data), cta: ACTIONS[type].cta, action: ACTIONS[type],
  };
};

// ── Outcome bookkeeping ──────────────────────────────────────────────────────
export const recordShown = async (now = Date.now()) => {
  const s = await loadAdvisorState();
  await saveState({ ...s, lastShownAt: now });
};

// Dismissed (✕) or ignored (left alone): escalate the cooldown
export const recordDismissed = async (now = Date.now()) => {
  const s = await loadAdvisorState();
  const k = s.consecutiveDismissals + 1;
  const hours = Math.min(RULES.BASE_COOLDOWN_HOURS * 2 ** (k - 1), RULES.MAX_COOLDOWN_HOURS);
  await saveState({ ...s, consecutiveDismissals: k, cooldownUntil: now + hours * HOUR });
  return { consecutiveDismissals: k, cooldownHours: hours };
};

export const recordActed = async (now = Date.now()) => {
  const s = await loadAdvisorState();
  await saveState({ ...s, consecutiveDismissals: 0, cooldownUntil: 0, lastActedAt: now });
};

export const resetAdvisorState = () => AsyncStorage.removeItem(KEY).catch(() => {});
