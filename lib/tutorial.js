import AsyncStorage from '@react-native-async-storage/async-storage';

// Remembers whether the first-launch tutorial has been shown
const STORAGE_KEY = 'swipe-cleaner:tutorial-seen:v1';

export const hasSeenTutorial = async () => {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
  } catch {
    return true; // storage broken: don't nag on every launch
  }
};

export const markTutorialSeen = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, '1');
  } catch {}
};

// Each step points at a target registered in App.js. A step whose target
// isn't on screen (e.g. the filter pill in Videos mode) shows as a centered card.
export const TUTORIAL_STEPS = [
  {
    target: null,
    title: 'Welcome to Swipe Cleaner',
    body: 'Go through your photos and videos one at a time and clear out what you don\'t need. This takes 30 seconds.',
  },
  {
    target: 'deck',
    title: 'Swipe to sort',
    body: 'Swipe right to keep a photo. Swipe left to put it in the trash.',
  },
  {
    target: 'mediaToggle',
    title: 'Photos or videos',
    body: 'Switch between your photos and your videos here.',
  },
  {
    target: 'deckPill',
    title: 'Filter what you see',
    body: 'Tap to pick a deck (screenshots, camera, downloads, an album) or a file type like HEIC or PNG.',
    fallbackBody: 'In Photos, tap the filter pill to pick a deck (screenshots, camera, downloads, an album) or a file type.',
  },
  {
    target: 'storagePill',
    title: 'Space you\'ll free up',
    body: 'Shows how much space your trash will free, and the total size scanned so far. Your progress saves automatically.',
    fallbackBody: 'The pill at the top shows how much space your trash will free. Your progress saves automatically.',
  },
  {
    target: 'storagePill',
    title: 'Swipe again',
    body: 'Finished everything? Long-press this pill to start over. Photos and videos you already sorted will show up again.',
    fallbackBody: 'Finished everything? Long-press the storage pill at the top to start over and swipe again.',
  },
  {
    target: 'undo',
    title: 'Undo',
    body: 'Made a mistake? Undo brings back the last photo you swiped.',
  },
  {
    target: 'review',
    title: 'Review',
    body: 'See everything in your trash and rescue anything you want to keep.',
  },
  {
    target: 'trash',
    title: 'Delete for real',
    body: 'Nothing is deleted until you tap Trash and confirm. Then the photos are removed from your phone.',
  },
  {
    target: 'help',
    title: 'Need this again?',
    body: 'Tap ? anytime to replay this tutorial.',
  },
];
