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
    body: 'Tap to pick a deck (screenshots, similar shots, an album), a file type, or sort largest first.',
    fallbackBody: 'In Photos, tap the filter pill to pick a deck, a file type, or sort largest first.',
  },
  {
    target: 'storagePill',
    title: 'Space you\'ll free up',
    body: 'Shows how much space your trash will free. Tap it to see how much you\'ve freed each day. Your progress saves automatically.',
    fallbackBody: 'The pill at the top shows how much space your trash will free. Tap it for your stats. Progress saves automatically.',
  },
  {
    target: 'storagePill',
    title: 'Swipe again',
    body: 'Finished a deck or album? Long-press this pill to start over. Only that deck comes back; the rest stay done.',
    fallbackBody: 'Finished a deck or album? Long-press the storage pill at the top to start over that deck.',
  },
  {
    target: null,
    title: 'Smart tips',
    body: 'Swipe Cleaner checks your library on this phone, nothing is uploaded. When it finds lots of screenshots, repeat shots or big files, a tip shows up when you open the app. Tap it to jump straight there.',
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
