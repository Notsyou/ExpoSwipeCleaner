/**
 * components/MetadataPanel.js
 *
 * Displays Captured / File Size / Resolution for the active photo card.
 *
 * Fetch strategy (fixed for iOS ph:// URIs):
 *   1. MediaLibrary local   (shouldDownloadFromNetwork: false) — fast, offline-safe
 *   2. MediaLibrary network (shouldDownloadFromNetwork: true)  — resolves iCloud originals
 *   3. FileSystem.getInfoAsync(localUri)                       — uses the physical localUri,
 *      NOT photo.uri which is a virtual ph:// pointer on iOS.
 *      If localUri is absent the asset lives only in iCloud → 0 local bytes.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
// SDK 54+: import from the legacy sub-path to avoid deprecation throws.
// The API surface is identical to the old expo-file-system.
import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';

import {
  SCREEN_WIDTH,
  META_HEIGHT,
  GLASS_BORDER,
  formatDate,
  formatFileSize,
  formatResolution,
} from '../constants';

// ─── Core fetch (exported so App.js can reuse it for the swipe handler) ───────
//
// SDK 54 notes:
//   • expo-media-library never returns fileSize inside Expo Go (sandbox).
//   • expo-file-system's getInfoAsync throws on SDK 54 — use new File class.
//   • localUri is a real file:// path; ph:// (photo.uri) must NOT be used here.
//
export const fetchAssetInfo = async (assetId, _uri) => {
  try {
    // Step 1 — local (no network), fastest path
    const local = await MediaLibrary.getAssetInfoAsync(assetId, {
      shouldDownloadFromNetwork: false,
    });
    // Step 2 — allow network (resolves iCloud originals)
    const remote = await MediaLibrary.getAssetInfoAsync(assetId, {
      shouldDownloadFromNetwork: true,
    });

    const base = remote ?? local ?? {};

    // Step 3 — getAssetInfoAsync omits fileSize in Expo Go / sandboxed builds.
    //           Use the new expo-file-system File class to stat the physical file.
    if (!base.fileSize) {
      const localUri = remote?.localUri ?? local?.localUri;
      if (localUri) {
        try {
          const file = new File(localUri);
          const size = await file.size;          // returns number of bytes
          if (size > 0) return { ...base, fileSize: size };
        } catch {
          // file.size can throw if the path is outside the app sandbox on device;
          // fall through to return what we have.
        }
      }
    }

    return { ...base, fileSize: base.fileSize ?? 0 };
  } catch {
    return null;
  }
};

// ─── MetaCol ──────────────────────────────────────────────────────────────────
const MetaCol = ({ icon, label, value, loading }) => (
  <View style={styles.metaCol}>
    <Ionicons name={icon} size={15} color="rgba(255,255,255,0.45)" />
    <Text style={styles.metaLabel}>{label}</Text>
    <Text
      style={[styles.metaValue, loading && styles.metaValueLoading]}
      numberOfLines={1}
    >
      {value}
    </Text>
  </View>
);

// ─── MetadataPanel ────────────────────────────────────────────────────────────
export default function MetadataPanel({ photo, onInfoResolved }) {
  const [assetInfo, setAssetInfo] = useState(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (!photo?.id) {
      setAssetInfo(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setAssetInfo(null);   // clear stale data while fetching

    fetchAssetInfo(photo.id, photo.uri).then(info => {
      if (cancelled) return;
      setAssetInfo(info);
      setLoading(false);
      // Bubble the resolved info back to App.js so swipe handlers
      // can stamp the correct fileSize onto swipeHistory entries.
      onInfoResolved?.(info);
    });

    return () => { cancelled = true; };
  }, [photo?.id]);

  const date       = formatDate(photo?.creationTime);
  const size       = formatFileSize(assetInfo?.fileSize, loading);
  const resolution = formatResolution(
    assetInfo?.exif?.PixelXDimension ?? photo?.width,
    assetInfo?.exif?.PixelYDimension ?? photo?.height,
  );

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <BlurView intensity={55} tint="dark" style={styles.panel}>
        <MetaCol icon="calendar-outline" label="Captured"   value={date}       />
        <View style={styles.divider} />
        <MetaCol icon="save-outline"     label="File Size"  value={size}       loading={loading} />
        <View style={styles.divider} />
        <MetaCol icon="expand-outline"   label="Resolution" value={resolution} />
      </BlurView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    width: SCREEN_WIDTH - 32,
    marginTop: 14,
    zIndex: 50,
    elevation: 50,
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: META_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    ...GLASS_BORDER,
  },
  metaCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 12,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: '52%',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  metaLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  metaValueLoading: {
    color: 'rgba(255,255,255,0.28)',
  },
});