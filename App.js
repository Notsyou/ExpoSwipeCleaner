import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, Alert, StatusBar, Animated, TouchableOpacity, PanResponder, ScrollView } from 'react-native';
import { GestureHandlerRootView, PinchGestureHandler, State } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import Swiper from 'react-native-deck-swiper';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
// SDK 54+: legacy sub-path keeps the same API without deprecation throws
import * as FileSystem from 'expo-file-system/legacy';

// Components & Constants
import TrashReviewModal from './components/TrashReviewModal';
import MetadataPanel from './components/MetadataPanel';
import ActionButtons from './components/ActionButtons';
import {
  SCREEN_WIDTH, SCREEN_HEIGHT, CARD_HEIGHT, Z, PAGE_SIZE, PREFETCH_BATCH,
  LOAD_AHEAD_THRESHOLD, MAX_PHOTOS_IN_MEMORY, TRIM_CHUNK, SWIPE_BACK_MS, GLASS_BORDER
} from './constants';

// ─── Inline WAV tones (base64) ────────────────────────────────────────────────
// Bright 880 Hz "pop" for Keep
const KEEP_WAV_B64 = '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';
// Low 120 Hz "thud" for Trash
const TRASH_WAV_B64 = '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';

const VIGNETTE_WIDTH = SCREEN_WIDTH * 0.35;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDuration = (secs) => {
  if (!secs || secs <= 0) return null;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// ─── StoragePill ──────────────────────────────────────────────────────────────
const StoragePill = ({ savedBytes, totalBytes }) => {
  const hasSaved = savedBytes > 0;
  const hasTotal = totalBytes > 0;
  if (!hasSaved && !hasTotal) return null;
  const toGB = (b) => b >= 1024 * 1024 * 1024
    ? (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
    : (b / (1024 * 1024)).toFixed(0) + ' MB';
  return (
    <BlurView intensity={50} tint="dark" style={styles.storagePill}>
      <Ionicons name="cloud-done-outline" size={13} color="rgba(255,255,255,0.55)" />
      {hasSaved && <Text style={styles.storageText}>{toGB(savedBytes)} saved</Text>}
      {hasSaved && hasTotal && <Text style={styles.storageTextDim}>·</Text>}
      {hasTotal && <Text style={styles.storageTextDim}>{toGB(totalBytes)} total</Text>}
    </BlurView>
  );
};

// ─── MediaToggle ──────────────────────────────────────────────────────────────
const MediaToggle = ({ mode, onChange }) => (
  <BlurView intensity={50} tint="dark" style={styles.togglePill}>
    <View style={styles.toggleTrack}>
      <View style={[styles.toggleThumb, mode === 'video' && styles.toggleThumbRight]} />
      {['photo', 'video'].map((m) => (
        <Text
          key={m}
          onPress={() => onChange(m)}
          style={[styles.toggleLabel, mode === m && styles.toggleLabelActive]}
        >
          {m === 'photo' ? 'Photos' : 'Videos'}
        </Text>
      ))}
    </View>
  </BlurView>
);

// ─── EdgeVignette ─────────────────────────────────────────────────────────────
const EdgeVignette = ({ side, color, opacity }) => {
  const isLeft = side === 'left';
  const colors = isLeft
    ? [color, 'transparent']
    : ['transparent', color];
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.vignetteBase, isLeft ? styles.vignetteLeft : styles.vignetteRight, { opacity }]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

// ─── ScrubBar ─────────────────────────────────────────────────────────────────
const ScrubBar = ({ progress, onScrubStart, onScrubEnd, onScrubMove }) => {
  const barWidth = SCREEN_WIDTH - 32 - 32; // card width minus padding
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        onScrubStart();
        const x = e.nativeEvent.locationX;
        onScrubMove(x / barWidth);
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        onScrubMove(x / barWidth);
      },
      onPanResponderRelease: () => onScrubEnd(),
      onPanResponderTerminate: () => onScrubEnd(),
    })
  ).current;

  return (
    <View style={scrubStyles.track} {...panResponder.panHandlers}>
      <View style={[scrubStyles.fill, { width: `${Math.min(100, progress * 100)}%` }]} />
      <View style={[scrubStyles.thumb, { left: `${Math.min(100, progress * 100)}%` }]} />
    </View>
  );
};

