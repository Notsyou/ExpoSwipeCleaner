import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { createRef, memo, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, PanResponder, Pressable, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { GestureHandlerRootView, PinchGestureHandler, State } from 'react-native-gesture-handler';

// Components & Constants
import ActionButtons from './components/ActionButtons';
import MetadataPanel, { fetchAssetInfo } from './components/MetadataPanel';
import PhotoFilterSheet from './components/PhotoFilterSheet';
import TrashReviewModal from './components/TrashReviewModal';
import Tutorial from './components/Tutorial';
import { hasSeenTutorial, markTutorialSeen } from './lib/tutorial';
import AdvisoryBanner from './components/AdvisoryBanner';
import EmbedderHost from './components/EmbedderHost';
import StatsSheet from './components/StatsSheet';
import { decide, loadAdvisorState, recordActed, recordDismissed, recordShown, RULES as ADVISOR_RULES } from './lib/advisor';
import { deleteRows, estimateSize, getSizes } from './lib/db';
import { flushEvents, logEvent } from './lib/events';
import { appendFreed } from './lib/freedLog';
import { clusterIdOf, isInCluster, onIndexProgress, setBusyProbe, startIndexer, stopIndexer } from './lib/indexer';
import { conditionFor, loadStudySettings, onStudyChange } from './lib/study';
import { computeSummary, loadSummary, saveSummary } from './lib/summary';
import { isScreenshot, loadProgress, needsExif, PHOTO_DECKS, PHOTO_TYPES, saveProgress, selectForDeck, setClusterLookup } from './lib/progress';
import {
  albumIdOf, deleteFileAssets, enrichWithExif, fileAssetFromId, getSavedFolder, getScreenshotsAlbum,
  IS_IOS, isAlbumDeck, isFileAsset, listFolderImages,
} from './lib/sources';
import { listenForReminderTaps, refreshReminder } from './lib/reminder';
import {
  CARD_HEIGHT,
  GLASS_BORDER,
  LOAD_AHEAD_THRESHOLD, MAX_PHOTOS_IN_MEMORY,
  PAGE_SIZE, PREFETCH_BATCH,
  SCREEN_WIDTH,
  SWIPE_BACK_MS,
  TRIM_CHUNK,
  Z
} from './constants';


const VIGNETTE_WIDTH = SCREEN_WIDTH * 0.35;

// ─── Helpers ──────────────────────────────────────────────────────────────────
// The Similar deck also uses the on-device near-duplicate clusters
setClusterLookup({ isInCluster, clusterIdOf });

const formatDuration = (secs) => {
  if (!secs || secs <= 0) return null;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// ─── StoragePill ──────────────────────────────────────────────────────────────
const StoragePill = ({ savedBytes, totalBytes, totalApprox, onPress, onLongPress, targetRef }) => {
  // Always rendered: it's also the long-press target for "start over".
  // Expo Go never reports library file sizes, so the total is often 0 — hide just that part.
  const hasTotal = totalBytes > 0;
  const toGB = (b) => b >= 1024 * 1024 * 1024
    ? (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
    : (b / (1024 * 1024)).toFixed(0) + ' MB';
  return (
    <Pressable
      ref={targetRef}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      accessibilityRole="button"
      accessibilityHint="Tap for stats, long-press to start over this deck"
    >
      <BlurView intensity={50} tint="dark" style={styles.storagePill}>
        <Ionicons name="cloud-done-outline" size={13} color="rgba(255,255,255,0.55)" />
        <Text style={styles.storageText}>{savedBytes > 0 ? `${toGB(savedBytes)} saved` : 'Nothing in trash'}</Text>
        {hasTotal && <Text style={styles.storageTextDim}>·</Text>}
        {hasTotal && <Text style={styles.storageTextDim}>{totalApprox ? '~' : ''}{toGB(totalBytes)} total</Text>}
      </BlurView>
    </Pressable>
  );
};

// ─── DeckPill ─────────────────────────────────────────────────────────────────
// Shows the active photo filters; tap opens the filter sheet
const DeckPill = ({ deck, type, sort, albumTitle, onPress, targetRef }) => {
  const current = isAlbumDeck(deck)
    ? { key: deck, label: albumTitle ?? 'Album', icon: 'folder-outline' }
    : PHOTO_DECKS.find(d => d.key === deck) ?? PHOTO_DECKS[0];
  const typeLabel = PHOTO_TYPES.find(t => t.key === type)?.label;
  const base = type === 'all' ? current.label
    : deck === 'all' ? typeLabel
    : `${current.label} · ${typeLabel}`;
  const label = sort === 'largest' ? `${base} · Largest` : base;
  return (
    <TouchableOpacity ref={targetRef} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Photo filters: ${label}`}>
      <BlurView intensity={50} tint="dark" style={styles.storagePill}>
        <Ionicons name={current.icon} size={13} color="rgba(255,255,255,0.75)" />
        <Text style={styles.storageText}>{label}</Text>
        <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.75)" />
      </BlurView>
    </TouchableOpacity>
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

// ─── PhotoCard ────────────────────────────────────────────────────────────────
// Memoized so unrelated app state doesn't re-render the whole card stack.
const PhotoCard = memo(({ card }) => (
  <CardEntrance>
    <View style={styles.card}>
      <Image source={{ uri: card.uri }} style={styles.cardImage} contentFit="contain" transition={120} cachePolicy="memory-disk" />
      {card.labels && (
        <View style={styles.labelRow} pointerEvents="none">
          {[card.labels.source, card.labels.duplicate].map(label => (
            <View key={label} style={styles.labelChip}>
              <Text style={styles.durationText}>{label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  </CardEntrance>
));
PhotoCard.displayName = 'PhotoCard';

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

  // ── Session lifecycle: study mode, 24h reminder, session events ──────────
  // Reminder taps are logged; every launch/foreground reschedules the reminder.
  // `lifecycleRef` is filled in further down once the handlers exist.
  const sessionRef = useRef({ start: 0, kept: 0, trashed: 0, active: false });
  const lifecycleRef = useRef({ foreground: () => {}, background: () => {}, studyChanged: () => {} });
  useEffect(() => {
    const unsubscribe = listenForReminderTaps();
    const begin = () => {
      if (sessionRef.current.active) return;
      sessionRef.current = { start: Date.now(), kept: 0, trashed: 0, active: true };
      logEvent('session_start');
      refreshReminder();
      lifecycleRef.current.foreground();
    };
    const end = () => {
      const s = sessionRef.current;
      if (!s.active) return;
      s.active = false;
      lifecycleRef.current.background();
      logEvent('session_end', { durationMs: Date.now() - s.start, kept: s.kept, trashed: s.trashed });
      flushEvents();
    };
    loadStudySettings().then(begin);
    const offStudy = onStudyChange(() => { refreshReminder(); lifecycleRef.current.studyChanged(); });
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') begin();
      else if (next === 'background') end();
    });
    return () => { unsubscribe(); offStudy(); sub.remove(); };
  }, []);

  // Library analysis backs off while the user is swiping
  const lastInteractionRef = useRef(0);

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

  // ── Persisted progress + smart decks ───────────────────────────────────────
  // reviewedBaseRef: IDs reviewed in earlier sessions (or before a history reset).
  // This session's swipes live in swipeHistory and are merged in when saving.
  const reviewedBaseRef = useRef({ photo: new Set(), video: new Set() });
  // Trashed assets that aren't in the current deck (restored from storage or
  // left behind by a deck switch) — kept so the review modal can still show them.
  const trashCacheRef = useRef({ photo: new Map(), video: new Map() });
  const progressReadyRef = useRef(false);
  const [photoDeck, setPhotoDeck] = useState('all');
  const photoDeckRef = useRef('all');
  const [photoType, setPhotoType] = useState('all');
  const photoTypeRef = useRef('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // iOS revoked access to the picked Files folder (usually after a restart)
  const [folderAccessLost, setFolderAccessLost] = useState(false);
  const [albumTitle, setAlbumTitle] = useState(null);
  // iOS "Selected Photos" access: albums only show the photos the user picked
  const [limitedAccess, setLimitedAccess] = useState(false);
  const [scanStats, setScanStats] = useState({ scanned: 0, reviewedSkipped: 0 });
  const deckGenerationRef = useRef(0);
  const deckScanRef = useRef({ prev: null, prevEmitted: false });
  const countedIdsRef = useRef(new Set());

  // ── Hint animation ─────────────────────────────────────────────────────────
  const hintAnim = useRef(new Animated.Value(0)).current;
  const hintShownRef = useRef(false);

  // ── Pinch-to-zoom (photos) ─────────────────────────────────────────────────
  const zoomScaleRef = useRef(1);
  const baseScaleRef = useRef(1);
  const pinchRef = useRef(null);

  // ── Video scrub / pause ────────────────────────────────────────────────────
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);   // 0–1
  const [videoDuration, setVideoDuration] = useState(0);   // seconds
  const scrubbing = useRef(false);
  const isVideoPausedRef = useRef(false);
  useEffect(() => { isVideoPausedRef.current = isVideoPaused; }, [isVideoPaused]);

  // ── Total storage ──────────────────────────────────────────────────────────
  const [totalStorageBytes, setTotalStorageBytes] = useState(0);

  // ── Empty-state flags ──────────────────────────────────────────────────────
  const [photosLoaded, setPhotosLoaded] = useState(false);

  const [resetting, setResetting] = useState(false);
  const [progressBump, setProgressBump] = useState(0); // forces a save after a reset

  // ── Advisory banner (tier 1) ─────────────────────────────────────────────
  const [advisory, setAdvisory] = useState(null);
  const advisoryRef = useRef(null);
  const advisorCheckedRef = useRef(false);   // one decision per session
  const bannerShownAtRef = useRef(0);
  const swipesSinceBannerRef = useRef(0);

  // Launch decision: reads only the cached summary from the previous session
  const runAdvisor = useCallback(async () => {
    if (advisorCheckedRef.current) return;
    advisorCheckedRef.current = true;
    const [summary, state, seenTutorial] = await Promise.all([loadSummary(), loadAdvisorState(), hasSeenTutorial()]);
    if (!seenTutorial) { logEvent('banner_suppressed', { reason: 'tutorial' }); return; }
    const d = decide({ summary, state, condition: conditionFor() });
    if (!d.show) { logEvent('banner_suppressed', { reason: d.reason, pressure: d.pressure }); return; }
    await recordShown();
    bannerShownAtRef.current = Date.now();
    swipesSinceBannerRef.current = 0;
    advisoryRef.current = d;
    setAdvisory(d);
    logEvent('banner_shown', { advisory: d.type, phrasingId: d.phrasingId, pressure: d.pressure, summaryAgeMs: Date.now() - summary.computedAt });
  }, []);

  // outcome: 'acted' | 'dismissed' | 'ignored'. Returns the closed advisory.
  const closeAdvisory = useCallback(async (outcome) => {
    const adv = advisoryRef.current;
    if (!adv) return null;
    advisoryRef.current = null;
    setAdvisory(null);
    const info = { advisory: adv.type, phrasingId: adv.phrasingId, afterMs: Date.now() - bannerShownAtRef.current };
    if (outcome === 'acted') {
      await recordActed();
      logEvent('banner_acted', info);
    } else {
      logEvent(outcome === 'ignored' ? 'banner_ignored' : 'banner_dismissed', { ...info, ...(await recordDismissed()) });
    }
    return adv;
  }, []);

  // ── Stats sheet + library summary ──────────────────────────────────────────
  const [statsVisible, setStatsVisible] = useState(false);
  const [librarySummary, setLibrarySummary] = useState(null);
  useEffect(() => { loadSummary().then((s) => s && setLibrarySummary(s)); }, []);

  // ── Photo sort ('newest' | 'largest') ──────────────────────────────────────
  const [photoSort, setPhotoSort] = useState('newest');
  const photoSortRef = useRef('newest');
  const sizeOrderRef = useRef(null);   // { generation, list, pos } for the largest-first deck

  // ── Tutorial ───────────────────────────────────────────────────────────────
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialTargets] = useState(() => Object.fromEntries(
    ['deck', 'mediaToggle', 'deckPill', 'storagePill', 'undo', 'review', 'trash', 'help'].map((k) => [k, createRef()]),
  ));
  const closeTutorial = useCallback(() => {
    setTutorialVisible(false);
    markTutorialSeen();
  }, []);
  // First launch: show once the deck is up (after the top bar's entrance animation)
  const tutorialCheckedRef = useRef(false);
  useEffect(() => {
    if (!photosLoaded || tutorialCheckedRef.current) return;
    tutorialCheckedRef.current = true;
    let timer;
    hasSeenTutorial().then((seen) => {
      if (!seen) timer = setTimeout(() => setTutorialVisible(true), 900);
    });
    return () => clearTimeout(timer);
  }, [photosLoaded]);
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
    // Only the in-memory deck. Trashed photos live in trashCacheRef, so trimmed
    // cards can be released instead of piling up for the whole session.
    photosRef.current = photos;
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
  const activePlayer = useVideoPlayer(null, (p) => { p.loop = true; p.volume = 0; p.audioMixingMode = 'mixWithOthers'; });
  const activePlayerRef = useRef(null);
  useEffect(() => { activePlayerRef.current = activePlayer; }, [activePlayer]);

  // Guards against out-of-order replaceAsync resolution when swiping quickly —
  // only the most recently issued replace is allowed to call .play() when it resolves.
  const replaceRequestIdRef = useRef(0);

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
      const requestId = ++replaceRequestIdRef.current;
      activePlayer.replaceAsync({ uri: currentUri }).then(() => {
        if (replaceRequestIdRef.current !== requestId) return;
        // replaceAsync resets player config to defaults — loop must be re-applied
        // on every swap, or each clip plays once and stops at its natural end.
        activePlayer.loop = true;
        activePlayer.audioMixingMode = 'mixWithOthers';
        activePlayer.volume = isMutedRef.current ? 0 : 1;
        activePlayer.play();
      }).catch(() => {});
    }
  }, [mediaMode, videos.length > 0, activePlayer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume if the OS or another player pauses the video without the user tapping
  useEffect(() => {
    const sub = activePlayer.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying || mediaModeRef.current !== 'video') return;
      if (isVideoPausedRef.current || scrubbing.current) return;
      activePlayer.play();
    });
    return () => sub.remove();
  }, [activePlayer]);

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
    isVideoPausedRef.current = false;
    setIsVideoPaused(false);
  }, []);

  // ── Load sounds ────────────────────────────────────────────────────────────
  useEffect(() => {
    let keepSound, trashSound;
    (async () => {
      try {
        // Mix with the video player — taking audio focus here pauses the video mid-clip.
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });

        keepSound  = createAudioPlayer(require('./assets/SwitchClick.mp3'));
        trashSound = createAudioPlayer(require('./assets/PaperSlide.mp3'));
        keepSoundRef.current  = keepSound;
        trashSoundRef.current = trashSound;

        // Pre-warm: play silently so the audio engine is primed for instant first swipe
        keepSound.volume = 0;
        keepSound.play();
        await keepSound.seekTo(0);
        keepSound.volume = 0.7;

        trashSound.volume = 0;
        trashSound.play();
        await trashSound.seekTo(0);
        trashSound.volume = 0.8;
      } catch (e) {
        console.warn('Sound init failed:', e);
      }
    })();
    return () => {
      keepSound?.remove();
      trashSound?.remove();
    };
  }, []);

  // Await seekTo before play — seekTo is async under the hood, and calling
  // play() before it resolves on rapid swipes causes drift/desync between
  // swipe timing and the sound actually firing.
  const playKeep = useCallback(async () => {
    try {
      const player = keepSoundRef.current;
      if (player) {
        await player.seekTo(0);
        player.play();
      }
    } catch {}
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const playTrash = useCallback(async () => {
    try {
      const player = trashSoundRef.current;
      if (player) {
        await player.seekTo(0);
        player.play();
      }
    } catch {}
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  // Everything reviewed so far for a mode: earlier sessions + this session's swipes
  const getReviewedSet = useCallback((mode) => {
    const history = mode === 'photo' ? swipeHistoryRef.current : videoSwipeHistoryRef.current;
    const set = new Set(reviewedBaseRef.current[mode]);
    for (const h of history) if (h.assetId) set.add(h.assetId);
    return set;
  }, []);

  // Recompute the storage-composition summary from the index (throttled) and cache
  // it for the next launch's advisory decision
  const trashQueueRef = useRef([]);
  useEffect(() => { trashQueueRef.current = trashQueue; }, [trashQueue]);
  const summaryAtRef = useRef(0);
  const updateSummary = useCallback(async (force = false) => {
    if (!force && Date.now() - summaryAtRef.current < 30000) return;
    summaryAtRef.current = Date.now();
    try {
      const summary = await computeSummary({ reviewed: getReviewedSet('photo'), trashed: new Set(trashQueueRef.current) });
      await saveSummary(summary);
      setLibrarySummary(summary);
    } catch {}
  }, [getReviewedSet]);

  useEffect(() => {
    setBusyProbe(() => Date.now() - lastInteractionRef.current < 1500);
    onIndexProgress(() => updateSummary());
  }, [updateSummary]);

  // Restore reviewed IDs and the pending trash queue. Trashed assets are re-fetched
  // so ones deleted outside the app are dropped instead of failing at delete time.
  const restoreProgress = useCallback(async () => {
    const saved = await loadProgress();
    for (const mode of ['photo', 'video']) {
      reviewedBaseRef.current[mode] = new Set(saved.reviewed[mode]);
      const restored = (await Promise.all(saved.trash[mode].map(async ({ id, fileSize }) => {
        try {
          if (isFileAsset(id)) {
            const asset = fileAssetFromId(id);
            return asset ? { asset, fileSize: fileSize ?? asset.fileSize } : null;
          }
          const asset = await MediaLibrary.getAssetInfoAsync(id);
          return asset ? { asset, fileSize: fileSize ?? 0 } : null;
        } catch {
          return null;
        }
      }))).filter(Boolean);
      for (const { asset, fileSize } of restored) {
        trashCacheRef.current[mode].set(asset.id, { asset, fileSize });
      }
      const ids   = restored.map(r => r.asset.id);
      const bytes = restored.reduce((acc, r) => acc + r.fileSize, 0);
      if (mode === 'photo') { setTrashQueue(ids); setTrashSizeBytes(bytes); }
      else                  { setVideoTrashQueue(ids); setVideoTrashSizeBytes(bytes); }
    }
    progressReadyRef.current = true;
  }, []);

  // Pages through the library until there's enough to swipe — filtered decks and
  // already-reviewed assets can make whole pages come back empty.
  // `album` narrows the query; `enrich` runs on not-yet-reviewed assets before `select`.
  const fetchUnreviewed = useCallback(async (mediaType, cursor, select, isStale, { album, enrich, reviewed } = {}) => {
    const found = [];
    let after = cursor;
    let hasNext = true;
    while (hasNext && found.length < PREFETCH_BATCH) {
      const media = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE, mediaType, album: album ?? undefined,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]], after: after ?? undefined,
      });
      if (isStale()) return null;
      // Tally total storage once per asset, however many decks rescan it
      let newBytes = 0;
      for (const a of media.assets) {
        if (countedIdsRef.current.has(a.id)) continue;
        countedIdsRef.current.add(a.id);
        newBytes += a.fileSize ?? 0;
      }
      if (newBytes) setTotalStorageBytes(prev => prev + newBytes);
      if (enrich) {
        await enrich(reviewed ? media.assets.filter(a => !reviewed.has(a.id)) : media.assets);
        if (isStale()) return null;
      }
      found.push(...select(media.assets));
      after = media.endCursor;
      hasNext = media.hasNextPage;
    }
    return { assets: found, endCursor: after, hasNextPage: hasNext };
  }, []);

  // Largest-first order: list the whole deck once per deck load, sort it by the indexed
  // file sizes (estimated from resolution until measured), then page through that list.
  const fetchBySize = useCallback(async (generation, isStale, select, album, reviewed, deck) => {
    let order = sizeOrderRef.current;
    if (!order || order.generation !== generation) {
      const list = [];
      let after;
      let hasNext = true;
      while (hasNext) {
        const media = await MediaLibrary.getAssetsAsync({
          first: 500, mediaType: 'photo', album: album ?? undefined,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]], after,
        });
        if (isStale()) return null;
        list.push(...media.assets.filter(a => !reviewed.has(a.id)));
        after = media.endCursor;
        hasNext = media.hasNextPage;
      }
      if (IS_IOS && deck === 'downloads') {
        try {
          const folder = await getSavedFolder();
          if (folder) list.push(...listFolderImages(folder).filter(a => !reviewed.has(a.id)));
        } catch {
          setFolderAccessLost(true);
        }
      }
      const sizes = await getSizes(list.map(a => a.id));
      if (isStale()) return null;
      const sizeOf = (a) => sizes.get(a.id)?.size ?? a.fileSize ?? estimateSize('photo', a.width, a.height);
      list.sort((a, b) => sizeOf(b) - sizeOf(a));
      order = sizeOrderRef.current = { generation, list, pos: 0 };
    }
    const found = [];
    while (order.pos < order.list.length && found.length < PREFETCH_BATCH) {
      const chunk = order.list.slice(order.pos, order.pos + PAGE_SIZE);
      order.pos += chunk.length;
      if (needsExif(deck)) {
        await enrichWithExif(chunk.filter(a => !isScreenshot(a)));
        if (isStale()) return null;
      }
      found.push(...select(chunk));
    }
    return { assets: found, endCursor: String(order.pos), hasNextPage: order.pos < order.list.length };
  }, []);

  // FIX #3: loadMorePhotos uses ref for hasNextPage guard, not stale closure
  const loadMorePhotos = useCallback(async (cursor = null) => {
    if (!hasNextPageRef.current && cursor !== null) return;
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const generation = deckGenerationRef.current;
    const isStale = () => generation !== deckGenerationRef.current;
    try {
      const reviewed = getReviewedSet('photo');
      const deck = photoDeckRef.current;
      const select = (assets) => {
        // Counted so an empty deck can say *why* it's empty
        const scan = deckScanRef.current;
        scan.scanned = (scan.scanned ?? 0) + assets.length;
        scan.reviewedSkipped = (scan.reviewedSkipped ?? 0) + assets.filter(a => reviewed.has(a.id)).length;
        return selectForDeck(deck, assets, scan, reviewed, photoTypeRef.current);
      };
      let album = albumIdOf(deck);
      // iOS keeps screenshots in a smart album, so query it directly instead of scanning everything
      if (!album && deck === 'screenshots') album = (await getScreenshotsAlbum())?.id ?? null;
      if (isStale()) return;
      const largest = photoSortRef.current === 'largest' && deck !== 'similar';
      const page = largest
        ? await fetchBySize(generation, isStale, select, album, reviewed, deck)
        : await fetchUnreviewed('photo', cursor, select, isStale, {
          // Screenshots never count as camera or download, so skip their EXIF lookup
          album, reviewed, enrich: needsExif(deck) ? (assets) => enrichWithExif(assets.filter(a => !isScreenshot(a))) : null,
        });
      if (!page) return;
      // iOS Downloads also includes the Files-app folder the user picked, shown first
      // (the largest-first list already includes it)
      if (IS_IOS && deck === 'downloads' && cursor === null && !largest) {
        const folder = await getSavedFolder();
        if (isStale()) return;
        if (folder) {
          try {
            page.assets.unshift(...select(listFolderImages(folder)));
          } catch {
            setFolderAccessLost(true);
          }
        }
      }
      // An undone photo sits in the deck already and can also turn up in a later page
      setPhotos(prev => {
        const present = new Set(prev.map(p => p.id));
        return [...prev, ...page.assets.filter(a => !present.has(a.id))];
      });
      setEndCursor(page.endCursor);
      setHasNextPage(page.hasNextPage);
      hasNextPageRef.current = page.hasNextPage;
      endCursorRef.current = page.endCursor;
      Image.prefetch(page.assets.slice(0, PREFETCH_BATCH).map(a => a.uri));
      const { scanned = 0, reviewedSkipped = 0 } = deckScanRef.current;
      setScanStats({ scanned, reviewedSkipped });
      setPhotosLoaded(true);
    } finally {
      // A deck switch mid-load hands the flag to the new load — don't clobber it
      if (!isStale()) loadingMoreRef.current = false;
    }
  }, [getReviewedSet, fetchUnreviewed, fetchBySize]);

  // FIX #3: loadMoreVideos uses ref for videoHasNextPage guard
  const loadMoreVideos = useCallback(async (cursor = null) => {
    if (!videoHasNextPageRef.current && cursor !== null) return;
    if (loadingMoreVideosRef.current) return;
    loadingMoreVideosRef.current = true;
    try {
      const reviewed = getReviewedSet('video');
      const page = await fetchUnreviewed('video', cursor,
        (assets) => assets.filter(a => !reviewed.has(a.id)), () => false);
      setVideos(prev => [...prev, ...page.assets]);
      setVideoEndCursor(page.endCursor);
      setVideoHasNextPage(page.hasNextPage);
      videoHasNextPageRef.current = page.hasNextPage;
      videoEndCursorRef.current = page.endCursor;
      setVideosLoaded(true);
    } finally {
      loadingMoreVideosRef.current = false;
    }
  }, [getReviewedSet, fetchUnreviewed]);

  // ── Load Initial Photos ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status, accessPrivileges } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      setLimitedAccess(accessPrivileges === 'limited');
      if (status === 'granted') {
        await restoreProgress();
        loadMorePhotos();
        loadMoreVideos();
        startIndexer();
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save progress (debounced) ──────────────────────────────────────────────
  useEffect(() => {
    if (!progressReadyRef.current) return;
    const timer = setTimeout(() => {
      const trashFor = (mode, queue, history) => queue.map(id => ({
        id,
        fileSize: history.find(h => h.assetId === id && h.dir === 'left')?.fileSize
               ?? trashCacheRef.current[mode].get(id)?.fileSize ?? 0,
      }));
      saveProgress({
        reviewed: { photo: [...getReviewedSet('photo')], video: [...getReviewedSet('video')] },
        trash: {
          photo: trashFor('photo', trashQueue, swipeHistory),
          video: trashFor('video', videoTrashQueue, videoSwipeHistory),
        },
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [trashQueue, videoTrashQueue, swipeHistory, videoSwipeHistory, getReviewedSet, progressBump]);

  // Folds this session's swipes into the persisted base so clearing history
  // (empty trash, deck switch) doesn't make reviewed assets reappear.
  const commitHistory = useCallback((mode) => {
    reviewedBaseRef.current[mode] = getReviewedSet(mode);
  }, [getReviewedSet]);

  const resetOverlays = useCallback(() => {
    trashOpacity.setValue(0);
    keepOpacity.setValue(0);
  }, [trashOpacity, keepOpacity]);

  const handleModeChange = useCallback((m) => {
    mediaModeRef.current = m;
    setMediaMode(m);
    // Leaving videos pauses playback; entering always starts unpaused
    if (m === 'photo') activePlayerRef.current?.pause();
    else { isVideoPausedRef.current = false; setIsVideoPaused(false); }
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
  // The Swiper passes the swiped card itself; prefer it over an index lookup,
  // which can be off by a trim chunk while a trim is in flight.
  const handleSwipeLeft = useCallback((swiperIndex, card) => {
    if (mediaModeRef.current === 'photo') {
      const photo = card ?? photosRef.current[swiperIndex];
      if (!photo?.id) return;
      const fileSize = activeAssetInfoRef.current?.fileSize ?? 0;
      setTrashQueue(prev => {
        if (prev.includes(photo.id)) return prev; // guard against double-fire
        return [...prev, photo.id];
      });
      trashCacheRef.current.photo.set(photo.id, { asset: photo, fileSize });
      setSwipeHistory(prev => [...prev, { dir: 'left', assetId: photo.id, fileSize, asset: photo, generation: deckGenerationRef.current }]);
      setTrashSizeBytes(prev => prev + fileSize);
      sessionRef.current.trashed++;
    } else {
      const video = card ?? videosRef.current[swiperIndex];
      if (!video?.id) return;
      const fileSize = activeAssetInfoRef.current?.fileSize ?? 0;
      setVideoTrashQueue(prev => {
        if (prev.includes(video.id)) return prev;
        return [...prev, video.id];
      });
      setVideoSwipeHistory(prev => [...prev, { dir: 'left', assetId: video.id, fileSize }]);
      setVideoTrashSizeBytes(prev => prev + fileSize);
      sessionRef.current.trashed++;
    }
    playTrash();
  }, [playTrash]);

  const handleSwipeRight = useCallback((swiperIndex, card) => {
    if (mediaModeRef.current === 'photo') {
      const photo = card ?? photosRef.current[swiperIndex];
      setSwipeHistory(prev => [...prev, { dir: 'right', assetId: photo?.id, fileSize: 0, asset: photo, generation: deckGenerationRef.current }]);
    } else {
      const video = card ?? videosRef.current[swiperIndex];
      setVideoSwipeHistory(prev => [...prev, { dir: 'right', assetId: video?.id, fileSize: 0 }]);
    }
    sessionRef.current.kept++;
    playKeep();
  }, [playKeep]);

  // FIX #2: handleSwiped reads pagination state from refs, not stale closure
  const handleSwiped = useCallback((index) => {
    lastInteractionRef.current = Date.now();
    // A banner left alone for a few swipes counts as ignored
    if (advisoryRef.current && ++swipesSinceBannerRef.current >= ADVISOR_RULES.IGNORE_AFTER_SWIPES) closeAdvisory('ignored');
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

      // Swap the player to the next video on swipe — guarded against out-of-order resolution
      const nextUri = videosRef.current[nextVideoIndex]?.uri;
      if (nextUri) {
        const requestId = ++replaceRequestIdRef.current;
        activePlayer.replaceAsync({ uri: nextUri }).then(() => {
          if (replaceRequestIdRef.current !== requestId) return;
          // replaceAsync resets player config to defaults — loop must be
          // re-applied on every swap, or the clip plays once and stops.
          activePlayer.loop = true;
          activePlayer.audioMixingMode = 'mixWithOthers';
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
  }, [resetOverlays, loadMorePhotos, loadMoreVideos, activePlayer, resetVideoUI, closeAdvisory]);

  const handleSwiping = useCallback((x) => {
    lastInteractionRef.current = Date.now();
    const threshold = 40;
    if (x < -threshold) {
      trashOpacity.setValue(Math.min(1, (Math.abs(x) - threshold) / 80));
      keepOpacity.setValue(0);
    } else if (x > threshold) {
      keepOpacity.setValue(Math.min(1, (x - threshold) / 80));
      trashOpacity.setValue(0);
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
      const removeFromTrash = () => {
        if (last.dir !== 'left' || !last.assetId) return;
        // A rescued photo already left the trash and had its size subtracted
        if (trashCacheRef.current.photo.delete(last.assetId)) {
          setTrashSizeBytes(prev => Math.max(0, prev - (last.fileSize ?? 0)));
        }
        setTrashQueue(q => q.filter(id => id !== last.assetId));
      };

      setSwipeHistory(prev => prev.slice(0, -1));

      // The swipe happened under another filter, so its card isn't behind the current
      // one. Put the photo back on top of the deck, even if this filter wouldn't list it.
      if (last.generation !== deckGenerationRef.current) {
        removeFromTrash();
        reviewedBaseRef.current.photo.delete(last.assetId);
        if (last.asset) {
          setPhotos(prev => {
            const at = Math.min(cardIndexRef.current, prev.length);
            return [...prev.slice(0, at), last.asset, ...prev.slice(at).filter(p => p.id !== last.assetId)];
          });
        }
        undoUnlockTimeoutRef.current = setTimeout(() => { undoInFlightRef.current = false; }, 150);
        return;
      }

      setCardIndex(nextIndex);
      setTimeout(removeFromTrash, SWIPE_BACK_MS + 50);
    } else {
      setVideoCardIndex(nextIndex);
      setVideoSwipeHistory(prev => prev.slice(0, -1));
      if (last.dir === 'left' && last.assetId) {
        setTimeout(() => {
          setVideoTrashQueue(q => q.filter(id => id !== last.assetId));
          setVideoTrashSizeBytes(prev => Math.max(0, prev - (last.fileSize ?? 0)));
        }, SWIPE_BACK_MS + 50);
      }

      // Restore the player to the previous video on undo — guarded against out-of-order resolution
      const prevUri = videosRef.current[nextIndex]?.uri;
      if (prevUri) {
        const requestId = ++replaceRequestIdRef.current;
        activePlayer.replaceAsync({ uri: prevUri }).then(() => {
          if (replaceRequestIdRef.current !== requestId) return;
          // replaceAsync resets player config to defaults — loop must be
          // re-applied on every swap, or the clip plays once and stops.
          activePlayer.loop = true;
          activePlayer.audioMixingMode = 'mixWithOthers';
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
    const p = activePlayerRef.current;
    const next = !isVideoPausedRef.current;
    isVideoPausedRef.current = next;
    setIsVideoPaused(next);
    if (next) p?.pause(); else p?.play();
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
    // Restored / deck-switched items have no history entry — fall back to the cache
    const cached = trashCacheRef.current[mediaModeRef.current].get(assetId);
    if (mediaModeRef.current === 'photo') {
      setTrashQueue(q => q.filter(id => id !== assetId));
      const entry = swipeHistoryRef.current.find(h => h.assetId === assetId && h.dir === 'left') ?? cached;
      if (entry?.fileSize) setTrashSizeBytes(prev => Math.max(0, prev - entry.fileSize));
    } else {
      setVideoTrashQueue(q => q.filter(id => id !== assetId));
      const entry = videoSwipeHistoryRef.current.find(h => h.assetId === assetId && h.dir === 'left') ?? cached;
      if (entry?.fileSize) setVideoTrashSizeBytes(prev => Math.max(0, prev - entry.fileSize));
    }
    // Rescued items stay reviewed (they were looked at), so they don't come back
    reviewedBaseRef.current[mediaModeRef.current].add(assetId);
    trashCacheRef.current[mediaModeRef.current].delete(assetId);
  }, []);

  // Stash trashed assets from this session so the review modal can still show
  // them after history is cleared or the deck is reloaded.
  const stashTrashed = useCallback((mode) => {
    const history = mode === 'photo' ? swipeHistoryRef.current : videoSwipeHistoryRef.current;
    const assets  = mode === 'photo' ? photosRef.current : videosRef.current;
    const queue   = mode === 'photo' ? trashQueue : videoTrashQueue;
    for (const h of history) {
      if (h.dir !== 'left' || !queue.includes(h.assetId)) continue;
      const asset = h.asset ?? assets.find(a => a.id === h.assetId);
      if (asset) trashCacheRef.current[mode].set(asset.id, { asset, fileSize: h.fileSize ?? 0 });
    }
  }, [trashQueue, videoTrashQueue]);

  // Reload the photo deck from the newest photo; the trash queue is kept.
  // Filter changes keep the swipe history so Undo still works across them.
  const restartPhotoDeck = useCallback((deck, type = photoTypeRef.current, keepHistory = false) => {
    if (!keepHistory) {
      stashTrashed('photo');
      commitHistory('photo');
      setSwipeHistory([]);
      swipeHistoryRef.current = [];
    }

    deckGenerationRef.current += 1;
    loadingMoreRef.current = false;
    deckScanRef.current = { prev: null, prevEmitted: false };
    photoDeckRef.current = deck;
    setPhotoDeck(deck);
    photoTypeRef.current = type;
    setPhotoType(type);

    photosRef.current = [];
    photoTrimOffsetRef.current = 0;
    hasNextPageRef.current = true;
    endCursorRef.current = null;
    cardIndexRef.current = 0;
    setPhotos([]);
    setCardIndex(0);
    setHasNextPage(true);
    setEndCursor(null);
    setPhotosLoaded(false);
    resetOverlays();
    loadMorePhotos();
  }, [stashTrashed, commitHistory, resetOverlays, loadMorePhotos]);

  const handleFilterChange = useCallback((deck, type, title, sort = photoSortRef.current) => {
    setFilterSheetOpen(false);
    if (title !== undefined) setAlbumTitle(title);
    // Similar shots only make sense in time order
    const nextSort = deck === 'similar' ? 'newest' : sort;
    // Reloading restarts the deck, so don't do it for an unchanged selection
    if (deck === photoDeckRef.current && type === photoTypeRef.current && nextSort === photoSortRef.current) return;
    if (nextSort !== photoSortRef.current) logEvent('sort_used', { sort: nextSort, deck });
    photoSortRef.current = nextSort;
    setPhotoSort(nextSort);
    logEvent('filter_changed', { deck, type, sort: nextSort });
    restartPhotoDeck(deck, type, true);
  }, [restartPhotoDeck]);

  // Banner tapped: open the deck it points at
  const actOnAdvisory = useCallback(async () => {
    const adv = await closeAdvisory('acted');
    if (!adv) return;
    if (mediaModeRef.current !== 'photo') handleModeChange('photo');
    handleFilterChange(adv.action.deck, 'all', undefined, adv.action.sort);
  }, [closeAdvisory, handleModeChange, handleFilterChange]);

  // Session lifecycle hooks (see the effect near the top)
  useEffect(() => {
    lifecycleRef.current = {
      foreground: () => {
        advisorCheckedRef.current = false;
        if (hasPermission) {
          startIndexer();
          if (photosLoaded) runAdvisor();
        }
      },
      background: () => {
        stopIndexer();
        updateSummary(true);
        if (advisoryRef.current) closeAdvisory('ignored');
      },
      studyChanged: () => {
        if (conditionFor() === 'baseline' && advisoryRef.current) {
          advisoryRef.current = null;
          setAdvisory(null);
        }
      },
    };
  });

  // Launch decision once the first deck is on screen (and the tutorial isn't)
  useEffect(() => {
    if (photosLoaded && !tutorialVisible) runAdvisor();
  }, [photosLoaded, tutorialVisible, runAdvisor]);

  // iOS: a Files-app folder was (re)picked — show it under Downloads
  const handleFolderPicked = useCallback(() => {
    setFolderAccessLost(false);
    setFilterSheetOpen(false);
    restartPhotoDeck('downloads', photoTypeRef.current, true);
  }, [restartPhotoDeck]);

  // Long-press the storage pill: forget review progress and start over
  // Scans the whole library for photos in this deck that were already reviewed,
  // so "start over" only brings back this deck. Trashed photos stay out.
  const collectDeckReviewed = useCallback(async (deck, type, trashIds) => {
    const reviewed = getReviewedSet('photo');
    const exclude = new Set(trashIds);
    const scan = { prev: null, prevEmitted: false };
    const ids = [];
    const take = (assets) => {
      for (const a of selectForDeck(deck, assets, scan, exclude, type)) if (reviewed.has(a.id)) ids.push(a.id);
    };
    let album = albumIdOf(deck);
    if (!album && deck === 'screenshots') album = (await getScreenshotsAlbum())?.id ?? null;
    let after = null;
    let hasNext = true;
    while (hasNext) {
      const media = await MediaLibrary.getAssetsAsync({
        first: 200, mediaType: 'photo', album: album ?? undefined,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]], after: after ?? undefined,
      });
      // Camera/Downloads need EXIF to tell sources apart; only reviewed ones matter here
      if (needsExif(deck)) await enrichWithExif(media.assets.filter(a => reviewed.has(a.id) && !isScreenshot(a)));
      take(media.assets);
      after = media.endCursor;
      hasNext = media.hasNextPage;
    }
    if (IS_IOS && deck === 'downloads') {
      try {
        const folder = await getSavedFolder();
        if (folder) take(listFolderImages(folder));
      } catch {}
    }
    return ids;
  }, [getReviewedSet]);

  const handleResetProgress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isPhoto = mediaModeRef.current === 'photo';
    const deck = photoDeckRef.current;
    const deckName = !isPhoto ? 'videos'
      : isAlbumDeck(deck) ? (albumTitle ?? 'this album')
      : deck === 'all' ? 'all photos'
      : (PHOTO_DECKS.find(d => d.key === deck)?.label ?? 'this deck');
    Alert.alert(`Start over ${deckName}?`, `Everything you already sorted in ${deckName} will show up again. Other decks stay done, and your trash is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start over', style: 'destructive', onPress: async () => {
          if (isPhoto) {
            setResetting(true);
            try {
              stashTrashed('photo');
              commitHistory('photo');
              const ids = await collectDeckReviewed(deck, photoTypeRef.current, trashQueue);
              for (const id of ids) reviewedBaseRef.current.photo.delete(id);
              logEvent('deck_reset', { deck, restored: ids.length });
              swipeHistoryRef.current = [];
              setSwipeHistory([]);
              setProgressBump(n => n + 1);
              restartPhotoDeck(deck);
            } catch {
              Alert.alert('Couldn\'t start over', 'Something went wrong reading your library. Try again.');
            } finally {
              setResetting(false);
            }
            return;
          }
          stashTrashed('video');
          reviewedBaseRef.current.video = new Set(videoTrashQueue);
          videoSwipeHistoryRef.current = [];
          setVideoSwipeHistory([]);
          setProgressBump(n => n + 1);

          activePlayerRef.current?.pause();
          videosRef.current = [];
          videoTrimOffsetRef.current = 0;
          videoHasNextPageRef.current = true;
          videoCardIndexRef.current = 0;
          setVideos([]);
          setVideoCardIndex(0);
          setVideoHasNextPage(true);
          setVideoEndCursor(null);
          setVideosLoaded(false);
          loadMoreVideos();
        },
      },
    ]);
  }, [albumTitle, trashQueue, videoTrashQueue, stashTrashed, commitHistory, collectDeckReviewed, restartPhotoDeck, loadMoreVideos]);

  // Real bytes of the items about to be deleted: the size recorded at swipe time,
  // then the library index, then the file itself
  const measureQueue = useCallback(async (mode, queue) => {
    const history = mode === 'photo' ? swipeHistoryRef.current : videoSwipeHistoryRef.current;
    const indexed = await getSizes(queue).catch(() => new Map());
    let bytes = 0;
    let known = 0;
    for (const id of queue) {
      let size = history.find(h => h.assetId === id && h.dir === 'left')?.fileSize
        || trashCacheRef.current[mode].get(id)?.fileSize || 0;
      if (!size && indexed.get(id)?.known) size = indexed.get(id).size;
      if (!size) size = (await fetchAssetInfo(id))?.fileSize || 0;
      if (size) { bytes += size; known++; } else bytes += indexed.get(id)?.size ?? 0;
    }
    return { bytes, known };
  }, []);

  const handleEmptyTrash = useCallback(() => {
    const isPhoto = mediaModeRef.current === 'photo';
    const queue = isPhoto ? trashQueue : videoTrashQueue;
    const label = isPhoto ? 'photos' : 'videos';
    Alert.alert('Delete Permanently?', `Permanently remove ${queue.length} ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const freed = await measureQueue(isPhoto ? 'photo' : 'video', queue);
            // Files-app items are plain files; the rest go through the photo library
            const libraryIds = queue.filter(id => !isFileAsset(id));
            if (libraryIds.length) await MediaLibrary.deleteAssetsAsync(libraryIds);
            deleteFileAssets(queue.filter(isFileAsset));
            const mode = isPhoto ? 'photo' : 'video';
            commitHistory(mode);
            trashCacheRef.current[mode].clear();
            if (isPhoto) {
              setTrashQueue([]); setTrashSizeBytes(0); setSwipeHistory([]);
            } else {
              setVideoTrashQueue([]); setVideoTrashSizeBytes(0); setVideoSwipeHistory([]);
            }
            const entry = {
              bytes: freed.bytes, count: queue.length, mode, sizesMeasured: freed.known,
              deck: isPhoto ? photoDeckRef.current : 'videos', sort: isPhoto ? photoSortRef.current : 'newest',
            };
            appendFreed(entry);
            logEvent('bytes_freed', entry);
            deleteRows(queue).then(() => updateSummary(true));
          } catch {
            Alert.alert('Error', "Couldn't delete. Check permissions.");
          }
        }
      },
    ]);
  }, [trashQueue, videoTrashQueue, commitHistory, measureQueue, updateSummary]);

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

  const typeFiltered = photoType !== 'all';
  const typeLabel = photoType === 'other' ? 'other file type' : PHOTO_TYPES.find(t => t.key === photoType)?.label;
  const emptyDeckMessage = typeFiltered ? {
    all:         `No ${typeLabel} photos to review`,
    camera:      `No ${typeLabel} camera photos to review`,
    screenshots: `No ${typeLabel} screenshots to review`,
    downloads:   `No ${typeLabel} downloads to review`,
    pictures:    `No ${typeLabel} pictures to review`,
    similar:     `No similar ${typeLabel} shots to review`,
  }[photoDeck] : {
    all:         reviewedBaseRef.current.photo.size > 0 ? 'All caught up!' : 'No photos found',
    camera:      'No camera photos to review',
    screenshots: 'No screenshots to review',
    downloads:   'No downloads to review',
    pictures:    'No pictures to review',
    similar:     'No similar shots to review',
  }[photoDeck] ?? `Nothing to review in ${albumTitle ?? 'this album'}`;
  // Album decks: explain an empty album instead of a generic message
  const albumScan = isAlbumDeck(photoDeck) ? scanStats : null;
  const albumName = albumTitle ?? 'this album';
  const albumEmpty = albumScan && photos.length === 0 && photosLoaded && !typeFiltered && (
    albumScan.scanned === 0
      ? { message: limitedAccess ? `Can't see the photos in ${albumName}` : `No photos in ${albumName}`,
          subtitle: limitedAccess
            ? 'Photo access is set to Selected Photos. Allow Full Access in Settings → Privacy → Photos'
            : 'It may only contain videos' }
      : albumScan.reviewedSkipped === albumScan.scanned
        ? { message: `All ${albumScan.scanned} photos in ${albumName} were already reviewed`,
            subtitle: 'Long-press the storage pill to start over this deck' }
        : null
  );
  const emptyDeckSubtitle = albumEmpty ? albumEmpty.subtitle
    : typeFiltered
    ? 'Try another file type'
    : reviewedBaseRef.current.photo.size > 0
      ? 'Long-press the storage pill to start over this deck'
      : undefined;

  // Review modal also needs trashed assets that aren't in the current deck
  const trashCache   = reviewVisible ? [...trashCacheRef.current[mediaMode].values()] : [];
  const reviewAssets = !reviewVisible ? [] : [
    ...trashCache.map(c => c.asset),
    ...(mediaMode === 'photo' ? photosRef.current : videosRef.current)
      .filter(a => !trashCacheRef.current[mediaMode].has(a.id)),
  ];
  const reviewHistory = [
    ...trashCache.map(c => ({ dir: 'left', assetId: c.asset.id, fileSize: c.fileSize })),
    ...activeHistory,
  ];

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
        <View ref={tutorialTargets.mediaToggle} collapsable={false}>
          <MediaToggle mode={mediaMode} onChange={handleModeChange} />
        </View>
        <View style={styles.topBarRow}>
          <StoragePill
            savedBytes={activeSavedBytes}
            totalBytes={librarySummary?.totalBytes || totalStorageBytes}
            totalApprox={!!librarySummary && librarySummary.sizesMeasuredRatio < 0.9}
            onPress={() => setStatsVisible(true)}
            onLongPress={handleResetProgress}
            targetRef={tutorialTargets.storagePill}
          />
          {mediaMode === 'photo' && <DeckPill deck={photoDeck} type={photoType} sort={photoSort} albumTitle={albumTitle} onPress={() => setFilterSheetOpen(true)} targetRef={tutorialTargets.deckPill} />}
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
          <TouchableOpacity
            ref={tutorialTargets.help}
            onPress={() => setTutorialVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="How to use Swipe Cleaner"
          >
            <BlurView intensity={50} tint="dark" style={styles.helpButton}>
              <Ionicons name="help" size={17} color="rgba(255,255,255,0.85)" />
            </BlurView>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Edge vignettes — full-height, behind the deck */}
      <EdgeVignette side="left"  color="rgba(255,69,58,0.72)"  opacity={trashOpacity} />
      <EdgeVignette side="right" color="rgba(48,209,88,0.72)"  opacity={keepOpacity}  />

      {/* Deck Area */}
      <View ref={tutorialTargets.deck} collapsable={false} style={styles.deckArea} pointerEvents="box-none">
        {resetting ? (
          <SplashScreen icon="refresh" message="Finding photos to bring back…" pulse />
        ) : mediaMode === 'photo' && !photosLoaded ? (
          <SplashScreen icon="images-outline" message="Loading photos…" pulse />
        ) : mediaMode === 'photo' && photos.length === 0 ? (
          <SplashScreen icon="images-outline" message={albumEmpty ? albumEmpty.message : emptyDeckMessage} subtitle={emptyDeckSubtitle} />
        ) : mediaMode === 'video' && !videosLoaded ? (
          <SplashScreen icon="videocam-outline" message="Loading videos…" pulse />
        ) : mediaMode === 'video' && videos.length === 0 ? (
          reviewedBaseRef.current.video.size > 0
            ? <SplashScreen icon="checkmark-circle" message="All caught up!" subtitle="Long-press the storage pill to start over" />
            : <SplashScreen icon="videocam-outline" message="No videos found" />
        ) : allSwiped ? (
          <SplashScreen icon="checkmark-circle" message="All caught up!" subtitle={mediaMode === 'photo' && typeFiltered ? 'Try another file type' : 'Nothing left to review'} />
        ) : (
          <Animated.View style={{ width: SCREEN_WIDTH, height: CARD_HEIGHT, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: hintAnim }] }}>
          <Swiper
            key={mediaMode}
            ref={swiperRef}
            cards={activeAssets}
            cardIndex={activeIndex}
            keyExtractor={(card) => card.id}
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
                          onFirstFrameRender={() => {
                            if (!isVideoPausedRef.current) activePlayer.play();
                          }}
                        />
                      ) : null}
                    </View>
                  </CardEntrance>
                );
              }
              return <PhotoCard card={card} />;
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

        {mediaMode === 'photo' && !allSwiped && (
          <PinchGestureHandler
            ref={pinchRef}
            onGestureEvent={(e) => {
              zoomScaleRef.current = Math.max(1, Math.min(4, baseScaleRef.current * e.nativeEvent.scale));
            }}
            onHandlerStateChange={(e) => {
              if (e.nativeEvent.state === State.END || e.nativeEvent.state === State.CANCELLED) {
                baseScaleRef.current = zoomScaleRef.current < 1.15 ? 1 : zoomScaleRef.current;
                zoomScaleRef.current = baseScaleRef.current;
              }
            }}
          >
            <Animated.View
              style={styles.cardOverlay}
              pointerEvents="box-none"
            />
          </PinchGestureHandler>
        )}

        {mediaMode === 'video' && !allSwiped && (
          <View style={styles.videoControlsOverlay} pointerEvents="box-none">
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleVideoTap}
              style={StyleSheet.absoluteFillObject}
            />
            {isVideoPaused && (
              <View style={styles.pauseOverlay} pointerEvents="none">
                <BlurView intensity={55} tint="dark" style={styles.pausePill}>
                  <Ionicons name="pause" size={28} color="rgba(255,255,255,0.92)" />
                </BlurView>
              </View>
            )}
            {formatDuration(activeAssets[videoCardIndex]?.duration) && (
              <BlurView intensity={52} tint="dark" style={styles.durationBadge} pointerEvents="none">
                <Ionicons name="play" size={10} color="rgba(255,255,255,0.85)" />
                <Text style={styles.durationText}>
                  {formatDuration(activeAssets[videoCardIndex]?.duration)}
                </Text>
              </BlurView>
            )}
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
        targetRefs={tutorialTargets}
      />

      {tutorialVisible && <Tutorial targets={tutorialTargets} onDone={closeTutorial} />}

      {advisory && !tutorialVisible && (
        <AdvisoryBanner advisory={advisory} top={172} onAct={actOnAdvisory} onDismiss={() => closeAdvisory('dismissed')} />
      )}

      {statsVisible && <StatsSheet onClose={() => setStatsVisible(false)} />}
      <EmbedderHost />

      <PhotoFilterSheet
        visible={filterSheetOpen}
        deck={photoDeck}
        type={photoType}
        sort={photoSort}
        onChange={handleFilterChange}
        folderAccessLost={folderAccessLost}
        onFolderPicked={handleFolderPicked}
        onClose={() => setFilterSheetOpen(false)}
      />

      {/* Modal */}
      <TrashReviewModal
        visible={reviewVisible}
        trashQueue={activeTrashQ}
        photos={reviewAssets}
        swipeHistory={reviewHistory}
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
  helpButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...GLASS_BORDER },
  muteButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...GLASS_BORDER },

  durationBadge: {
    position: 'absolute', bottom: 56, left: 14,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  labelRow: { position: 'absolute', bottom: 14, right: 14, left: 14, flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6 },
  labelChip: {
    backgroundColor: 'rgba(20,20,20,0.6)',
    borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  durationText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },

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

  scrubBarContainer: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    alignItems: 'center',
  },

  cardOverlay: {
    position: 'absolute',
    width: SCREEN_WIDTH - 32,
    height: CARD_HEIGHT,
    borderRadius: 22,
    alignSelf: 'center',
  },

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

  storageTextDim: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '400' },

  videoOverlay: {
    position: 'absolute',
    width: SCREEN_WIDTH - 32,
    height: CARD_HEIGHT,
    borderRadius: 22,
    overflow: 'hidden',
    alignSelf: 'center',
  },
});