import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme/colors';
import type { ConnectionState } from '../../types/messages';

type Props = {
  state: ConnectionState;
  onReconnect?: () => void;
};

export function ConnectionBanner({ state, onReconnect }: Props) {
  if (state === 'connected') return null;

  const config: Record<string, { icon: string; color: string; label: string }> = {
    disconnected: { icon: 'cloud-offline-outline', color: colors.textMuted, label: 'Disconnected' },
    connecting: { icon: 'sync-outline', color: colors.warning, label: 'Connecting...' },
    error: { icon: 'alert-circle-outline', color: colors.error, label: 'Connection error' },
  };

  const c = config[state] ?? config.disconnected!;

  return (
    <Pressable style={[styles.banner, { backgroundColor: c.color + '15' }]} onPress={onReconnect}>
      <Ionicons name={c.icon as any} size={16} color={c.color} />
      <Text style={[styles.text, { color: c.color }]}>{c.label}</Text>
      {state !== 'connecting' && (
        <Text style={[styles.tap, { color: c.color }]}>Tap to reconnect</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  text: { fontSize: 13, fontWeight: '600' },
  tap: { fontSize: 11, opacity: 0.7 },
});
