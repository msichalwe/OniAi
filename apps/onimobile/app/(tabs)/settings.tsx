import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../src/theme/colors';
import { useGateway } from '../../src/hooks/useGateway';
import { loadGatewayConfig, clearGatewayConfig, type StoredConfig } from '../../src/lib/gateway-client';

export default function SettingsScreen() {
  const { state, connect, config: currentConfig } = useGateway();
  const [host, setHost] = useState('76.13.32.166');
  const [port, setPort] = useState('19100');
  const [token, setToken] = useState('');
  const [tls, setTls] = useState(false);

  useEffect(() => {
    loadGatewayConfig().then((cfg) => {
      if (cfg) {
        setHost(cfg.host);
        setPort(String(cfg.port));
        setToken(cfg.token);
        setTls(cfg.tls ?? false);
      }
    });
  }, []);

  const handleConnect = () => {
    const cfg: StoredConfig = {
      host: host.trim(),
      port: parseInt(port, 10) || 19100,
      token: token.trim(),
      tls,
    };
    if (!cfg.host || !cfg.token) {
      Alert.alert('Missing Info', 'Host and token are required');
      return;
    }
    connect(cfg);
  };

  const handleClear = () => {
    Alert.alert('Clear Config', 'Remove saved connection?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearGatewayConfig();
          setHost('');
          setPort('19100');
          setToken('');
        },
      },
    ]);
  };

  const statusColor = state === 'connected' ? colors.success : state === 'connecting' ? colors.warning : colors.error;
  const statusLabel = state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting...' : 'Disconnected';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>🦊 Oni Gateway</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Host</Text>
            <TextInput
              style={styles.input}
              value={host}
              onChangeText={setHost}
              placeholder="76.13.32.166"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Port</Text>
            <TextInput
              style={styles.input}
              value={port}
              onChangeText={setPort}
              placeholder="19100"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Auth Token</Text>
            <TextInput
              style={styles.input}
              value={token}
              onChangeText={setToken}
              placeholder="Gateway auth token"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>

          <Pressable style={styles.tlsRow} onPress={() => setTls(!tls)}>
            <Ionicons
              name={tls ? 'checkbox' : 'square-outline'}
              size={20}
              color={tls ? colors.accent : colors.textSecondary}
            />
            <Text style={styles.tlsLabel}>Use TLS (wss://)</Text>
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.connectBtn} onPress={handleConnect}>
            <Ionicons name="flash-outline" size={18} color="#fff" />
            <Text style={styles.connectBtnText}>Connect</Text>
          </Pressable>

          <Pressable style={styles.clearBtn} onPress={handleClear}>
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={styles.clearBtnText}>Clear Config</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Setup</Text>
          <Text style={styles.hint}>
            To find your gateway token, run on the server:{'\n'}
            <Text style={styles.code}>cat ~/.oni/oni.json | grep token</Text>
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.hint}>
            Oni Mobile v1.0.0{'\n'}
            Connects to OniAI gateway via WebSocket RPC.{'\n'}
            Server: {currentConfig?.host ?? 'not configured'}:{currentConfig?.port ?? ''}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.xxl },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 14, fontWeight: '600' },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  field: { marginBottom: spacing.lg },
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.xs, fontWeight: '600' },
  input: {
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tlsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tlsLabel: { color: colors.text, fontSize: 14 },
  actions: { gap: spacing.md, marginBottom: spacing.lg },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
  },
  connectBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  clearBtnText: { color: colors.error, fontSize: 14 },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  code: { fontFamily: 'Courier', color: colors.terminalText, fontSize: 12 },
});
