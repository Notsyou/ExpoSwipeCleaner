// Platform-aware photo sources: iOS smart albums, EXIF-based camera detection,
// user albums, and a Files-app folder (iOS "Downloads") read outside the photo library.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';

export const IS_IOS = Platform.OS === 'ios';

// ─── Album decks ──────────────────────────────────────────────────────────────
// Deck keys for albums look like `album:<id>`.
export const ALBUM_PREFIX = 'album:';
export const isAlbumDeck = (deck) => typeof deck === 'string' && deck.startsWith(ALBUM_PREFIX);
export const albumIdOf = (deck) => (isAlbumDeck(deck) ? deck.slice(ALBUM_PREFIX.length) : null);

// User albums with photos in them (WhatsApp, Instagram, etc.). On Android these are the folders.
export const listUserAlbums = async () => {
  try {
    const albums = await MediaLibrary.getAlbumsAsync();
    return albums
      .filter(a => (a.assetCount ?? 0) > 0)
      .sort((a, b) => (b.assetCount ?? 0) - (a.assetCount ?? 0))
      .map(a => ({ key: ALBUM_PREFIX + a.id, label: a.title, icon: 'folder-outline', count: a.assetCount }));
  } catch {
    return [];
  }
};

// ─── iOS Screenshots smart album ──────────────────────────────────────────────
// The title is localized, so match a few languages and fall back to null
// (the deck then scans the whole library using mediaSubtypes instead).
const SCREENSHOT_TITLES = /screenshot|bildschirmfoto|captura|capture d|schermat|スクリーンショット|스크린샷|截屏|屏幕快照|снимки экрана/i;
let screenshotsAlbumPromise = null;
export const getScreenshotsAlbum = () => {
  if (!IS_IOS) return Promise.resolve(null);
  screenshotsAlbumPromise ??= MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true })
    .then(albums => albums.find(a => a.type === 'smartAlbum' && SCREENSHOT_TITLES.test(a.title)) ?? null)
    .catch(() => null);
  return screenshotsAlbumPromise;
};

// ─── EXIF camera detection (iOS) ──────────────────────────────────────────────
// Camera shots carry a camera Make/Model; images saved from Safari or other apps
// usually don't. Results are cached by asset id since each lookup is a native call.
const cameraExifCache = new Map();
const hasCameraExif = (exif) => {
  if (!exif) return false;
  const tiff = exif['{TIFF}'] ?? exif;
  return !!(tiff.Make || tiff.Model || exif['{ExifAux}']?.LensModel);
};

export const enrichWithExif = async (assets) => {
  await Promise.all(assets.map(async (a) => {
    if (cameraExifCache.has(a.id)) { a.cameraExif = cameraExifCache.get(a.id); return; }
    try {
      const info = await MediaLibrary.getAssetInfoAsync(a.id, { shouldDownloadFromNetwork: false });
      a.cameraExif = hasCameraExif(info?.exif);
    } catch {
      a.cameraExif = null; // unknown: fall back to filename rules
    }
    cameraExifCache.set(a.id, a.cameraExif);
  }));
  return assets;
};

// ─── Files-app folder (iOS Downloads) ─────────────────────────────────────────
// The user picks a folder once in the system picker. iOS may revoke access after
// a restart; listing then fails and the filter sheet asks to pick it again.
const FOLDER_KEY = 'swipe-cleaner:files-folder';
export const FILE_ID_PREFIX = 'file:';
export const isFileAsset = (id) => typeof id === 'string' && id.startsWith(FILE_ID_PREFIX);
const IMAGE_EXT = /\.(jpe?g|png|heic|heif|gif|webp|bmp|tiff?)$/i;

export const getSavedFolder = async () => {
  try { return await AsyncStorage.getItem(FOLDER_KEY); } catch { return null; }
};

export const pickFilesFolder = async () => {
  const dir = await Directory.pickDirectoryAsync();
  if (!dir?.uri) return null;
  try { await AsyncStorage.setItem(FOLDER_KEY, dir.uri); } catch {}
  return dir.uri;
};

export const forgetFilesFolder = async () => {
  try { await AsyncStorage.removeItem(FOLDER_KEY); } catch {}
};

const fileToAsset = (file) => {
  const info = file.info?.() ?? {};
  const time = info.creationTime ?? info.modificationTime ?? 0;
  return {
    id: FILE_ID_PREFIX + file.uri,
    uri: file.uri,
    filename: file.name,
    fileSize: info.size ?? file.size ?? 0,
    creationTime: time,
    modificationTime: info.modificationTime ?? time,
    width: 0, height: 0,
    mediaType: 'photo',
    isFile: true,
  };
};

// Images directly inside the folder (one level of subfolders too), newest first.
// Throws when access was lost so the caller can ask the user to pick again.
export const listFolderImages = (uri) => {
  const out = [];
  const walk = (dir, depth) => {
    for (const entry of dir.list()) {
      if (entry instanceof Directory) { if (depth < 1) walk(entry, depth + 1); continue; }
      if (IMAGE_EXT.test(entry.name)) out.push(fileToAsset(entry));
    }
  };
  walk(new Directory(uri), 0);
  return out.sort((a, b) => b.creationTime - a.creationTime);
};

export const fileAssetFromId = (id) => {
  try {
    const file = new File(id.slice(FILE_ID_PREFIX.length));
    return file.exists ? fileToAsset(file) : null;
  } catch {
    return null;
  }
};

export const deleteFileAssets = (ids) => {
  for (const id of ids) {
    try { new File(id.slice(FILE_ID_PREFIX.length)).delete(); } catch {}
  }
};
