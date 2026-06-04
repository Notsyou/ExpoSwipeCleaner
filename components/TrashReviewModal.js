/**
 * components/TrashReviewModal.js
 */

import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SCREEN_HEIGHT, SCREEN_WIDTH, SAFE_BOTTOM, GLASS_BORDER } from '../constants';

const SHEET_HEIGHT      = SCREEN_HEIGHT * 0.72;
const DISMISS_THRESHOLD = SHEET_HEIGHT * 0.22;
const THUMB_SIZE        = (SCREEN_WIDTH - 32 - 8) / 3;

// ─── ThumbnailItem ────────────────────────────────────────────────────────────
const ThumbnailItem = ({ item, fileSizeBytes, onRescue }) => (
  <View style={[styles.thumbWrap, { width: THUMB_SIZE, height: THUMB_SIZE }]}>
    <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />

    {fileSizeBytes > 0 && (
      <View style={styles.sizeBadge}>
        <Text style={styles.sizeBadgeText}>
          {(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
        </Text>
      </View>
    )}

    <TouchableOpacity style={styles.rescueBtn} onPress={() => onRescue(item.id)} hitSlop={8}>
      <BlurView intensity={75} tint="dark" style={styles.rescueBtnInner}>
        <Ionicons name="arrow-undo" size={13} color="white" />
      </BlurView>
    </TouchableOpacity>
  </View>
);

const chunkIntoRows = (arr, size) => {
  const rows = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
};

// ─── TrashReviewModal ─────────────────────────────────────────────────────────
export default function TrashReviewModal({
  visible,
  trashQueue,
  photos,
  swipeHistory,
  onClose,
  onRescue,
}) {
  const translateY      = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const scrolledToTop   = useRef(true);

  const animateIn = useCallback(() => {
    translateY.setValue(SHEET_HEIGHT);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 65,
        friction: 14,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0.55,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, backdropOpacity]);

  const animateOut = useCallback((onDone) => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: SHEET_HEIGHT,
        tension: 80,
        friction: 16,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDone?.());
  }, [translateY, backdropOpacity]);

  useEffect(() => {
    if (visible) animateIn();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    animateOut(onClose);
  }, [animateOut, onClose]);

  const onRelease = useCallback((_, g) => {
    if (g.dy > DISMISS_THRESHOLD || g.vy > 0.5) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: SHEET_HEIGHT,
          tension: 80,
          friction: 16,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(onClose);
    } else {
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 14,
        useNativeDriver: true,
      }).start();
    }
  }, [translateY, backdropOpacity, onClose]);

  const onTerminate = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      tension: 80,
      friction: 14,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const onMove = useCallback((_, g) => {
    // Only track downward movement; clamp so sheet can't slide up past rest position
    translateY.setValue(Math.max(0, g.dy));
  }, [translateY]);

  // Handle pip — claims the gesture immediately on touch-down, no movement needed.
  const handlePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: onMove,
      onPanResponderRelease: onRelease,
      onPanResponderTerminate: onTerminate,
    })
  ).current;

  // Header / body — only intercepts downward movement when scrolled to top.
  const bodyPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        scrolledToTop.current && g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: onMove,
      onPanResponderRelease: onRelease,
      onPanResponderTerminate: onTerminate,
    })
  ).current;

  const clampedTranslate = translateY.interpolate({
    inputRange: [0, SHEET_HEIGHT],
    outputRange: [0, SHEET_HEIGHT],
    extrapolateLeft: 'clamp',
  });

  // Stable callback — inline arrow on onScroll forces ScrollView off native event path
  const handleScroll = useCallback((e) => {
    scrolledToTop.current = e.nativeEvent.contentOffset.y <= 2;
  }, []);

  const queuedPhotos = photos.filter(p => trashQueue.includes(p.id));
  const rows = chunkIntoRows(queuedPhotos, 3);

  const fileSizeFor = (assetId) => {
    const entry = swipeHistory.find(h => h.assetId === assetId && h.dir === 'left');
    return entry?.fileSize ?? 0;
  };

  return (
    // Keep Modal always mounted — unmounting resets Animated.Values and
    // kills in-flight animations. Let Modal's own `visible` gate rendering.
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Sheet — NO overflow:hidden here; that breaks useNativeDriver on iOS.
          Border radius lives on the inner sheetInner wrapper instead. */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: clampedTranslate }] }]}>
        <View style={styles.sheetInner}>

          {/* Drag handle zone — onStartShouldSetPanResponder so any touch here
              is claimed immediately; slow deliberate drags work from frame 0 */}
          <View style={styles.dragZone} {...handlePan.panHandlers}>
            <View style={styles.handle} />
          </View>

          {/* Header — bodyPan intercepts downward drags when scrolled to top */}
          <View style={styles.headerRow} {...bodyPan.panHandlers}>
            <View>
              <Text style={styles.title}>Trash Queue</Text>
              <Text style={styles.subtitle}>
                {trashQueue.length} photo{trashQueue.length !== 1 ? 's' : ''} queued for deletion
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={12}>
              <BlurView intensity={40} tint="dark" style={styles.closeBtnInner}>
                <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
              </BlurView>
            </TouchableOpacity>
          </View>

          {/* Grid or empty state */}
          <View style={styles.gridArea}>
            {queuedPhotos.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="checkmark-circle" size={52} color="rgba(255,255,255,0.18)" />
                <Text style={styles.emptyTitle}>Queue is empty</Text>
                <Text style={styles.emptyBody}>Photos you swipe left will appear here</Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.gridContent}
                decelerationRate="fast"
                scrollEventThrottle={16}
                onScroll={handleScroll}
              >
                {rows.map((row, ri) => (
                  <View key={ri} style={styles.gridRow}>
                    {row.map(item => (
                      <ThumbnailItem
                        key={item.id}
                        item={item}
                        fileSizeBytes={fileSizeFor(item.id)}
                        onRescue={onRescue}
                      />
                    ))}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={{ height: SAFE_BOTTOM + 8 }} />
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },

  // Animated.View: no overflow, no borderRadius — both break useNativeDriver on iOS
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
  },

  // Inner View carries all visual styling — safe for overflow + borderRadius
  sheetInner: {
    flex: 1,
    backgroundColor: 'rgba(14,14,14,0.96)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    ...GLASS_BORDER,
  },

  dragZone: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

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
  closeBtn:      { borderRadius: 14, overflow: 'hidden' },
  closeBtnInner: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: { color: 'rgba(255,255,255,0.45)', fontSize: 16, fontWeight: '600' },
  emptyBody:  { color: 'rgba(255,255,255,0.25)', fontSize: 13 },

  gridArea:    { flex: 1 },
  gridContent: { padding: 8, paddingBottom: 16 },
  gridRow:     { flexDirection: 'row', gap: 4, marginBottom: 4 },

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
  sizeBadgeText: { color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: '600' },
  rescueBtn:     { position: 'absolute', bottom: 5, right: 5, borderRadius: 9, overflow: 'hidden' },
  rescueBtnInner:{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
});