import { IS_IOS } from './sources';
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
// 'pictures' is an Android folder; iOS has no equivalent, so it's hidden there.
export const PHOTO_DECKS = [
  { key: 'all',         label: 'All',         icon: 'albums-outline' },
  { key: 'camera',      label: 'Camera',      icon: 'camera-outline' },
  { key: 'screenshots', label: 'Screenshots', icon: 'phone-portrait-outline' },
  { key: 'downloads',   label: 'Downloads',   icon: 'download-outline' },
  ...(IS_IOS ? [] : [{ key: 'pictures', label: 'Pictures', icon: 'images-outline' }]),
  { key: 'similar',     label: 'Similar',     icon: 'copy-outline' },
];

// Decks that need EXIF on iOS to tell camera shots from saved images
export const needsExif = (deck) => IS_IOS && (deck === 'camera' || deck === 'downloads');

// File types come from the filename extension. Anything unlisted counts as 'other'.
export const PHOTO_TYPES = [
  { key: 'all',   label: 'All' },
  { key: 'jpeg',  label: 'JPEG' },
  { key: 'png',   label: 'PNG' },
  { key: 'heic',  label: 'HEIC' },
  { key: 'other', label: 'Other' },
];

const TYPE_BY_EXTENSION = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', heic: 'heic', heif: 'heic' };

export const photoType = (asset) => {
  const name = (asset.filename ?? asset.uri ?? '').split(/[?#]/)[0];
  const extension = name.match(/\.([^./\\]+)$/)?.[1]?.toLowerCase();
  return TYPE_BY_EXTENSION[extension] ?? 'other';
};

// Burst-style near-duplicates: same resolution, taken within this window
const SIMILAR_WINDOW_MS = 3000;

export const isScreenshot = (asset) => {
  const subtypes = asset.mediaSubtypes;
  if (Array.isArray(subtypes) && subtypes.includes('screenshot')) return true;
  if (/\/Screenshots\//i.test(asset.uri ?? '')) return true;
  return /screenshot|screen_shot|screen shot/i.test(asset.filename ?? asset.uri ?? '');
};

// Android folders, read from the asset's file path. iOS has no folders, so these never match there.
const isDownload = (asset) => /\/Download(s)?\//i.test(asset.uri ?? '');
const isPictures = (asset) => /\/Pictures\//i.test(asset.uri ?? '');

// On-device embedding clusters (lib/indexer.js) are plugged in here; until a photo
// has been analysed only the burst-timing rule applies.
let inCluster = () => false;
let clusterOf = () => null;
export const setClusterLookup = ({ isInCluster, clusterIdOf }) => {
  inCluster = isInCluster;
  clusterOf = clusterIdOf;
};

const isSimilar = (a, b) => {
  const ca = clusterOf(a.id);
  if (ca && ca === clusterOf(b.id)) return true;
  return Math.abs((a.creationTime ?? 0) - (b.creationTime ?? 0)) <= SIMILAR_WINDOW_MS &&
    a.width === b.width && a.height === b.height;
};

// ─── Labels ───────────────────────────────────────────────────────────────────
// Every photo gets two labels:
//   source:    'screenshot' | 'download' | 'camera' | 'pictures' | 'others'
//   duplicate: 'duplicate'  | 'unique'
// Rule-based for now; the duplicate check is where embedding similarity plugs in.

// Default camera filenames: IMG_1234 / IMG20241027… (iOS, many Android), PXL_ (Pixel),
// DSC (Sony/Nikon), 20241027_123456 (Samsung)
const CAMERA_NAME = /^(IMG[_-]?\d|PXL_\d|DSC[_FN]?\d|\d{8}_\d{6})/i;
const CAMERA_SUBTYPES = ['hdr', 'panorama', 'livePhoto', 'depthEffect'];

export const sourceLabel = (asset) => {
  if (isScreenshot(asset)) return 'screenshot';
  if (asset.isFile || isDownload(asset)) return 'download';
  // iOS: EXIF decides when it's been looked up (see lib/sources.js)
  if (asset.cameraExif === true) return 'camera';
  if (asset.cameraExif === false) return 'download';
  const subtypes = asset.mediaSubtypes;
  if (Array.isArray(subtypes) && subtypes.some(t => CAMERA_SUBTYPES.includes(t))) return 'camera';
  if (/\/DCIM\/Camera\//i.test(asset.uri ?? '')) return 'camera';
  if (CAMERA_NAME.test(asset.filename ?? '')) return 'camera';
  if (isPictures(asset)) return 'pictures';
  return 'others';
};

// Labels one page of assets (newest first) in place. `scan.prev` carries the last
// asset across pages, so a pair split by a page boundary still marks both sides.
const labelPage = (assets, scan) => {
  let prev = scan.prev;
  for (const a of assets) {
    a.labels = { source: sourceLabel(a), duplicate: inCluster(a.id) ? 'duplicate' : 'unique' };
    if (prev && isSimilar(prev, a)) {
      a.labels.duplicate = 'duplicate';
      prev.labels.duplicate = 'duplicate';
    }
    prev = a;
  }
};

// Filters one page of assets (newest first) down to what the deck should show.
// `scan` carries the last asset across pages: { prev, prevEmitted }.
// The type filter runs last so a similar pair is still found when its neighbour
// is a different file type.
export const selectForDeck = (deck, assets, scan, reviewed, type = 'all') => {
  const selected = selectUnfiltered(deck, assets, scan, reviewed);
  return type === 'all' ? selected : selected.filter(a => photoType(a) === type);
};

const selectUnfiltered = (deck, assets, scan, reviewed) => {
  const fresh = (a) => !reviewed.has(a.id);
  labelPage(assets, scan);

  const sourceForDeck = { camera: 'camera', screenshots: 'screenshot', downloads: 'download', pictures: 'pictures' }[deck];
  if (sourceForDeck) {
    scan.prev = assets.at(-1) ?? scan.prev;
    return assets.filter(a => fresh(a) && a.labels.source === sourceForDeck);
  }
  // Album decks are already narrowed by the query, so they land here too
  if (deck !== 'similar') {
    scan.prev = assets.at(-1) ?? scan.prev;
    return assets.filter(fresh);
  }

  const out = [];
  for (const a of assets) {
    // Photos the model grouped with a near-duplicate show even when not adjacent in time
    if (inCluster(a.id)) {
      if (fresh(a) && !out.includes(a)) out.push(a);
      scan.prevEmitted = true;
      scan.prev = a;
      continue;
    }
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
