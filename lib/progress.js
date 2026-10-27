import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Persisted review progress ────────────────────────────────────────────────
//
// Shape (v1):
//   reviewed: { photo: [assetId], video: [assetId] }   — kept or trashed, never shown again
//   trash:    { photo: [{ id, fileSize }], video: [...] } — pending deletion queue
//
const STORAGE_KEY = 'swipe-cleaner:progress:v1';

const EMPTY = {
  reviewed: { photo: [], video: [] },
  trash:    { photo: [], video: [] },
};

export const loadProgress = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const data = JSON.parse(raw);
    return {
      reviewed: { photo: data?.reviewed?.photo ?? [], video: data?.reviewed?.video ?? [] },
      trash:    { photo: data?.trash?.photo ?? [],    video: data?.trash?.video ?? [] },
    };
  } catch {
    return EMPTY;
  }
};

export const saveProgress = async (progress) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {}
};

export const clearProgress = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
};

// ─── Smart decks ──────────────────────────────────────────────────────────────
export const PHOTO_DECKS = [
  { key: 'all',         label: 'All',         icon: 'albums-outline' },
  { key: 'screenshots', label: 'Screenshots', icon: 'phone-portrait-outline' },
  { key: 'similar',     label: 'Similar',     icon: 'copy-outline' },
];

// Burst-style near-duplicates: same resolution, taken within this window
const SIMILAR_WINDOW_MS = 3000;

export const isScreenshot = (asset) => {
  const subtypes = asset.mediaSubtypes;
  if (Array.isArray(subtypes) && subtypes.includes('screenshot')) return true;
  return /screenshot|screen_shot|screen shot/i.test(asset.filename ?? asset.uri ?? '');
};

const isSimilar = (a, b) =>
  Math.abs((a.creationTime ?? 0) - (b.creationTime ?? 0)) <= SIMILAR_WINDOW_MS &&
  a.width === b.width && a.height === b.height;

// ─── Labels ───────────────────────────────────────────────────────────────────
// Every photo gets two labels:
//   source:    'screenshot' | 'camera' | 'others'
//   duplicate: 'duplicate'  | 'unique'
// Rule-based for now; the duplicate check is where embedding similarity plugs in.

// Default camera filenames: IMG_1234 / IMG20241027… (iOS, many Android), PXL_ (Pixel),
// DSC (Sony/Nikon), 20241027_123456 (Samsung)
const CAMERA_NAME = /^(IMG[_-]?\d|PXL_\d|DSC[_FN]?\d|\d{8}_\d{6})/i;
const CAMERA_SUBTYPES = ['hdr', 'panorama', 'livePhoto', 'depthEffect'];

export const sourceLabel = (asset) => {
  if (isScreenshot(asset)) return 'screenshot';
  const subtypes = asset.mediaSubtypes;
  if (Array.isArray(subtypes) && subtypes.some(t => CAMERA_SUBTYPES.includes(t))) return 'camera';
  if (/\/DCIM\/Camera\//i.test(asset.uri ?? '')) return 'camera';
  if (CAMERA_NAME.test(asset.filename ?? '')) return 'camera';
  return 'others';
};

// Labels one page of assets (newest first) in place. `scan.prev` carries the last
// asset across pages, so a pair split by a page boundary still marks both sides.
const labelPage = (assets, scan) => {
  let prev = scan.prev;
  for (const a of assets) {
    a.labels = { source: sourceLabel(a), duplicate: 'unique' };
    if (prev && isSimilar(prev, a)) {
      a.labels.duplicate = 'duplicate';
      prev.labels.duplicate = 'duplicate';
    }
    prev = a;
  }
};

// Filters one page of assets (newest first) down to what the deck should show.
// `scan` carries the last asset across pages: { prev, prevEmitted }.
export const selectForDeck = (deck, assets, scan, reviewed) => {
  const fresh = (a) => !reviewed.has(a.id);
  labelPage(assets, scan);

  if (deck === 'screenshots') {
    scan.prev = assets.at(-1) ?? scan.prev;
    return assets.filter(a => fresh(a) && a.labels.source === 'screenshot');
  }
  if (deck !== 'similar') {
    scan.prev = assets.at(-1) ?? scan.prev;
    return assets.filter(fresh);
  }

  const out = [];
  for (const a of assets) {
    if (scan.prev && isSimilar(scan.prev, a)) {
      if (!scan.prevEmitted && fresh(scan.prev)) out.push(scan.prev);
      if (fresh(a)) out.push(a);
      scan.prevEmitted = true;
    } else {
      scan.prevEmitted = false;
    }
    scan.prev = a;
  }
  return out;
};
