/**
 * components/StatsSheet.js
 * Opened by tapping the storage pill: freed-storage history, library analysis
 * progress, study mode and study-data export.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { GLASS_BORDER, SAFE_BOTTOM, SCREEN_HEIGHT } from '../constants';
import { fmtBytes, resetAdvisorState } from '../lib/advisor';
import { clearEvents, eventsToCsv, getEvents, logEvent } from '../lib/events';
import { clearFreedLog, dailyTotals, freedTrend, getFreedLog } from '../lib/freedLog';
import { getIndexStatus, onIndexStatus } from '../lib/indexer';
import { getEmbedderStatus, onEmbedderStatus } from '../lib/ml/embedder';
import { conditionLabel, getStudySettings, setStudyMode, STUDY_MODES } from '../lib/study';

const Chip = ({ label, selected, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ selected }}
    style={[styles.chip, selected && styles.chipSelected]}>
    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
  </TouchableOpacity>
);

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const dayLabel = (date) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${date}T12:00:00`).getDay()];

// Mounted only while open (see App.js), so state starts fresh each time
export default function StatsSheet({ onClose }) {
  const [days, setDays] = useState(7);
  const [freedLog, setFreedLog] = useState([]);
  const [index, setIndex] = useState(getIndexStatus);
  const [ml, setMl] = useState(getEmbedderStatus);
  const [study, setStudy] = useState(getStudySettings);

  useEffect(() => {
    getFreedLog().then(setFreedLog);
    const a = onIndexStatus(setIndex);
    const b = onEmbedderStatus(setMl);
    return () => { a(); b(); };
  }, []);

  const series = dailyTotals(freedLog, days);
  const max = Math.max(1, ...series.map((d) => d.bytes));
  const trend = freedTrend(freedLog);

  const chooseMode = async (mode) => {
    if (mode === study.mode) return;
    await setStudyMode(mode);
    setStudy(getStudySettings());
    logEvent('study_mode_changed', { mode });
  };

  const exportData = async () => {
    try {
      const events = await getEvents();
      const file = new File(Paths.cache, `swipe-cleaner-study-${new Date().toISOString().slice(0, 10)}.csv`);
      if (file.exists) file.delete();
      file.create();
      await file.write(eventsToCsv(events));
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Export study data' });
    } catch (e) {
      Alert.alert('Export failed', String(e?.message ?? e));
    }
  };

  const clearData = () => {
    Alert.alert('Clear study data?', 'Deletes the event log, the freed-storage history and the banner cooldowns. Your photos and sorting progress are not touched.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
          await clearEvents();
          await clearFreedLog();
          await resetAdvisorState();
          setFreedLog([]);
        } },
    ]);
  };

  const mlText = ml.state === 'ready'
    ? `Model ready${ml.avgMs ? ` · ${Math.round(ml.avgMs)} ms per photo` : ''}`
    : ml.state === 'failed' ? `Model failed to load: ${ml.failure ?? 'unknown error'}`
      : ml.state === 'loading' ? 'Loading model…' : 'Model not started';

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close stats" />
      <View style={styles.sheetPosition}>
        <BlurView intensity={70} tint="dark" style={styles.sheet}>
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close stats">
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.heading}>Space freed</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}><Text style={styles.statValue}>{fmtBytes(trend.last7)}</Text><Text style={styles.statLabel}>last 7 days</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{fmtBytes(trend.total)}</Text><Text style={styles.statLabel}>all time</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{freedLog.reduce((n, e) => n + (e.count ?? 0), 0)}</Text><Text style={styles.statLabel}>items deleted</Text></View>
            </View>
            <View style={styles.chips}>
              <Chip label="7 days" selected={days === 7} onPress={() => setDays(7)} />
              <Chip label="30 days" selected={days === 30} onPress={() => setDays(30)} />
            </View>
            <View style={styles.chart} accessibilityLabel={`Bytes freed per day, last ${days} days`}>
              {series.map((d) => (
                <View key={d.date} style={styles.barCol}>
                  <View style={[styles.bar, { height: Math.max(2, (d.bytes / max) * 96), opacity: d.bytes ? 1 : 0.25 }]} />
                  {days === 7 && <Text style={styles.barLabel}>{dayLabel(d.date)}</Text>}
                </View>
              ))}
            </View>
            {freedLog.length === 0 && <Text style={styles.muted}>Nothing deleted yet. Emptying the trash adds a day here.</Text>}

            <Text style={styles.heading}>Library analysis (on this phone)</Text>
            <Text style={styles.line}>Sizes measured: {index.measured} of {index.total} ({pct(index.measured, index.total)})</Text>
            <Text style={styles.line}>Photos analysed by the model: {index.analysed} of {index.photos} ({pct(index.analysed, index.photos)})</Text>
            {index.unavailable > 0 && <Text style={styles.muted}>{index.unavailable} photos are only in iCloud and were skipped.</Text>}
            <Text style={styles.line}>Photos in near-duplicate groups: {index.clustered}</Text>
            <Text style={styles.muted}>{mlText}</Text>

            <Text style={styles.heading}>Study mode</Text>
            <View style={styles.chips}>
              {STUDY_MODES.map((m) => <Chip key={m.key} label={m.label} selected={study.mode === m.key} onPress={() => chooseMode(m.key)} />)}
            </View>
            <Text style={styles.muted}>Today: {conditionLabel()}. Baseline turns off the launch banner and the daily reminder.</Text>
            <View style={styles.chips}>
              <Chip label="Export study data (CSV)" onPress={exportData} />
              <Chip label="Clear study data" onPress={clearData} />
            </View>
          </ScrollView>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetPosition: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: SCREEN_HEIGHT * 0.85 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', ...GLASS_BORDER },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: SAFE_BOTTOM + 16, gap: 12 },
  close: { position: 'absolute', top: 8, right: 8, zIndex: 1, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  statValue: { color: '#fff', fontSize: 17, fontWeight: '700' },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 118, gap: 3, paddingTop: 4 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', borderRadius: 4, backgroundColor: '#30D158' },
  barLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  line: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  muted: { color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', ...GLASS_BORDER },
  chipSelected: { backgroundColor: 'rgba(255,255,255,0.9)' },
  chipText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '500' },
  chipTextSelected: { color: '#000', fontWeight: '600' },
});
