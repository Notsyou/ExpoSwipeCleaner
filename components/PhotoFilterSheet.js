import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Alert, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { GLASS_BORDER, SAFE_BOTTOM, SCREEN_HEIGHT } from '../constants';
import { PHOTO_DECKS, PHOTO_TYPES } from '../lib/progress';
import { getSavedFolder, IS_IOS, listUserAlbums, pickFilesFolder } from '../lib/sources';

const OPEN_MS = 260;
const CLOSE_MS = 200;

const ChipGroup = ({ title, options, selected, onSelect }) => (
  <View style={styles.group}>
    <Text style={styles.title}>{title}</Text>
    <View style={styles.chips}>
      {options.map(option => {
        const isSelected = option.key === selected;
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => onSelect(option.key)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

// Choosing an option applies it and closes the sheet. The X, a tap outside the
// sheet and the Android back button close it without changing anything.
const SORTS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'largest', label: 'Largest first' },
];

export default function PhotoFilterSheet({ visible, deck, type, sort = 'newest', onChange, onClose, folderAccessLost, onFolderPicked }) {
  const [albums, setAlbums] = useState([]);
  const [folderName, setFolderName] = useState(null);

  // Refresh albums and the picked folder each time the sheet opens
  useEffect(() => {
    if (!visible) return;
    listUserAlbums().then(setAlbums);
    if (IS_IOS) getSavedFolder().then(uri => setFolderName(uri ? decodeURIComponent(uri.replace(/\/$/, '').split('/').pop()) : null));
  }, [visible]);

  const pickFolder = async () => {
    try {
      const uri = await pickFilesFolder();
      if (uri) onFolderPicked?.();
    } catch {
      Alert.alert('Folder not available', "Couldn't open that folder. Try choosing it again.");
    }
  };

  // Stays rendered after `visible` turns false so the close animation can finish
  const [mounted, setMounted] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? OPEN_MS : CLOSE_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setMounted(visible);
    });
    return () => animation.stop();
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_HEIGHT * 0.5, 0] });

  return (
    <Modal visible={visible || mounted} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close filters" />
      </Animated.View>
      <Animated.View style={[styles.sheetPosition, { transform: [{ translateY }] }]}>
        <BlurView intensity={70} tint="dark" style={styles.sheet}>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            style={styles.close}
          >
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <ChipGroup title="Show" options={PHOTO_DECKS} selected={deck} onSelect={key => onChange(key, type)} />
          <ChipGroup title="File type" options={PHOTO_TYPES} selected={type} onSelect={key => onChange(deck, key)} />
          {deck !== 'similar' && (
            <ChipGroup title="Order" options={SORTS} selected={sort} onSelect={key => onChange(deck, type, undefined, key)} />
          )}
          {albums.length > 0 && (
            <ScrollView style={styles.albumScroll} nestedScrollEnabled>
              <ChipGroup
                title="Albums"
                options={albums}
                selected={deck}
                onSelect={key => onChange(key, type, albums.find(a => a.key === key)?.label ?? null)}
              />
            </ScrollView>
          )}
          {IS_IOS && (
            <View style={styles.group}>
              <Text style={styles.title}>Files app folder (shown in Downloads)</Text>
              <TouchableOpacity onPress={pickFolder} activeOpacity={0.7} accessibilityRole="button" style={[styles.chip, styles.folderChip]}>
                <Ionicons name={folderAccessLost ? 'alert-circle-outline' : 'folder-open-outline'} size={16} color="rgba(255,255,255,0.85)" />
                <Text style={styles.chipText} numberOfLines={1}>
                  {folderAccessLost ? `Access to ${folderName ?? 'folder'} lost, choose it again`
                    : folderName ? `${folderName} · Change` : 'Choose a folder (e.g. Downloads)'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </BlurView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetPosition: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: SAFE_BOTTOM + 16, gap: 18,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', ...GLASS_BORDER,
  },
  close: {
    position: 'absolute', top: 8, right: 8, zIndex: 1,
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
  },
  group: { gap: 10 },
  title: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)', ...GLASS_BORDER,
  },
  albumScroll: { maxHeight: 160 },
  folderChip: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  chipSelected: { backgroundColor: 'rgba(255,255,255,0.9)' },
  chipText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },
  chipTextSelected: { color: '#000', fontWeight: '600' },
});
