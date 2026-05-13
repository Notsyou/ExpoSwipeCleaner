/**
 * components/TrashReviewModal.js
 *
 * Bottom-sheet modal showing a 3-column grid of photos queued for deletion.
 *
 * Task 1: Uses react-native-modal for swipe-to-dismiss (swipeDirection="down").
 *   - Default threshold behaviour: snaps back if the drag doesn't cross the
 *     library's built-in swipeThreshold (default 100 px).
 *   - Backdrop tap also closes the modal.
 *
 * Each thumbnail has:
 *   • A top-left size badge showing the recorded fileSize
 *   • A bottom-right rescue button (undo) that removes the photo from the queue
 */

import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Modal from 'react-native-modal';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SCREEN_HEIGHT, SCREEN_WIDTH, SAFE_BOTTOM, GLASS_BORDER } from '../constants';

const THUMB_SIZE = (SCREEN_WIDTH - 32 - 8) / 3;   // 3-col, 4 px gap each side

// ─── ThumbnailItem ────────────────────────────────────────────────────────────
const ThumbnailItem = ({ item, fileSizeBytes, onRescue }) => (
  <View style={[styles.thumbWrap, { width: THUMB_SIZE, height: THUMB_SIZE }]}>
    <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />

    {/* File-size badge — top left */}
    {fileSizeBytes > 0 && (
      <View style={styles.sizeBadge}>
        <Text style={styles.sizeBadgeText}>
          {(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
        </Text>
      </View>
    )}

    {/* Rescue button — bottom right */}
    <TouchableOpacity
      style={styles.rescueBtn}
      onPress={() => onRescue(item.id)}
      hitSlop={8}
    >
      <BlurView intensity={75} tint="dark" style={styles.rescueBtnInner}>
        <Ionicons name="arrow-undo" size={13} color="white" />
      </BlurView>
    </TouchableOpacity>
  </View>
);

// ─── TrashReviewModal ─────────────────────────────────────────────────────────
export default function TrashReviewModal({
  visible,
  trashQueue,    // string[] — asset IDs
  photos,        // MediaLibrary asset objects still in memory
  swipeHistory,  // [{ dir, assetId, fileSize }] — used to look up recorded sizes
  onClose,
  onRescue,      // (assetId: string) => void
}) {
  const queuedPhotos = photos.filter(p => trashQueue.includes(p.id));

  const fileSizeFor = (assetId) => {
    const entry = swipeHistory.find(h => h.assetId === assetId && h.dir === 'left');
    return entry?.fileSize ?? 0;
  };

  return (
    <Modal
      isVisible={visible}
      onSwipeComplete={onClose}
      onBackdropPress={onClose}
      swipeDirection={['down']}
      // Default threshold behaviour: snap back if not dragged far enough.
      // swipeThreshold defaults to 100 in react-native-modal — no override needed.
      style={styles.modal}
      propagateSwipe            // lets the inner FlatList scroll without triggering dismiss
      useNativeDriverForBackdrop
      statusBarTranslucent
      backdropOpacity={0.55}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      animationInTiming={340}
      animationOutTiming={280}
    >
      {/* Full-screen blur backdrop rendered inside the sheet area */}
      <View style={styles.sheet}>

        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Trash Queue</Text>
            <Text style={styles.subtitle}>
              {trashQueue.length} photo{trashQueue.length !== 1 ? 's' : ''} queued for deletion
            </Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <BlurView intensity={40} tint="dark" style={styles.closeBtnInner}>
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
            </BlurView>
          </TouchableOpacity>
        </View>

        {/* Grid or empty state */}
        {queuedPhotos.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle" size={52} color="rgba(255,255,255,0.18)" />
            <Text style={styles.emptyTitle}>Queue is empty</Text>
            <Text style={styles.emptyBody}>Photos you swipe left will appear here</Text>
          </View>
        ) : (
          <FlatList
            data={queuedPhotos}
            keyExtractor={item => item.id}
            numColumns={3}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <ThumbnailItem
                item={item}
                fileSizeBytes={fileSizeFor(item.id)}
                onRescue={onRescue}
              />
            )}
          />
        )}

        <View style={{ height: SAFE_BOTTOM + 8 }} />
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // react-native-modal fills the screen; we anchor the sheet to the bottom.
  modal: {
    justifyContent: 'flex-end',
    margin: 0,          // remove default horizontal margin
  },
  sheet: {
    maxHeight: SCREEN_HEIGHT * 0.80,
    backgroundColor: 'rgba(14,14,14,0.96)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    ...GLASS_BORDER,
  },
  handle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 13,
  },
  closeBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  closeBtnInner: {
    width: 28, height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Empty state ──
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    gap: 10,
  },
  emptyTitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyBody: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 13,
  },

  // ── Grid ──
  gridContent: { padding: 8 },
  gridRow:     { gap: 4, marginBottom: 4 },
  thumbWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  sizeBadge: {
    position: 'absolute',
    top: 5, left: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  sizeBadgeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '600',
  },
  rescueBtn: {
    position: 'absolute',
    bottom: 5, right: 5,
    borderRadius: 9,
    overflow: 'hidden',
  },
  rescueBtnInner: {
    width: 26, height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});