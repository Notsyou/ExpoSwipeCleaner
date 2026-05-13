import { Dimensions, Platform, StyleSheet } from 'react-native';

export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Layout ───────────────────────────────────────────────────────────────────
export const CARD_HEIGHT       = SCREEN_HEIGHT * 0.65;   // Task 2: was 0.52
export const META_HEIGHT       = 76;
export const SAFE_BOTTOM       = Platform.OS === 'ios' ? 34 : 12;

// ─── Z-index ladder ───────────────────────────────────────────────────────────
export const Z = {
  swiper:    1,
  overlay:   2,   // pointerEvents="none" — never intercepts touches
  topBar:   50,
  metaPanel:50,
  actionBar:100,  // must beat Swiper's internal elevation (~20)
};

// ─── Pagination / memory ──────────────────────────────────────────────────────
export const PAGE_SIZE             = 50;
export const PREFETCH_BATCH        = 12;
export const LOAD_AHEAD_THRESHOLD  = 12;
export const MAX_PHOTOS_IN_MEMORY  = 220;
export const TRIM_CHUNK            = 60;
export const SWIPE_BACK_MS         = 250;

// ─── Shared style tokens ──────────────────────────────────────────────────────
export const GLASS_BORDER = {
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.11)',
};

// ─── Formatters ───────────────────────────────────────────────────────────────
export const formatDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

export const formatFileSize = (bytes, loading) => {
  if (loading) return '…';
  if (!bytes)  return '—';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

export const formatResolution = (w, h) => (!w || !h ? '—' : `${w} × ${h}`);