/**
 * components/ActionButtons.js
 */
import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SAFE_BOTTOM, GLASS_BORDER, Z } from '../constants';

const ActionButton = ({ icon, label, onPress, badge, danger, disabled }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.82,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 7,
    }).start();
  };

  return (
    <TouchableOpacity
      style={[styles.btn, disabled && styles.btnDisabled]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      disabled={disabled}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
    >
      <Animated.View style={[styles.iconWrap, { transform: [{ scale }] }]}>
        <BlurView intensity={40} tint="dark" style={[styles.iconBg, danger && styles.iconBgDanger]}>
          <Ionicons name={icon} size={22} color={danger ? '#FF6B6B' : 'rgba(255,255,255,0.9)'} />
        </BlurView>
        {badge != null && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </Animated.View>
      <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
    </TouchableOpacity>
  );
};

export default function ActionButtons({ onUndo, onReview, onTrash, undoDisabled, trashCount }) {
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <BlurView intensity={60} tint="dark" style={styles.bar}>
        <ActionButton
          icon="arrow-undo-outline"
          label="Undo"
          onPress={onUndo}
          disabled={undoDisabled}
        />
        <ActionButton
          icon="albums-outline"
          label="Review"
          onPress={onReview}
        />
        <ActionButton
          icon="trash-outline"
          label="Trash"
          badge={trashCount > 0 ? trashCount : null}
          danger
          onPress={onTrash}
          disabled={trashCount === 0}
        />
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: Z.actionBar,
    elevation: Z.actionBar,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingTop: 14,
    paddingBottom: SAFE_BOTTOM + 10,
    paddingHorizontal: 20,
    ...GLASS_BORDER,
    borderBottomWidth: 0,
  },
  btn: { alignItems: 'center', gap: 6, minWidth: 64 },
  btnDisabled: { opacity: 0.25 },
  iconWrap: { position: 'relative' },
  iconBg: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  iconBgDanger: {
    borderColor: 'rgba(255,107,107,0.25)',
  },
  label: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  labelDanger: { color: 'rgba(255,107,107,0.8)' },
  badge: {
    position: 'absolute', top: -5, right: -8,
    backgroundColor: '#FF453A', borderRadius: 9,
    minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  badgeText: { color: 'white', fontSize: 10, fontWeight: '700' },
});