const scrubStyles = StyleSheet.create({
  track: {
    width: SCREEN_WIDTH - 32 - 32,
    height: 20,
    justifyContent: 'center',
  },
  fill: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#ffffff',
    top: 3,
    marginLeft: -7,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
});

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [mediaMode, setMediaMode] = useState('photo'); // 'photo' | 'video'
  const mediaModeRef = useRef('photo');

  // ── Photo state ────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState([]);
  const [trashQueue, setTrashQueue] = useState([]);
  const [trashSizeBytes, setTrashSizeBytes] = useState(0);

  // ── Video state ────────────────────────────────────────────────────────────
  const [videos, setVideos] = useState([]);
  const [videoTrashQueue, setVideoTrashQueue] = useState([]);
  const [videoTrashSizeBytes, setVideoTrashSizeBytes] = useState(0);
  const [videoHasNextPage, setVideoHasNextPage] = useState(true);
  const [videoEndCursor, setVideoEndCursor] = useState(null);
  const loadingMoreVideosRef = useRef(false);

  const [reviewVisible, setReviewVisible] = useState(false);

  // ── Hint animation ─────────────────────────────────────────────────────────
  const hintAnim = useRef(new Animated.Value(0)).current;
  const hintShownRef = useRef(false);

  // ── Pinch-to-zoom (photos) ─────────────────────────────────────────────────
  const [zoomScale, setZoomScale] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const baseScaleRef = useRef(1);
  const pinchRef = useRef(null);

  // ── Video scrub / pause ────────────────────────────────────────────────────
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);   // 0–1
  const [videoDuration, setVideoDuration] = useState(0);   // seconds
  const scrubbing = useRef(false);

  // ── Total storage ──────────────────────────────────────────────────────────
  const [totalStorageBytes, setTotalStorageBytes] = useState(0);

  // ── Empty-state flags ──────────────────────────────────────────────────────
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [videosLoaded, setVideosLoaded] = useState(false);

  const swiperRef = useRef(null);
  const undoInFlightRef = useRef(false);
  const undoUnlockTimeoutRef = useRef(null);

  const [swipeHistory, setSwipeHistory] = useState([]);
  const swipeHistoryRef = useRef([]);
  const [cardIndex, setCardIndex] = useState(0);
  const cardIndexRef = useRef(0);

  const [videoSwipeHistory, setVideoSwipeHistory] = useState([]);
  const videoSwipeHistoryRef = useRef([]);
  const [videoCardIndex, setVideoCardIndex] = useState(0);
  const videoCardIndexRef = useRef(0);

  const activeAssetInfoRef = useRef(null);

  const [hasNextPage, setHasNextPage] = useState(true);
  const [endCursor, setEndCursor] = useState(null);
  const loadingMoreRef = useRef(false);

  // FIX #2 & #3: Mirror pagination state into refs so callbacks always see current values
  const hasNextPageRef = useRef(true);
  const videoHasNextPageRef = useRef(true);
  const endCursorRef = useRef(null);
  const videoEndCursorRef = useRef(null);
  const photosLengthRef = useRef(0);
  const videosLengthRef = useRef(0);

  // Mirror entire asset arrays into refs — never trimmed, so modal can always look up any asset by ID
  const photosRef = useRef([]);
  const videosRef = useRef([]);

  useEffect(() => { hasNextPageRef.current = hasNextPage; }, [hasNextPage]);
  useEffect(() => { videoHasNextPageRef.current = videoHasNextPage; }, [videoHasNextPage]);
  useEffect(() => { endCursorRef.current = endCursor; }, [endCursor]);
  useEffect(() => { videoEndCursorRef.current = videoEndCursor; }, [videoEndCursor]);
  useEffect(() => {
    photosLengthRef.current = photos.length;
    // Merge into photosRef so we always have the full unsliced set for modal lookups
    photosRef.current = [
      ...photosRef.current.filter(p => !photos.find(q => q.id === p.id)),
      ...photos,
    ];
  }, [photos]);
  useEffect(() => { videosLengthRef.current = videos.length; videosRef.current = videos; }, [videos]);

  const trashOpacity = useRef(new Animated.Value(0)).current;
  const keepOpacity  = useRef(new Animated.Value(0)).current;

  // Sound refs
  const keepSoundRef  = useRef(null);
  const trashSoundRef = useRef(null);

  // ── Single video player ───────────────────────────────────────────────────
  // One player, swapped via replaceAsync on each swipe. Local camera roll files
  // load fast enough that no preloading is needed, and a single decoder gives
  // the GPU full headroom for smooth 120 Hz playback.
  const activePlayer = useVideoPlayer(null, (p) => { p.loop = true; p.volume = 0; });
  const activePlayerRef = useRef(null);
  useEffect(() => { activePlayerRef.current = activePlayer; }, [activePlayer]);

  // Mute state — activePlayer volume only
  const [isMuted, setIsMuted] = useState(true);
  const isMutedRef = useRef(true);
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      isMutedRef.current = next;
      activePlayer.volume = next ? 0 : 1;
      return next;
    });
  }, [activePlayer]);

  // Sync refs
  useEffect(() => { swipeHistoryRef.current = swipeHistory; }, [swipeHistory]);
  useEffect(() => { cardIndexRef.current = cardIndex; }, [cardIndex]);
  useEffect(() => { videoSwipeHistoryRef.current = videoSwipeHistory; }, [videoSwipeHistory]);
  useEffect(() => { videoCardIndexRef.current = videoCardIndex; }, [videoCardIndex]);

  // Swipe hint — subtle left/right nudge on first card, once per session
  useEffect(() => {
    if (hintShownRef.current) return;
    const activeLen = mediaModeRef.current === 'photo' ? photos.length : videos.length;
    if (activeLen === 0) return;
    hintShownRef.current = true;
    const delay = setTimeout(() => {
      Animated.sequence([
        Animated.timing(hintAnim, { toValue: -28, duration: 320, useNativeDriver: true }),
        Animated.timing(hintAnim, { toValue: 18,  duration: 260, useNativeDriver: true }),
        Animated.timing(hintAnim, { toValue: 0,   duration: 220, useNativeDriver: true }),
      ]).start();
    }, 800);
    return () => clearTimeout(delay);
  }, [photos.length, videos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed the player when videos first load or when switching to the video tab
  useEffect(() => {
    if (mediaMode !== 'video' || videosRef.current.length === 0) return;
    const currentUri = videosRef.current[videoCardIndexRef.current]?.uri;
    if (currentUri) {
      activePlayer.replaceAsync({ uri: currentUri }).then(() => {
        activePlayer.volume = isMutedRef.current ? 0 : 1;
        activePlayer.play();
      }).catch(() => {});
    }
  }, [mediaMode, videos.length > 0, activePlayer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll video progress for scrub bar — reads from ref to avoid stale closure
  useEffect(() => {
    if (mediaMode !== 'video') return;
    const interval = setInterval(() => {
      if (scrubbing.current) return;
      try {
        const p   = activePlayerRef.current;
        const pos = p?.currentTime ?? 0;
        const dur = p?.duration    ?? 0;
        setVideoDuration(dur);
        setVideoProgress(dur > 0 ? pos / dur : 0);
      } catch {}
    }, 250);
    return () => clearInterval(interval);
  }, [mediaMode]);

  // Reset scrub state on swipe
  const resetVideoUI = useCallback(() => {
    setVideoProgress(0);
    setIsVideoPaused(false);
  }, []);

  // ── Load sounds ────────────────────────────────────────────────────────────
  useEffect(() => {
    let keepSound, trashSound;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

        const keepUri  = FileSystem.cacheDirectory + 'swipe_keep.wav';
        const trashUri = FileSystem.cacheDirectory + 'swipe_trash.wav';

        // FIX #1: Use legacy getInfoAsync instead of new File class .exists
        // (File.exists is not reliably async-compatible across SDK versions)
        const [keepInfo, trashInfo] = await Promise.all([
          FileSystem.getInfoAsync(keepUri),
          FileSystem.getInfoAsync(trashUri),
        ]);

        if (!keepInfo.exists) {
          await FileSystem.writeAsStringAsync(keepUri, KEEP_WAV_B64, { encoding: FileSystem.EncodingType.Base64 });
        }
        if (!trashInfo.exists) {
          await FileSystem.writeAsStringAsync(trashUri, TRASH_WAV_B64, { encoding: FileSystem.EncodingType.Base64 });
        }

        ({ sound: keepSound  } = await Audio.Sound.createAsync({ uri: keepUri  }, { volume: 0.6 }));
        ({ sound: trashSound } = await Audio.Sound.createAsync({ uri: trashUri }, { volume: 0.7 }));

        keepSoundRef.current  = keepSound;
        trashSoundRef.current = trashSound;
      } catch (e) {
        console.warn('Sound init failed:', e);
      }
    })();

    return () => {
      keepSound?.unloadAsync();
      trashSound?.unloadAsync();
    };
  }, []);

  const playKeep = useCallback(async () => {
    try {
      await keepSoundRef.current?.setPositionAsync(0);
      await keepSoundRef.current?.playAsync();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, []);

  const playTrash = useCallback(async () => {
    try {
      await trashSoundRef.current?.setPositionAsync(0);
      await trashSoundRef.current?.playAsync();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
  }, []);

  // ── Load Initial Photos ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status === 'granted') {
        loadMorePhotos();
        loadMoreVideos();
      }
    })();
  }, []);

  // FIX #3: loadMorePhotos uses ref for hasNextPage guard, not stale closure state
  const loadMorePhotos = useCallback(async (cursor = null) => {
    if (!hasNextPageRef.current && cursor !== null) return;
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    try {
      const media = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE, mediaType: 'photo',
        sortBy: [[MediaLibrary.SortBy.creationTime, false]], after: cursor,
      });
      setPhotos(prev => [...prev, ...media.assets]);
      setEndCursor(media.endCursor);
      setHasNextPage(media.hasNextPage);
      hasNextPageRef.current = media.hasNextPage;
      endCursorRef.current = media.endCursor;
      Image.prefetch(media.assets.slice(0, PREFETCH_BATCH).map(a => a.uri));
      setPhotosLoaded(true);
      // Tally total storage from all loaded photo assets
      setTotalStorageBytes(prev => prev + media.assets.reduce((acc, a) => acc + (a.fileSize ?? 0), 0));
    } finally {
      loadingMoreRef.current = false;
    }
  }, []);

  // FIX #3: loadMoreVideos uses ref for videoHasNextPage guard
  const loadMoreVideos = useCallback(async (cursor = null) => {
    if (!videoHasNextPageRef.current && cursor !== null) return;
    if (loadingMoreVideosRef.current) return;
    loadingMoreVideosRef.current = true;
    try {
      const media = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE, mediaType: 'video',
        sortBy: [[MediaLibrary.SortBy.creationTime, false]], after: cursor,
      });
      setVideos(prev => [...prev, ...media.assets]);
      setVideoEndCursor(media.endCursor);
      setVideoHasNextPage(media.hasNextPage);
      videoHasNextPageRef.current = media.hasNextPage;
      videoEndCursorRef.current = media.endCursor;
      setVideosLoaded(true);
      setTotalStorageBytes(prev => prev + media.assets.reduce((acc, a) => acc + (a.fileSize ?? 0), 0));
    } finally {
      loadingMoreVideosRef.current = false;
    }
  }, []);

  const resetOverlays = useCallback(() => {
    Animated.parallel([
      Animated.timing(trashOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.timing(keepOpacity,  { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start();
  }, [trashOpacity, keepOpacity]);

  const handleModeChange = useCallback((m) => {
    mediaModeRef.current = m;
    setMediaMode(m);
    Animated.parallel([
      Animated.timing(trashOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.timing(keepOpacity,  { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start();
  }, [trashOpacity, keepOpacity]);

  // FIX #4 & #5: Use refs for asset lookup and track trim offset to prevent
  // index drift between swiper internal counter and our asset arrays.
  const photoTrimOffsetRef = useRef(0);
  const videoTrimOffsetRef = useRef(0);

  // FIX #7: Wrap all swipe handlers in useCallback with stable deps (refs only)
  const handleSwipeLeft = useCallback((swiperIndex) => {
    if (mediaModeRef.current === 'photo') {
      const photo = photosRef.current[swiperIndex + photoTrimOffsetRef.current]
                 ?? photosRef.current[swiperIndex];
      if (!photo?.id) return;
      const fileSize = activeAssetInfoRef.current?.fileSize ?? 0;
      setTrashQueue(prev => {
        if (prev.includes(photo.id)) return prev; // guard against double-fire
        return [...prev, photo.id];
      });
      setSwipeHistory(prev => [...prev, { dir: 'left', assetId: photo.id, fileSize }]);
      setTrashSizeBytes(prev => prev + fileSize);
    } else {
      const video = videosRef.current[swiperIndex + videoTrimOffsetRef.current]
                 ?? videosRef.current[swiperIndex];
      if (!video?.id) return;
      const fileSize = activeAssetInfoRef.current?.fileSize ?? 0;
      setVideoTrashQueue(prev => {
        if (prev.includes(video.id)) return prev;
        return [...prev, video.id];
      });
      setVideoSwipeHistory(prev => [...prev, { dir: 'left', assetId: video.id, fileSize }]);
      setVideoTrashSizeBytes(prev => prev + fileSize);
    }
    playTrash();
  }, [playTrash]);

  const handleSwipeRight = useCallback((swiperIndex) => {
    if (mediaModeRef.current === 'photo') {
      setPhotos(currentPhotos => {
        const photo = currentPhotos[swiperIndex];
        setSwipeHistory(prev => [...prev, { dir: 'right', assetId: photo?.id, fileSize: 0 }]);
        return currentPhotos;
      });
    } else {
      setVideos(currentVideos => {
        const video = currentVideos[swiperIndex];
        setVideoSwipeHistory(prev => [...prev, { dir: 'right', assetId: video?.id, fileSize: 0 }]);
        return currentVideos;
      });
    }
    playKeep();
  }, [playKeep]);

  // FIX #2: handleSwiped reads pagination state from refs, not stale closure
  const handleSwiped = useCallback((index) => {
    if (mediaModeRef.current === 'photo') {
      setCardIndex(index + 1);
      resetOverlays();
      if (hasNextPageRef.current && photosLengthRef.current - (index + 1) <= LOAD_AHEAD_THRESHOLD) {
        loadMorePhotos(endCursorRef.current);
      }
      // FIX #4 & #5: Track trim offset so post-trim index lookups stay correct
      if ((index + 1) >= TRIM_CHUNK && photosLengthRef.current > MAX_PHOTOS_IN_MEMORY) {
        photoTrimOffsetRef.current += TRIM_CHUNK;
        setPhotos(prev => prev.slice(TRIM_CHUNK));
        setCardIndex(prev => {
          const next = Math.max(0, prev - TRIM_CHUNK);
          // Defer jumpToCardIndex so Swiper re-renders first
          setTimeout(() => swiperRef.current?.jumpToCardIndex?.(next), 0);
          return next;
        });
      }
    } else {
      const nextVideoIndex = index + 1;
      setVideoCardIndex(nextVideoIndex);
      resetOverlays();
      resetVideoUI();

      // Swap the player to the next video on swipe
      const nextUri = videosRef.current[nextVideoIndex]?.uri;
      if (nextUri) {
        activePlayer.replaceAsync({ uri: nextUri }).then(() => {
          activePlayer.volume = isMutedRef.current ? 0 : 1;
          activePlayer.play();
        }).catch(() => {});
      }

      if (videoHasNextPageRef.current && videosLengthRef.current - (index + 1) <= LOAD_AHEAD_THRESHOLD) {
        loadMoreVideos(videoEndCursorRef.current);
      }
      if ((index + 1) >= TRIM_CHUNK && videosLengthRef.current > MAX_PHOTOS_IN_MEMORY) {
        videoTrimOffsetRef.current += TRIM_CHUNK;
        setVideos(prev => prev.slice(TRIM_CHUNK));
        setVideoCardIndex(prev => {
          const next = Math.max(0, prev - TRIM_CHUNK);
          setTimeout(() => swiperRef.current?.jumpToCardIndex?.(next), 0);
          return next;
        });
      }
    }
  }, [resetOverlays, loadMorePhotos, loadMoreVideos, activePlayer, resetVideoUI]);

  const handleSwiping = useCallback((x) => {
    const threshold = 40;
    if (x < -threshold) {
      Animated.timing(trashOpacity, { toValue: Math.min(1, (Math.abs(x) - threshold) / 80), duration: 0, useNativeDriver: true }).start();
      Animated.timing(keepOpacity,  { toValue: 0, duration: 0, useNativeDriver: true }).start();
    } else if (x > threshold) {
      Animated.timing(keepOpacity,  { toValue: Math.min(1, (x - threshold) / 80), duration: 0, useNativeDriver: true }).start();
      Animated.timing(trashOpacity, { toValue: 0, duration: 0, useNativeDriver: true }).start();
    } else {
      resetOverlays();
    }
  }, [trashOpacity, keepOpacity, resetOverlays]);

  const handleUndo = useCallback(() => {
    if (undoInFlightRef.current) return;

    const isPhoto = mediaModeRef.current === 'photo';
    const history = isPhoto ? swipeHistoryRef.current : videoSwipeHistoryRef.current;
    if (!history?.length) return;

    undoInFlightRef.current = true;
    if (undoUnlockTimeoutRef.current) clearTimeout(undoUnlockTimeoutRef.current);

    const last = history[history.length - 1];
    const currentIdx = isPhoto ? cardIndexRef.current : videoCardIndexRef.current;
    const nextIndex = Math.max(0, currentIdx - 1);

    if (isPhoto) {
      setCardIndex(nextIndex);
      setSwipeHistory(prev => prev.slice(0, -1));
      if (last.dir === 'left' && last.assetId) {
        setTimeout(() => {
          setTrashQueue(q => q.filter(id => id !== last.assetId));
          setTrashSizeBytes(prev => Math.max(0, prev - (last.fileSize ?? 0)));
        }, SWIPE_BACK_MS + 50);
      }
    } else {
      setVideoCardIndex(nextIndex);
      setVideoSwipeHistory(prev => prev.slice(0, -1));
      if (last.dir === 'left' && last.assetId) {
        setTimeout(() => {
          setVideoTrashQueue(q => q.filter(id => id !== last.assetId));
          setVideoTrashSizeBytes(prev => Math.max(0, prev - (last.fileSize ?? 0)));
        }, SWIPE_BACK_MS + 50);
      }

      // Restore the player to the previous video on undo
      const prevUri = videosRef.current[nextIndex]?.uri;
      if (prevUri) {
        activePlayer.replaceAsync({ uri: prevUri }).then(() => {
          activePlayer.volume = isMutedRef.current ? 0 : 1;
          activePlayer.play();
        }).catch(() => {});
      }
    }

    setTimeout(() => {
      swiperRef.current?.jumpToCardIndex?.(nextIndex);
    }, 0);

    undoUnlockTimeoutRef.current = setTimeout(() => { undoInFlightRef.current = false; }, 150);
  }, [activePlayer]);

  const handleVideoTap = useCallback(() => {
    if (mediaModeRef.current !== 'video') return;
    setIsVideoPaused(prev => {
      const next = !prev;
      const p = activePlayerRef.current;
      if (next) p?.pause();
      else p?.play();
      return next;
    });
  }, []);

  const handleScrubStart = useCallback(() => { scrubbing.current = true; }, []);
  const handleScrubEnd   = useCallback(() => { scrubbing.current = false; }, []);
  const handleScrubMove  = useCallback((ratio) => {
    const p   = activePlayerRef.current;
    const dur = p?.duration ?? 0;
    if (dur <= 0) return;
    const clamped = Math.max(0, Math.min(ratio, 1));
    if (p) p.currentTime = clamped * dur;
    setVideoProgress(clamped);
  }, []);

  const handleRescue = useCallback((assetId) => {
    if (mediaModeRef.current === 'photo') {
      setTrashQueue(q => q.filter(id => id !== assetId));
      const entry = swipeHistoryRef.current.find(h => h.assetId === assetId && h.dir === 'left');
      if (entry?.fileSize) setTrashSizeBytes(prev => Math.max(0, prev - entry.fileSize));
    } else {
      setVideoTrashQueue(q => q.filter(id => id !== assetId));
      const entry = videoSwipeHistoryRef.current.find(h => h.assetId === assetId && h.dir === 'left');
      if (entry?.fileSize) setVideoTrashSizeBytes(prev => Math.max(0, prev - entry.fileSize));
    }
  }, []);

  const handleEmptyTrash = useCallback(() => {
    const isPhoto = mediaModeRef.current === 'photo';
    const queue = isPhoto ? trashQueue : videoTrashQueue;
    const label = isPhoto ? 'photos' : 'videos';
    Alert.alert('Delete Permanently?', `Permanently remove ${queue.length} ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await MediaLibrary.deleteAssetsAsync(queue);
            if (isPhoto) {
              setTrashQueue([]); setTrashSizeBytes(0); setSwipeHistory([]);
            } else {
              setVideoTrashQueue([]); setVideoTrashSizeBytes(0); setVideoSwipeHistory([]);
            }
          } catch {
            Alert.alert('Error', "Couldn't delete. Check permissions.");
          }
        }
      },
    ]);
  }, [trashQueue, videoTrashQueue]);

  if (hasPermission === null) return <View style={styles.root}><Text style={styles.loadingText}>Requesting permissions…</Text></View>;
  if (hasPermission === false) return <View style={styles.root}><Text style={styles.loadingText}>No access to camera roll.</Text></View>;
  if (photos.length === 0 && !photosLoaded && videos.length === 0 && !videosLoaded) return <View style={styles.root}><Text style={styles.loadingText}>Loading media…</Text></View>;

  const activeAssets   = mediaMode === 'photo' ? photos : videos;
  const activeIndex    = mediaMode === 'photo' ? cardIndex : videoCardIndex;
  const activeHasNext  = mediaMode === 'photo' ? hasNextPage : videoHasNextPage;
  const activeTrashQ   = mediaMode === 'photo' ? trashQueue : videoTrashQueue;
  const activeSavedBytes = mediaMode === 'photo' ? trashSizeBytes : videoTrashSizeBytes;
  const activeHistory  = mediaMode === 'photo' ? swipeHistory : videoSwipeHistory;

  const activePhoto = activeAssets[activeIndex];
  const allSwiped   = activeIndex >= activeAssets.length && !activeHasNext;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Top Bar: Media Toggle + Storage Pill + Mute toggle (video mode only) */}
      <View style={styles.topBar} pointerEvents="box-none">
        <MediaToggle mode={mediaMode} onChange={handleModeChange} />
        <View style={styles.topBarRow}>
          <StoragePill savedBytes={activeSavedBytes} totalBytes={totalStorageBytes} />
          {mediaMode === 'video' && (
            <TouchableOpacity onPress={toggleMute} activeOpacity={0.7}>
              <BlurView intensity={50} tint="dark" style={styles.muteButton}>
                <Ionicons
                  name={isMuted ? 'volume-mute' : 'volume-high'}
                  size={16}
                  color="rgba(255,255,255,0.85)"
                />
              </BlurView>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Edge vignettes — full-height, behind the deck */}
      <EdgeVignette side="left"  color="rgba(255,69,58,0.72)"  opacity={trashOpacity} />
      <EdgeVignette side="right" color="rgba(48,209,88,0.72)"  opacity={keepOpacity}  />

      {/* Deck Area */}
      <View style={styles.deckArea} pointerEvents="box-none">
        {/* Persistent video underlay — rendered BEFORE (under) the Swiper so the
            Swiper's gesture responder sits on top and receives all touch events.
            VideoView never unmounts between swipes, eliminating the black-frame
            flash that happens when it's inside renderCard and gets remounted. */}


        {mediaMode === 'photo' && photosLoaded && photos.length === 0 ? (
          <BlurView intensity={50} tint="dark" style={styles.doneCard}>
            <Ionicons name="images-outline" size={52} color="rgba(255,255,255,0.45)" />
            <Text style={styles.doneText}>No photos found</Text>
          </BlurView>
        ) : mediaMode === 'video' && videosLoaded && videos.length === 0 ? (
          <BlurView intensity={50} tint="dark" style={styles.doneCard}>
            <Ionicons name="videocam-outline" size={52} color="rgba(255,255,255,0.45)" />
            <Text style={styles.doneText}>No videos found</Text>
          </BlurView>
        ) : allSwiped ? (
          <BlurView intensity={50} tint="dark" style={styles.doneCard}>
            <Ionicons name="checkmark-circle" size={52} color="rgba(255,255,255,0.45)" />
            <Text style={styles.doneText}>All caught up!</Text>
          </BlurView>
        ) : (
          <Animated.View style={{ width: SCREEN_WIDTH, height: CARD_HEIGHT, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: hintAnim }] }}>
          <Swiper
            key={mediaMode}
            ref={swiperRef}
            cards={activeAssets}
            cardIndex={activeIndex}
            infinite={false}
            renderCard={(card, cardIdx) => {
              if (!card) return null;
              if (card.mediaType === 'video') {
                const isFront = cardIdx === videoCardIndex;
                return (
                  <View style={styles.card}>
                    {isFront ? (
                      <VideoView
                        player={activePlayer}
                        style={[styles.cardImage, { alignSelf: 'center' }]}
                        contentFit="contain"
                        nativeControls={false}
                      />
                    ) : null}
                  </View>
                );
              }
              return (
                <View style={styles.card}>
                  <Image source={{ uri: card.uri }} style={styles.cardImage} contentFit="contain" transition={120} />
                </View>
              );
            }}
            onSwiped={handleSwiped}
            onSwipedLeft={handleSwipeLeft}
            onSwipedRight={handleSwipeRight}
            onSwiping={handleSwiping}
            onTapCard={resetOverlays}
            backgroundColor="transparent"
            stackSize={3}
            disableTopSwipe
            disableBottomSwipe
            swipeBackCard
            swipeBackAnimationDuration={SWIPE_BACK_MS}
            showNextCard
            animateCardOpacity
            animateCardScale
            outputCardOpacityRangeX={[0.75, 1, 1, 1, 0.75]}
            containerStyle={styles.swiperContainer}
            cardStyle={{ top: 0, left: 16, right: 16, bottom: 0 }}
          />
          </Animated.View>
        )}

        {/* ── Photo pinch-to-zoom overlay ── sits above Swiper, pointerEvents lets
            horizontal swipes fall through; only pinch (2-finger) is captured here */}
        {mediaMode === 'photo' && !allSwiped && (
          <PinchGestureHandler
            ref={pinchRef}
            onGestureEvent={(e) => {
              const s = Math.max(1, Math.min(4, baseScaleRef.current * e.nativeEvent.scale));
              setZoomScale(s);
              setIsZoomed(s > 1.05);
            }}
            onHandlerStateChange={(e) => {
              if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED) {
                if (zoomScale < 1.15) {
                  baseScaleRef.current = 1;
                  setZoomScale(1);
                  setIsZoomed(false);
                } else {
                  baseScaleRef.current = zoomScale;
                }
              }
            }}
          >
            <Animated.View
              style={[styles.cardOverlay, { transform: [{ scale: zoomScale }] }]}
              pointerEvents="box-none"
            />
          </PinchGestureHandler>
        )}

        {/* ── Video controls overlay ── tap-to-pause + scrub bar + duration badge + pause icon
            Lives outside the Swiper so PanResponder and taps aren't swallowed */}
        {mediaMode === 'video' && !allSwiped && (
          <View style={styles.videoControlsOverlay} pointerEvents="box-none">
            {/* Tap-to-pause — covers the card but lets swipe gestures through */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleVideoTap}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Pause icon */}
            {isVideoPaused && (
              <View style={styles.pauseOverlay} pointerEvents="none">
                <Ionicons name="pause" size={52} color="rgba(255,255,255,0.7)" />
              </View>
            )}
            {/* Duration badge */}
            {formatDuration(activeAssets[videoCardIndex]?.duration) && (
              <View style={styles.durationBadge} pointerEvents="none">
                <Ionicons name="videocam" size={11} color="rgba(255,255,255,0.8)" />
                <Text style={styles.durationText}>
                  {formatDuration(activeAssets[videoCardIndex]?.duration)}
                </Text>
              </View>
            )}
            {/* Scrub bar */}
            <View style={styles.scrubBarContainer} pointerEvents="box-none">
              <ScrubBar
                progress={videoProgress}
                onScrubStart={handleScrubStart}
                onScrubEnd={handleScrubEnd}
                onScrubMove={handleScrubMove}
              />
            </View>
          </View>
        )}
      </View>

      {/* Metadata Panel */}
      <MetadataPanel
        photo={activePhoto}
        onInfoResolved={(info) => { activeAssetInfoRef.current = info; }}
      />

      {/* Action Buttons */}
      <ActionButtons
        onUndo={handleUndo}
        onReview={() => setReviewVisible(true)}
        onTrash={handleEmptyTrash}
        undoDisabled={activeHistory.length === 0}
        trashCount={activeTrashQ.length}
      />

      {/* Modal */}
      <TrashReviewModal
        visible={reviewVisible}
        trashQueue={activeTrashQ}
        photos={mediaMode === 'photo' ? photosRef.current : videosRef.current}
        swipeHistory={activeHistory}
        onClose={() => setReviewVisible(false)}
        onRescue={handleRescue}
      />
    </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000', alignItems: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.45)', fontSize: 15, position: 'absolute', top: '50%' },

  topBar: { position: 'absolute', top: 85, alignSelf: 'center', zIndex: Z.topBar, elevation: Z.topBar, alignItems: 'center', gap: 10 },
  storagePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, ...GLASS_BORDER, overflow: 'hidden' },
  storageText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },

  // Media toggle
  togglePill: { borderRadius: 20, overflow: 'hidden', ...GLASS_BORDER },
  toggleTrack: { flexDirection: 'row', alignItems: 'center', padding: 3, position: 'relative' },
  toggleThumb: {
    position: 'absolute', top: 3, left: 3,
    width: 72, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  toggleThumbRight: { left: 75 },
  toggleLabel: {
    width: 72, height: 28, lineHeight: 28,
    textAlign: 'center', fontSize: 13, fontWeight: '500',
    color: 'rgba(255,255,255,0.4)', letterSpacing: 0.2,
    zIndex: 1,
  },
  toggleLabelActive: { color: 'rgba(255,255,255,0.9)' },

  // Edge vignettes
  vignetteBase: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: VIGNETTE_WIDTH,
    zIndex: Z.overlay,
    pointerEvents: 'none',
  },
  vignetteLeft:  { left: 0 },
  vignetteRight: { right: 0 },

  deckArea: { width: SCREEN_WIDTH, height: CARD_HEIGHT, marginTop: 100, alignItems: 'center', justifyContent: 'center', zIndex: Z.swiper, elevation: Z.swiper },
  swiperContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  card: { width: SCREEN_WIDTH - 32, height: CARD_HEIGHT, borderRadius: 22, overflow: 'hidden', backgroundColor: '#0d0d0d', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.75, shadowRadius: 28, elevation: 18 },
  cardImage: { width: '100%', height: '100%', backgroundColor: '#0a0a0a' },

  doneCard: { width: SCREEN_WIDTH - 32, height: CARD_HEIGHT, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 12, ...GLASS_BORDER },
  doneText: { color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: '500' },

  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muteButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...GLASS_BORDER },

  // Duration badge on video cards
  durationBadge: {
    position: 'absolute', bottom: 52, left: 14,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.52)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  durationText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },

  // Pause overlay
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },

  // Scrub bar container
  scrubBarContainer: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    alignItems: 'center',
  },

  // Overlay that sits above the Swiper for pinch-to-zoom (photos)
  cardOverlay: {
    position: 'absolute',
    width: SCREEN_WIDTH - 32,
    height: CARD_HEIGHT,
    borderRadius: 22,
    alignSelf: 'center',
  },

  // Overlay for video controls (tap-to-pause, scrub, duration badge)
  videoControlsOverlay: {
    position: 'absolute',
    width: SCREEN_WIDTH - 32,
    height: CARD_HEIGHT,
    borderRadius: 22,
    overflow: 'hidden',
    alignSelf: 'center',
    zIndex: Z.swiper + 1,
    elevation: Z.swiper + 1,
  },

  // StoragePill dim text
  storageTextDim: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '400' },

  // Persistent video underlay: rendered before the Swiper so gestures pass through to it.
  videoOverlay: {
    position: 'absolute',
    width: SCREEN_WIDTH - 32,
    height: CARD_HEIGHT,
    borderRadius: 22,
    overflow: 'hidden',
    alignSelf: 'center',
    // No zIndex — sits underneath the Swiper which is rendered after it
  },
});