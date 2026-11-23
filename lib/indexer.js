import { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import { deleteRows, estimateSize, getDb, getMeta, setMeta } from './db';
import { DUPLICATE_THRESHOLD, embedPhoto, isEmbedderReady, onEmbedderStatus, vecSimilarity } from './ml/embedder';
import { isScreenshot } from './progress';

// ─── Incremental library analysis ────────────────────────────────────────────
//
// Runs only while the app is open, in small steps, and backs off while the user is
// swiping (see setBusyProbe). Work is resumable across sessions: every result is
// stored in SQLite, so each launch continues where the last one stopped.
//   1. sync      page through the library, add new assets, prune deleted ones
//   2. measure   real file size of each asset (Expo Go doesn't report sizes)
//   3. analyse   photos only: on-device embedding + class, then near-duplicate clustering
// Newest assets go first in every step.
const SYNC_PAGE = 250;
const WORK_BATCH = 8;
const NEIGHBOR_WINDOW_MS = 2 * 60 * 60 * 1000;   // compare photos taken within 2 h of each other
const NEIGHBOR_LIMIT = 40;
const IDLE_STEP_MS = 25;
const BUSY_RETRY_MS = 600;

let running = false;
let stopRequested = false;
let busyProbe = () => false;
let status = { phase: 'idle', total: 0, photos: 0, measured: 0, analysed: 0, unavailable: 0, clustered: 0, lastError: null };
const listeners = new Set();
const clusterOf = new Map();         // photo id -> cluster root (only ids in clusters)
const clusterSizes = new Map();      // root -> member count
let onProgressCb = null;

const emit = (patch) => {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn(status));
};
export const getIndexStatus = () => status;
export const onIndexStatus = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const setBusyProbe = (fn) => { busyProbe = fn; };
// Called every so often with fresh work done, so the summary can be refreshed
export const onIndexProgress = (fn) => { onProgressCb = fn; };

// Near-duplicate lookups used by the Similar deck (synchronous, in memory)
export const clusterIdOf = (id) => clusterOf.get(id) ?? null;
export const isInCluster = (id) => {
  const root = clusterOf.get(id);
  return !!root && (clusterSizes.get(root) ?? 0) >= 2;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitIdle = async () => {
  while (busyProbe() && !stopRequested) await sleep(BUSY_RETRY_MS);
  await sleep(IDLE_STEP_MS);
};

const loadClusters = async (db) => {
  clusterOf.clear();
  clusterSizes.clear();
  const rows = await db.getAllAsync("SELECT id, cluster FROM media WHERE kind = 'photo' AND cluster IS NOT NULL");
  for (const r of rows) {
    clusterOf.set(r.id, r.cluster);
    clusterSizes.set(r.cluster, (clusterSizes.get(r.cluster) ?? 0) + 1);
  }
};

const refreshCounts = async (db) => {
  const c = await db.getFirstAsync(`SELECT
      COUNT(*) AS total,
      SUM(kind = 'photo') AS photos,
      SUM(size_checked) AS measured,
      SUM(kind = 'photo' AND ml_state = 1) AS analysed,
      SUM(kind = 'photo' AND ml_state = 2) AS unavailable,
      SUM(cluster IS NOT NULL) AS clustered
    FROM media`);
  emit({ total: c.total ?? 0, photos: c.photos ?? 0, measured: c.measured ?? 0, analysed: c.analysed ?? 0,
    unavailable: c.unavailable ?? 0, clustered: c.clustered ?? 0 });
};

// ── 1. Sync ──────────────────────────────────────────────────────────────────
const sync = async (db) => {
  emit({ phase: 'sync' });
  const pass = Number(await getMeta('sync_pass') ?? 0) + 1;
  let after;
  let hasNext = true;
  while (hasNext && !stopRequested) {
    await waitIdle();
    const page = await MediaLibrary.getAssetsAsync({
      first: SYNC_PAGE, mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]], after,
    });
    await db.withTransactionAsync(async () => {
      for (const a of page.assets) {
        const kind = a.mediaType === 'video' ? 'video' : 'photo';
        const mtime = Math.round(a.modificationTime ?? a.creationTime ?? 0);
        // New rows start with an estimated size; a changed file is re-measured and re-analysed
        await db.runAsync(
          `INSERT INTO media (id, kind, created, mtime, width, height, duration, screenshot, size, seen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET seen = excluded.seen,
             size_checked = CASE WHEN media.mtime != excluded.mtime THEN 0 ELSE media.size_checked END,
             ml_state = CASE WHEN media.mtime != excluded.mtime THEN 0 ELSE media.ml_state END,
             mtime = excluded.mtime, screenshot = excluded.screenshot`,
          [a.id, kind, Math.round(a.creationTime ?? 0), mtime, a.width ?? 0, a.height ?? 0, a.duration ?? 0,
            isScreenshot(a) ? 1 : 0, estimateSize(kind, a.width, a.height, a.duration), pass]);
      }
    });
    after = page.endCursor;
    hasNext = page.hasNextPage;
  }
  if (stopRequested) return;
  // Assets deleted outside the app since the last full pass
  const stale = await db.getAllAsync('SELECT id FROM media WHERE seen != ?', [pass]);
  await deleteRows(stale.map((r) => r.id));
  await setMeta('sync_pass', pass);
  await setMeta('synced_at', Date.now());
  await refreshCounts(db);
};

