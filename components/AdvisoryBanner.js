/**
 * components/AdvisoryBanner.js
 * Tier-1 advisory: a data-specific card shown at launch when the decision engine
 * (lib/advisor.js) says so. Tap the button to act, ✕ to dismiss.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GLASS_BORDER } from '../constants';

const ICONS = { screenshots: 'phone-portrait-outline', duplicates: 'copy-outline', largest: 'resize-outline' };

export default function AdvisoryBanner({ advisory, top, onAct, onDismiss }) {
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, tension: 70, friction: 11, useNativeDriver: true }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[styles.wrap, { top, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}
      accessibilityLiveRegion="polite"
    >
      <BlurView intensity={70} tint="dark" style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name={ICONS[advisory.type] ?? 'sparkles-outline'} size={20} color="#fff" />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{advisory.title}</Text>
          {advisory.body ? <Text style={styles.body}>{advisory.body}</Text> : null}
          <TouchableOpacity onPress={onAct} activeOpacity={0.8} style={styles.cta} accessibilityRole="button">
            <Text style={styles.ctaText}>{advisory.cta}</Text>
            <Ionicons name="arrow-forward" size={14} color="#000" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 120, elevation: 120 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 20,
    overflow: 'hidden', backgroundColor: 'rgba(28,28,30,0.55)', ...GLASS_BORDER,
  },
  icon: {
    width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,132,255,0.85)',
  },
  text: { flex: 1, gap: 4 },
  title: { color: '#fff', fontSize: 15, fontWeight: '700', paddingRight: 18 },
  body: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18 },
  cta: {
    marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
  },
  ctaText: { color: '#000', fontSize: 13, fontWeight: '700' },
  close: { position: 'absolute', top: 10, right: 10 },
});
