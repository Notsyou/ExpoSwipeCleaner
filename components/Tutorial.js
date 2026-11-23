/**
 * components/Tutorial.js
 * Step-by-step coach marks: dims the screen, cuts a highlight around the
 * current target, and shows a tooltip with Back / Next / Skip.
 */
import { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../constants';
import { TUTORIAL_STEPS } from '../lib/tutorial';

const PAD = 8;          // space between target and highlight ring
const DIM = 'rgba(0,0,0,0.72)';
const TIP_WIDTH = Math.min(SCREEN_WIDTH - 32, 340);

const measure = (ref) => new Promise((resolve) => {
  const node = ref?.current;
  if (!node?.measureInWindow) return resolve(null);
  node.measureInWindow((x, y, width, height) => {
    resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
  });
});

// Mount only while showing, so each opening starts at step 1
export default function Tutorial({ targets, onDone }) {
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null); // { step, rect } for the last measured step

  const current = TUTORIAL_STEPS[step];

  useEffect(() => {
    let cancelled = false;
    measure(current.target ? targets[current.target] : null).then((rect) => {
      if (!cancelled) setResult({ step, rect });
    });
    return () => { cancelled = true; };
  }, [step, current, targets]);

  const measured = result?.step === step;
  const rect = measured ? result.rect : null;

  const isLast = step === TUTORIAL_STEPS.length - 1;
  const next = useCallback(() => (isLast ? onDone() : setStep((s) => s + 1)), [isLast, onDone]);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const hole = rect && {
    x: Math.max(0, rect.x - PAD),
    y: Math.max(0, rect.y - PAD),
    w: rect.width + PAD * 2,
    h: rect.height + PAD * 2,
  };

  // Tooltip goes below the target if there's room, otherwise above it
  let tipStyle;
  if (!hole) {
    tipStyle = { top: SCREEN_HEIGHT / 2 - 110 };
  } else if (hole.y + hole.h + 200 < SCREEN_HEIGHT) {
    tipStyle = { top: hole.y + hole.h + 14 };
  } else {
    tipStyle = { bottom: SCREEN_HEIGHT - hole.y + 14 };
  }
  // A tall target (the deck) leaves no room either side: put the tip inside it
  if (hole && hole.h > SCREEN_HEIGHT * 0.45) tipStyle = { top: hole.y + hole.h - 220 };

  const body = !hole && current.fallbackBody ? current.fallbackBody : current.body;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onDone}>
      <View style={StyleSheet.absoluteFill}>
        {hole ? (
          <>
            <View style={[styles.dim, { top: 0, left: 0, right: 0, height: hole.y }]} />
            <View style={[styles.dim, { top: hole.y + hole.h, left: 0, right: 0, bottom: 0 }]} />
            <View style={[styles.dim, { top: hole.y, left: 0, width: hole.x, height: hole.h }]} />
            <View style={[styles.dim, { top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h }]} />
            <View pointerEvents="none" style={[styles.ring, { top: hole.y, left: hole.x, width: hole.w, height: hole.h }]} />
          </>
        ) : (
          <View style={[styles.dim, StyleSheet.absoluteFill]} />
        )}

        {measured && (
          <View style={[styles.tip, tipStyle]}>
            <Text style={styles.counter}>{step + 1} / {TUTORIAL_STEPS.length}</Text>
            <Text style={styles.title}>{current.title}</Text>
            <Text style={styles.body}>{body}</Text>
            <View style={styles.row}>
              {!isLast ? (
                <TouchableOpacity onPress={onDone} hitSlop={10}>
                  <Text style={styles.skip}>Skip</Text>
                </TouchableOpacity>
              ) : <View />}
              <View style={styles.navRow}>
                {step > 0 && (
                  <TouchableOpacity onPress={back} style={styles.secondaryBtn}>
                    <Text style={styles.secondaryText}>Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={next} style={styles.primaryBtn}>
                  <Text style={styles.primaryText}>{isLast ? 'Got it' : 'Next'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  ring: {
    position: 'absolute', borderRadius: 18,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
  },
  tip: {
    position: 'absolute', left: (SCREEN_WIDTH - TIP_WIDTH) / 2,
    width: TIP_WIDTH, padding: 18, borderRadius: 18,
    backgroundColor: '#1C1C1E',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.15)',
  },
  counter: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  title: { color: 'white', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  body: { color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  navRow: { flexDirection: 'row', gap: 8 },
  skip: { color: 'rgba(255,255,255,0.5)', fontSize: 15 },
  primaryBtn: { backgroundColor: 'white', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12 },
  primaryText: { color: 'black', fontSize: 15, fontWeight: '600' },
  secondaryBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  secondaryText: { color: 'white', fontSize: 15, fontWeight: '500' },
});