// ── 2 + 3. Measure and analyse ───────────────────────────────────────────────
const measure = (localUri) => {
  try {
    const size = new File(localUri).size;
    return size > 0 ? size : null;
  } catch {
    return null;
  }
};

const union = async (db, a, b) => {
  const ra = clusterOf.get(a) ?? a;
  const rb = clusterOf.get(b) ?? b;
  if (ra === rb && clusterOf.has(a) && clusterOf.has(b)) return;
  const root = ra < rb ? ra : rb;
  const other = root === ra ? rb : ra;
  await db.runAsync('UPDATE media SET cluster = ? WHERE cluster = ? OR id IN (?, ?)', [root, other, a, b]);
  for (const [id, r] of clusterOf) if (r === other) clusterOf.set(id, root);
  clusterOf.set(a, root);
  clusterOf.set(b, root);
  let n = 0;
  for (const r of clusterOf.values()) if (r === root) n++;
  clusterSizes.delete(other);
  clusterSizes.set(root, n);
};

const clusterPhoto = async (db, row, vec) => {
  const neighbors = await db.getAllAsync(
    `SELECT id, vec FROM media WHERE kind = 'photo' AND ml_state = 1 AND id != ?
       AND created BETWEEN ? AND ? ORDER BY ABS(created - ?) LIMIT ?`,
    [row.id, row.created - NEIGHBOR_WINDOW_MS, row.created + NEIGHBOR_WINDOW_MS, row.created, NEIGHBOR_LIMIT]);
  for (const n of neighbors) {
    if (n.vec && vecSimilarity(vec, n.vec) >= DUPLICATE_THRESHOLD) await union(db, row.id, n.id);
  }
};

const work = async (db) => {
  emit({ phase: 'analyse' });
  let sinceProgress = 0;
  while (!stopRequested) {
    const ml = isEmbedderReady();
    const rows = await db.getAllAsync(
      `SELECT id, kind, created, size_checked, ml_state FROM media
       WHERE size_checked = 0 ${ml ? "OR (kind = 'photo' AND ml_state = 0)" : ''}
       ORDER BY created DESC LIMIT ?`, [WORK_BATCH]);
    if (!rows.length) break;
    for (const row of rows) {
      if (stopRequested) return;
      await waitIdle();
      let info = null;
      try {
        info = await MediaLibrary.getAssetInfoAsync(row.id, { shouldDownloadFromNetwork: false });
      } catch {}
      const localUri = info?.localUri ?? null;
      if (!row.size_checked) {
        const size = localUri ? measure(localUri) : null;
        await db.runAsync(
          size ? 'UPDATE media SET size = ?, size_known = 1, size_checked = 1 WHERE id = ?'
            : 'UPDATE media SET size_checked = 1 WHERE id = ?',
          size ? [size, row.id] : [row.id]);
      }
      if (ml && row.kind === 'photo' && row.ml_state === 0) {
        if (!localUri) {
          await db.runAsync('UPDATE media SET ml_state = 2 WHERE id = ?', [row.id]);   // iCloud-only
        } else {
          try {
            const r = await embedPhoto(localUri);
            await db.runAsync('UPDATE media SET ml_state = 1, ml_class = ?, ml_conf = ?, vec = ? WHERE id = ?',
              [r.label, r.confidence, r.vec, row.id]);
            await clusterPhoto(db, row, r.vec);
          } catch (e) {
            emit({ lastError: String(e?.message ?? e) });
            // Embedder went away mid-run: leave the row pending and stop this round
            if (!isEmbedderReady()) break;
            await db.runAsync('UPDATE media SET ml_state = 3 WHERE id = ?', [row.id]);
          }
        }
      }
      if (++sinceProgress >= 40) {
        sinceProgress = 0;
        await refreshCounts(db);
        onProgressCb?.();
      }
    }
    if (ml && !isEmbedderReady()) break;
  }
  await refreshCounts(db);
  onProgressCb?.();
};

// Starts (or resumes) the pipeline. Safe to call repeatedly.
export const startIndexer = async () => {
  // Still winding down from a stop (app was backgrounded briefly): just cancel the stop
  if (running) { stopRequested = false; return; }
  running = true;
  stopRequested = false;
  try {
    const db = await getDb();
    await loadClusters(db);
    await refreshCounts(db);
    await sync(db);
    await work(db);
    emit({ phase: stopRequested ? 'paused' : 'done' });
  } catch (e) {
    emit({ phase: 'error', lastError: String(e?.message ?? e) });
  } finally {
    running = false;
  }
};

export const stopIndexer = () => { stopRequested = true; };

// When the model finishes loading after sizes were done, run again for the ML step
onEmbedderStatus((s) => {
  if (s.state === 'ready' && !running && status.phase === 'done') startIndexer();
});
