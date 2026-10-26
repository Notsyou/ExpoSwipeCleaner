import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// ─── 24-hour inactivity reminder (Tier 2 advisory) ───────────────────────────
//
// Every app open/foreground cancels the pending reminder and schedules a fresh
// one 24h out, so it only ever fires after a full day of inactivity. It fires
// while the app is closed, so it can't cite live storage numbers — it rotates
// through generic phrasings instead, never repeating the previous one.
//
// Event log (append-only, AsyncStorage):
//   { t, event: 'scheduled' | 'shown' | 'acted' | 'dismissed', phrasingId }
//   shown     — the reminder's fire time passed before the user came back
//   acted     — the user tapped the notification to open the app
//   dismissed — it was shown but the user came back without tapping it
//
const STATE_KEY = 'swipe-cleaner:reminder:v1';
const LOG_KEY   = 'swipe-cleaner:reminder-log:v1';
const LOG_LIMIT = 1000;
const DELAY_SECONDS = 24 * 60 * 60;
const CHANNEL_ID = 'reminders';

export const PHRASINGS = [
  { id: 'gentle',   title: 'Camera roll check-in',    body: 'Got a minute? A quick swipe session keeps your storage tidy.' },
  { id: 'progress', title: 'Pick up where you left off', body: 'Your unreviewed photos are waiting. Swipe through a few now.' },
  { id: 'storage',  title: 'Free up some space',      body: 'Old screenshots and duplicates add up. Clear a few in under a minute.' },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
  }),
});

const readJSON = async (key, fallback) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJSON = async (key, value) => {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch {}
};

// Serialised so the launch check and a tap response never interleave writes.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

const appendLog = async (event, phrasingId) => {
  const log = await readJSON(LOG_KEY, []);
  log.push({ t: Date.now(), event, phrasingId });
  await writeJSON(LOG_KEY, log.slice(-LOG_LIMIT));
};

export const getReminderLog = () => readJSON(LOG_KEY, []);
export const clearReminderLog = () => AsyncStorage.removeItem(LOG_KEY).catch(() => {});

const pickPhrasing = (lastId) => {
  const pool = PHRASINGS.filter(p => p.id !== lastId);
  return pool[Math.floor(Math.random() * pool.length)];
};

// Call on launch and whenever the app returns to the foreground.
export const refreshReminder = () => serial(async () => {
  const state = await readJSON(STATE_KEY, null);

  // Resolve the outcome of the previous reminder before replacing it.
  if (state?.fireAt && !state.resolved && Date.now() >= state.fireAt) {
    await appendLog('shown', state.phrasingId);
    if (!state.acted) await appendLog('dismissed', state.phrasingId);
  }

  try {
    const perm = await Notifications.getPermissionsAsync();
    const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Cleanup reminders', importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    await Notifications.cancelAllScheduledNotificationsAsync();
    const phrasing = pickPhrasing(state?.phrasingId);
    await Notifications.scheduleNotificationAsync({
      content: { title: phrasing.title, body: phrasing.body, data: { phrasingId: phrasing.id } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: DELAY_SECONDS, channelId: CHANNEL_ID,
      },
    });
    await writeJSON(STATE_KEY, { phrasingId: phrasing.id, fireAt: Date.now() + DELAY_SECONDS * 1000 });
    await appendLog('scheduled', phrasing.id);
  } catch {}
});

// Tap on the notification. Logs shown + acted and marks the reminder resolved
// so the next refresh doesn't also count it as dismissed.
const recordTap = (response) => serial(async () => {
  const phrasingId = response?.notification?.request?.content?.data?.phrasingId;
  const state = await readJSON(STATE_KEY, null);
  if (!phrasingId || state?.resolved) return;
  await appendLog('shown', phrasingId);
  await appendLog('acted', phrasingId);
  await writeJSON(STATE_KEY, { ...state, acted: true, resolved: true });
});

// Returns an unsubscribe function. Also catches a tap that cold-launched the app.
export const listenForReminderTaps = () => {
  const response = Notifications.getLastNotificationResponse();
  if (response) {
    recordTap(response);
    Notifications.clearLastNotificationResponse();
  }
  const sub = Notifications.addNotificationResponseReceivedListener(recordTap);
  return () => sub.remove();
};
