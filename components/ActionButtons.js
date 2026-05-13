/**
 * components/ActionButtons.js
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SAFE_BOTTOM, GLASS_BORDER, Z } from '../constants';

const ActionButton = ({ icon, label, onPress, badge, danger, disabled }) => (
  <TouchableOpacity
    style={[styles.btn, disabled && styles.btnDisabled]}
    onPress={onPress}
    activeOpacity={0.6}
    disabled={disabled}
    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
  >
    <View style={styles.iconWrap}>
      <Ionicons name={icon} size={23} color={danger ? '#FF453A' : '#FFFFFF'} />
      {badge != null && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </View>
    <Text style={[styles.label, danger && { color: '#FF453A' }]}>{label}</Text>
  </TouchableOpacity>
);

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
    paddingTop: 12,
    paddingBottom: SAFE_BOTTOM + 8,
    paddingHorizontal: 20,
    ...GLASS_BORDER,
    borderBottomWidth: 0, 
  },
  btn: { alignItems: 'center', gap: 4, minWidth: 60 },
  btnDisabled: { opacity: 0.28 },
  iconWrap: { position: 'relative' },
  label: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '500', letterSpacing: 0.3 },
  badge: {
    position: 'absolute', top: -5, right: -10,
    backgroundColor: '#FF453A', borderRadius: 9,
    minWidth: 17, height: 17,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: 'white', fontSize: 9, fontWeight: '700' },
});