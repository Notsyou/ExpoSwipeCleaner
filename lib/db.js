import * as SQLite from 'expo-sqlite';

// ─── Local library index (SQLite) ─────────────────────────────────────────────
//
// One row per photo/video in the library. Nothing leaves the device.
//   size / size_known   bytes measured from the file (1) or estimated from resolution (0)
//   ml_state            0 pending · 1 analysed · 2 no local file (iCloud-only) · 3 failed
//   ml_class / ml_conf  on-device classifier output (camera_photo | downloaded | screenshot)
//   vec                 576-byte int8 embedding (standardized, L2-normalized) for duplicate search
//   cluster             near-duplicate cluster root id (null = not in a cluster)
//   seen                last library sync pass that saw the asset (stale rows are pruned)
let dbPromise = null;

export const getDb = () => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('swipe-cleaner.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS media (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL,
          created INTEGER, mtime INTEGER,
          width INTEGER, height INTEGER, duration REAL,
          screenshot INTEGER DEFAULT 0,
          size INTEGER DEFAULT 0, size_known INTEGER DEFAULT 0, size_checked INTEGER DEFAULT 0,
          ml_state INTEGER DEFAULT 0, ml_class TEXT, ml_conf REAL, vec BLOB, cluster TEXT,
          seen INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS media_created ON media(kind, created);
        CREATE INDEX IF NOT EXISTS media_size ON media(kind, size);
        CREATE INDEX IF NOT EXISTS media_work ON media(size_checked, ml_state, created);
        CREATE INDEX IF NOT EXISTS media_cluster ON media(cluster);
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
      `);
      return db;
    })();
  }
  return dbPromise;
};

export const getMeta = async (key) => {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT value FROM meta WHERE key = ?', [key]);
  return row?.value ?? null;
};

export const setMeta = async (key, value) => {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, String(value)]);
};

// Rough size until the file is measured: ~0.2 B/pixel for photos, ~0.9 B/pixel/second for video
export const estimateSize = (kind, width, height, duration) =>
  kind === 'video'
    ? Math.round((width || 1920) * (height || 1080) * Math.max(duration || 1, 1) * 0.9)
    : Math.round((width || 3000) * (height || 4000) * 0.2);

// Sizes for a set of ids (measured or estimated); missing ids are absent from the map
export const getSizes = async (ids) => {
  const db = await getDb();
  const out = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await db.getAllAsync(
      `SELECT id, size, size_known FROM media WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
    for (const r of rows) out.set(r.id, { size: r.size, known: !!r.size_known });
  }
  return out;
};

export const deleteRows = async (ids) => {
  if (!ids.length) return;
  const db = await getDb();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await db.runAsync(`DELETE FROM media WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
  }
};
