import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from './db';
import { freedTrend, getFreedLog } from './freedLog';

// ─── Storage-composition summary ("one session behind") ──────────────────────
//
// Computed from the SQLite index while the app is open and saved to AsyncStorage.
// At launch the advisor reads only this cached summary, so the launch decision is
// instant and never waits on library analysis.
const KEY = 'swipe-cleaner:summary:v1';
const SCREENSHOT_ML_MIN_CONF = 0.9;   // ML label counts as a screenshot only when this sure
export const TOP_N_LARGEST = 25;

export const loadSummary = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// reviewed / trashed: Sets of photo ids the user already decided on
export const computeSummary = async ({ reviewed = new Set(), trashed = new Set() } = {}) => {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT id, kind, size, size_known, screenshot, ml_state, ml_class, ml_conf, cluster FROM media`);
  const photos = rows.filter((r) => r.kind === 'photo');
  const videos = rows.filter((r) => r.kind === 'video');
  const sum = (list) => list.reduce((acc, r) => acc + (r.size ?? 0), 0);
  const pending = (r) => !reviewed.has(r.id) && !trashed.has(r.id);
  const isShot = (r) => r.screenshot === 1 || (r.ml_class === 'screenshot' && (r.ml_conf ?? 0) >= SCREENSHOT_ML_MIN_CONF);

  const photoBytes = sum(photos);
  const shots = photos.filter(isShot);
  const shotsPending = shots.filter(pending);

  // Near-duplicate clusters: keep the largest member, the rest is redundant.
  // If the user already kept a member, every still-pending member is redundant.
  const clusters = new Map();
  for (const r of photos) {
    if (!r.cluster) continue;
    if (!clusters.has(r.cluster)) clusters.set(r.cluster, []);
    clusters.get(r.cluster).push(r);
  }
  let redundantCount = 0;
  let redundantBytes = 0;
  let clusterCount = 0;
  let largestCluster = 0;
  const redundantIds = new Set();
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const open = members.filter(pending);
    const keptOne = members.some((m) => reviewed.has(m.id));
    const extra = keptOne ? open : [...open].sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(1);
    if (!extra.length) continue;
    clusterCount++;
    largestCluster = Math.max(largestCluster, members.length);
    redundantCount += extra.length;
    redundantBytes += sum(extra);
    extra.forEach((m) => redundantIds.add(m.id));
  }

  const largest = photos.filter(pending).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, TOP_N_LARGEST);
  const recoverableBytes = sum(shotsPending.filter((r) => !redundantIds.has(r.id))) + redundantBytes;
  const trend = freedTrend(await getFreedLog());
  const measured = rows.filter((r) => r.size_known === 1).length;

  return {
    computedAt: Date.now(),
    photos: photos.length,
    videos: videos.length,
    photoBytes,
    videoBytes: sum(videos),
    totalBytes: photoBytes + sum(videos),
    sizesMeasuredRatio: rows.length ? measured / rows.length : 0,
    analysedPhotos: photos.filter((r) => r.ml_state === 1).length,
    screenshots: {
      count: shots.length, bytes: sum(shots),
      share: photoBytes ? sum(shots) / photoBytes : 0,
      pendingCount: shotsPending.length, pendingBytes: sum(shotsPending),
    },
    duplicates: { clusters: clusterCount, largestCluster, redundantCount, redundantBytes },
    largest: { count: largest.length, bytes: sum(largest) },
    recoverableBytes,
    freed: trend,
  };
};

export const saveSummary = async (summary) => {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(summary)); } catch {}
  return summary;
};
