import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import Swiper from 'react-native-deck-swiper';
import { Ionicons } from '@expo/vector-icons';

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [trashQueue, setTrashQueue] = useState([]);
  
  const swiperRef = useRef(null);
  const undoInFlightRef = useRef(false);
  const undoUnlockTimeoutRef = useRef(null);
  // Keep enough info to correctly undo (direction + asset id if applicable).
  const [swipeHistory, setSwipeHistory] = useState([]);
  const swipeHistoryRef = useRef([]);
  const [cardIndex, setCardIndex] = useState(0);
  const cardIndexRef = useRef(0);

  const [hasNextPage, setHasNextPage] = useState(true);
  const [endCursor, setEndCursor] = useState(null);

  const SWIPE_BACK_ANIMATION_MS = 250;
  const PAGE_SIZE = 50;
  const PREFETCH_BATCH = 12; // keep RAM/network reasonable
  const LOAD_AHEAD_THRESHOLD = 12; // when ~12 cards left, fetch next page
  const MAX_PHOTOS_IN_MEMORY = 220; // rolling window size
  const TRIM_CHUNK = 60; // drop old swiped photos in batches
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    swipeHistoryRef.current = swipeHistory;
  }, [swipeHistory]);

  useEffect(() => {
    cardIndexRef.current = cardIndex;
  }, [cardIndex]);

  const loadMorePhotos = async (cursor = null) => {
    if (!hasNextPage) return; 
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;

    try {
      const media = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        mediaType: 'photo',
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        after: cursor, 
      });

      setPhotos(prev => [...prev, ...media.assets]); 
      setEndCursor(media.endCursor); 
      setHasNextPage(media.hasNextPage); 

      const imageUris = media.assets.slice(0, PREFETCH_BATCH).map(asset => asset.uri);
      Image.prefetch(imageUris);
    } finally {
      loadingMoreRef.current = false;
    }
  };

  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      
      if (status === 'granted') {
        loadMorePhotos(); 
      }
    })();
  }, []);

  const handleSwipeLeft = (index) => {
    const photoToDelete = photos[index];
    if (!photoToDelete?.id) return;

    // Store asset IDs only (required by MediaLibrary.deleteAssetsAsync).
    setTrashQueue(prev => [...prev, photoToDelete.id]);
    setSwipeHistory(prev => [...prev, { dir: 'left', assetId: photoToDelete.id }]);
  };

  const handleSwipeRight = (index) => {
    const photoKept = photos[index];
    setSwipeHistory(prev => [...prev, { dir: 'right', assetId: photoKept?.id ?? null }]);
  };

  const handleUndo = () => {
    if (undoInFlightRef.current) return;

    const history = swipeHistoryRef.current;
    if (!history || history.length === 0) {
      Alert.alert("Wait!", "Nothing to undo yet.");
      return;
    }

    undoInFlightRef.current = true;

    if (undoUnlockTimeoutRef.current) {
      clearTimeout(undoUnlockTimeoutRef.current);
      undoUnlockTimeoutRef.current = null;
    }

    const last = history[history.length - 1];

    // 1) Move the deck back by controlling the card index.
    const nextIndex = Math.max(0, cardIndexRef.current - 1);
    setCardIndex(nextIndex);
    // Jump immediately to avoid internal swipeBack desync/freezes.
    swiperRef.current?.jumpToCardIndex?.(nextIndex);

    // 2) Then update state (pure updates only).
    setSwipeHistory(prev => prev.slice(0, -1));

    if (last.dir === 'left' && last.assetId) {
      setTimeout(() => {
        setTrashQueue(q => {
          const i = q.lastIndexOf(last.assetId);
          if (i === -1) return q;
          return [...q.slice(0, i), ...q.slice(i + 1)];
        });
      }, SWIPE_BACK_ANIMATION_MS + 50);
    }

    undoUnlockTimeoutRef.current = setTimeout(() => {
      undoInFlightRef.current = false;
      undoUnlockTimeoutRef.current = null;
    }, 150);
  };

  const handleEmptyTrash = async () => {
    if (trashQueue.length === 0) return Alert.alert("Empty", "No photos to delete!");
    try {
      await MediaLibrary.deleteAssetsAsync(trashQueue);
      Alert.alert("Success", `Deleted ${trashQueue.length} photos!`);
      setTrashQueue([]);
      setSwipeHistory([]);
    } catch (error) {
      Alert.alert("Error", "Couldn't delete photos.");
    }
  };

  if (hasPermission === null) return <View style={styles.container}><Text style={styles.text}>Requesting permissions...</Text></View>;
  if (hasPermission === false) return <View style={styles.container}><Text style={styles.text}>No access to camera roll.</Text></View>;
  if (photos.length === 0) return <View style={styles.container}><Text style={styles.text}>Loading photos...</Text></View>;

  return (
    <View style={styles.container}>
      <Swiper
        ref={swiperRef}
        cards={photos}
        cardIndex={cardIndex}
        infinite={false}
        renderCard={(card) => (
          <View style={styles.card}>
            <Image 
              source={{ uri: card.uri }} 
              style={styles.cardImage} 
              // "contain" keeps the whole photo visible (no cropping),
              // which is better for very tall/long images.
              contentFit="contain"
            />
          </View>
        )}
        onSwiped={(index) => {
          setCardIndex(index + 1);

          // Load more when we're getting close to the end.
          if (hasNextPage && (photos.length - (index + 1) <= LOAD_AHEAD_THRESHOLD)) {
            loadMorePhotos(endCursor);
          }

          // RAM-friendly: keep a rolling window by trimming photos you've already swiped past.
          // This prevents keeping the entire gallery in memory at once.
          if ((index + 1) >= TRIM_CHUNK && photos.length > MAX_PHOTOS_IN_MEMORY) {
            setPhotos(prev => prev.slice(TRIM_CHUNK));
            setCardIndex(prev => {
              const next = Math.max(0, prev - TRIM_CHUNK);
              // keep the deck aligned with our controlled index
              swiperRef.current?.jumpToCardIndex?.(next);
              return next;
            });
          }
        }}
        onSwipedLeft={handleSwipeLeft}
        onSwipedRight={handleSwipeRight}
        backgroundColor={'#121212'}
        stackSize={3}
        disableTopSwipe={true}
        disableBottomSwipe={true}
        swipeBackCard={true}
        swipeBackAnimationDuration={SWIPE_BACK_ANIMATION_MS}
        showNextCard={true}          // Always shows the card underneath
        animateCardOpacity={true}    // Fades the next card in
        animateCardScale={true}      // Makes the next card "grow" into place
        
        // This makes the card underneath start visible but slightly dim (0.8 opacity)
        // and fade to full (1.0) as you swipe.
        outputCardOpacityRangeX={[0.8, 1, 1, 1, 0.8]} 
        
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.button, styles.undoButton]} onPress={handleUndo}>
          <Ionicons name="arrow-undo" size={24} color="white" />
          <Text style={styles.buttonText}> Undo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.trashButton]} onPress={handleEmptyTrash}>
          <Ionicons name="trash" size={22} color="white" />
          <Text style={styles.buttonText}> Trash ({trashQueue.length})</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center'},
  card: { flex: 0.75, borderRadius: 15, justifyContent: 'center', alignItems: 'center', backgroundColor: '#222', overflow: 'hidden' },
  // With contentFit="contain", this will "letterbox" instead of cropping.
  cardImage: { width: '100%', height: '100%', backgroundColor: '#000' },
  buttonContainer: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    gap: 20,
    zIndex: 100,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center'
  },
  undoButton: { backgroundColor: '#555555' },
  trashButton: { backgroundColor: '#ff4444' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});