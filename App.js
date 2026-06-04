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

// Components & Constants
import TrashReviewModal from './components/TrashReviewModal';
import MetadataPanel from './components/MetadataPanel';
import ActionButtons from './components/ActionButtons';
import {
  SCREEN_WIDTH, SCREEN_HEIGHT, CARD_HEIGHT, Z, PAGE_SIZE, PREFETCH_BATCH,
  LOAD_AHEAD_THRESHOLD, MAX_PHOTOS_IN_MEMORY, TRIM_CHUNK, SWIPE_BACK_MS, GLASS_BORDER
} from './constants';


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

// ─── SplashScreen ─────────────────────────────────────────────────────────────
const SplashScreen = ({ icon, message, subtitle, pulse }) => {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();

    if (pulse) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.45, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
        ])
      ).start();
    }
  }, []);

  return (
    <View style={splashStyles.root}>
      <Animated.View style={[splashStyles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <BlurView intensity={55} tint="dark" style={splashStyles.blur}>
          <Animated.View style={{ opacity: pulse ? pulseAnim : 1 }}>
            <Ionicons name={icon} size={48} color="rgba(255,255,255,0.55)" />
          </Animated.View>
          <Text style={splashStyles.message}>{message}</Text>
          {subtitle && <Text style={splashStyles.subtitle}>{subtitle}</Text>}
        </BlurView>
      </Animated.View>
    </View>
  );
};

const splashStyles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  card:    { borderRadius: 28, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  blur:    { paddingHorizontal: 44, paddingVertical: 36, alignItems: 'center', gap: 14 },
  message: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '500', letterSpacing: 0.2, textAlign: 'center' },
  subtitle:{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: '400', textAlign: 'center', marginTop: -4 },
});

// ─── CardEntrance ─────────────────────────────────────────────────────────────
const CardEntrance = ({ children }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      tension: 55,
      friction: 11,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
    }}>
      {children}
    </Animated.View>
  );
};

// ─── MediaToggle ──────────────────────────────────────────────────────────────
const MediaToggle = ({ mode, onChange }) => {
  const thumbAnim = useRef(new Animated.Value(mode === 'video' ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(thumbAnim, {
      toValue: mode === 'video' ? 1 : 0,
      useNativeDriver: true,
      tension: 68,
      friction: 10,
    }).start();
  }, [mode]);

  const thumbTranslate = thumbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 72],
  });

  return (
    <BlurView intensity={50} tint="dark" style={styles.togglePill}>
      <View style={styles.toggleTrack}>
        <Animated.View
          style={[styles.toggleThumb, { transform: [{ translateX: thumbTranslate }] }]}
        />
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
};

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
  const topBarAnim   = useRef(new Animated.Value(0)).current;

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

  // Top bar fade+slide entrance when media first loads
  useEffect(() => {
    if (!photosLoaded && !videosLoaded) return;
    Animated.spring(topBarAnim, {
      toValue: 1,
      tension: 60,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [photosLoaded, videosLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swipe hint — spring nudge left then right then settle, once per session
  useEffect(() => {
    if (hintShownRef.current) return;
    const activeLen = mediaModeRef.current === 'photo' ? photos.length : videos.length;
    if (activeLen === 0) return;
    hintShownRef.current = true;
    const delay = setTimeout(() => {
      Animated.sequence([
        Animated.spring(hintAnim, { toValue: -32, tension: 180, friction: 8,  useNativeDriver: true }),
        Animated.spring(hintAnim, { toValue: 24,  tension: 140, friction: 7,  useNativeDriver: true }),
        Animated.spring(hintAnim, { toValue: 0,   tension: 100, friction: 10, useNativeDriver: true }),
      ]).start();
    }, 900);
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
        ({ sound: keepSound  } = await Audio.Sound.createAsync(require('./assets/SwitchClick.mp3'), { volume: 0.7 }));
        ({ sound: trashSound } = await Audio.Sound.createAsync(require('./assets/PaperSlide.mp3'),  { volume: 0.8 }));
        keepSoundRef.current  = keepSound;
        trashSoundRef.current = trashSound;

        // Pre-warm: play silently so the audio engine is primed for instant first swipe
        await keepSound.setVolumeAsync(0);
        await keepSound.replayAsync();
        await keepSound.setVolumeAsync(0.7);
        await trashSound.setVolumeAsync(0);
        await trashSound.replayAsync();
        await trashSound.setVolumeAsync(0.8);
      } catch (e) {
        console.warn('Sound init failed:', e);
      }
    })();
    return () => {
      keepSound?.unloadAsync();
      trashSound?.unloadAsync();
    };
  }, []);

  // Fire-and-forget: replayAsync is a single atomic seek+play call — no await needed,
  // no gap between seek and play, and rapid swipes interrupt cleanly without stuttering.
  const playKeep = useCallback(() => {
    keepSoundRef.current?.replayAsync().catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const playTrash = useCallback(() => {
    trashSoundRef.current?.replayAsync().catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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

  if (hasPermission === null) return <SplashScreen icon="ellipsis-horizontal" message="Requesting permissions…" />;
  if (hasPermission === false) return <SplashScreen icon="lock-closed-outline" message="No access to camera roll." subtitle="Enable in Settings → Privacy → Photos" />;
  if (photos.length === 0 && !photosLoaded && videos.length === 0 && !videosLoaded) return <SplashScreen icon="images-outline" message="Loading media…" pulse />;

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
      <Animated.View
        style={[styles.topBar, {
          opacity: topBarAnim,
          transform: [{ translateY: topBarAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
        }]}
        pointerEvents="box-none"
      >
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
      </Animated.View>

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
          <SplashScreen icon="images-outline" message="No photos found" />
        ) : mediaMode === 'video' && videosLoaded && videos.length === 0 ? (
          <SplashScreen icon="videocam-outline" message="No videos found" />
        ) : allSwiped ? (
          <SplashScreen icon="checkmark-circle" message="All caught up!" subtitle="Nothing left to review" />
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
                  <CardEntrance>
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
                  </CardEntrance>
                );
              }
              return (
                <CardEntrance>
                  <View style={styles.card}>
                    <Image source={{ uri: card.uri }} style={styles.cardImage} contentFit="contain" transition={220} />
                  </View>
                </CardEntrance>
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
                <BlurView intensity={55} tint="dark" style={styles.pausePill}>
                  <Ionicons name="pause" size={28} color="rgba(255,255,255,0.92)" />
                </BlurView>
              </View>
            )}
            {/* Duration badge */}
            {formatDuration(activeAssets[videoCardIndex]?.duration) && (
              <BlurView intensity={52} tint="dark" style={styles.durationBadge} pointerEvents="none">
                <Ionicons name="play" size={10} color="rgba(255,255,255,0.85)" />
                <Text style={styles.durationText}>
                  {formatDuration(activeAssets[videoCardIndex]?.duration)}
                </Text>
              </BlurView>
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },

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
    position: 'absolute', bottom: 56, left: 14,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  durationText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },

  // Pause overlay
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  pausePill: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
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