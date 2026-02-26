/**
 * Settings Screen — Gateway config, theme, voice preferences.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Moon,
  Sun,
  Mic,
  MicOff,
  Server,
  Wifi,
  CheckCircle2,
  Loader2,
  Shield,
  Info,
} from 'lucide-react-native';
import useThemeStore from '../../src/stores/themeStore';
import useGatewayStore from '../../src/stores/gatewayStore';
import { getColors, colors } from '../../src/theme/colors';
import { spacing, radius, fontSize } from '../../src/theme/spacing';
import { testConnection } from '../../src/gateway/api';

export default function SettingsScreen() {
  const scheme = useThemeStore((s) => s.scheme);
  const toggleScheme = useThemeStore((s) => s.toggleScheme);
  const c = getColors(scheme);

  const gatewayUrl = useGatewayStore((s) => s.gatewayUrl);
  const setGatewayUrl = useGatewayStore((s) => s.setGatewayUrl);
  const connected = useGatewayStore((s) => s.connected);
  const setConnected = useGatewayStore((s) => s.setConnected);

  const [urlInput, setUrlInput] = useState(gatewayUrl);
  const [testing, setTesting] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    const ok = await testConnection(urlInput);
    setTesting(false);
    if (ok) {
      setGatewayUrl(urlInput);
      setConnected(true);
      Alert.alert('Connected', 'Gateway connection successful.');
    } else {
      setConnected(false);
      Alert.alert('Failed', 'Could not connect to the gateway.');
    }
  }, [urlInput]);

  const isDark = scheme === 'dark';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: c.text }]}>Settings</Text>

        {/* Gateway */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>GATEWAY</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.row}>
            <Server size={18} color={c.textSecondary} />
            <Text style={[styles.rowLabel, { color: c.text }]}>Server URL</Text>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { color: c.text, backgroundColor: c.bg, borderColor: c.border }]}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="http://127.0.0.1:5173"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: c.primaryMuted }]}
              onPress={handleTestConnection}
              disabled={testing}
            >
              {testing ? (
                <Loader2 size={16} color={c.primary} />
              ) : (
                <Wifi size={16} color={c.primary} />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.textTertiary }]} />
            <Text style={[styles.statusText, { color: c.textSecondary }]}>
              {connected ? 'Connected' : 'Not connected'}
            </Text>
          </View>
        </View>

        {/* Appearance */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity style={styles.settingRow} onPress={toggleScheme}>
            <View style={styles.row}>
              {isDark ? <Moon size={18} color={c.textSecondary} /> : <Sun size={18} color={c.textSecondary} />}
              <View style={styles.settingInfo}>
                <Text style={[styles.rowLabel, { color: c.text }]}>Dark Mode</Text>
                <Text style={[styles.rowDesc, { color: c.textTertiary }]}>
                  {isDark ? 'On' : 'Off'}
                </Text>
              </View>
            </View>
            <View style={[styles.toggle, isDark && styles.toggleOn, isDark && { backgroundColor: colors.primary }]}>
              <View style={[styles.toggleThumb, isDark && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Voice */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>VOICE</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity style={styles.settingRow} onPress={() => setVoiceEnabled(!voiceEnabled)}>
            <View style={styles.row}>
              {voiceEnabled ? <Mic size={18} color={c.textSecondary} /> : <MicOff size={18} color={c.textSecondary} />}
              <View style={styles.settingInfo}>
                <Text style={[styles.rowLabel, { color: c.text }]}>Always Listening</Text>
                <Text style={[styles.rowDesc, { color: c.textTertiary }]}>
                  Say "Oni" to activate
                </Text>
              </View>
            </View>
            <View style={[styles.toggle, voiceEnabled && styles.toggleOn, voiceEnabled && { backgroundColor: colors.primary }]}>
              <View style={[styles.toggleThumb, voiceEnabled && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>ABOUT</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.aboutRow}>
            <Text style={[styles.rowLabel, { color: c.text }]}>OniOS Mobile</Text>
            <Text style={[styles.rowDesc, { color: c.textTertiary }]}>v0.1.0</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.aboutRow}>
            <Text style={[styles.rowLabel, { color: c.text }]}>Gateway Type</Text>
            <Text style={[styles.rowDesc, { color: c.textTertiary }]}>
              {useGatewayStore.getState().gatewayType === 'oni' ? 'Oni' : 'OpenClaw'}
            </Text>
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  title: { fontSize: fontSize['3xl'], fontFamily: 'Inter_700Bold', marginBottom: spacing['2xl'] },

  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },

  card: { borderRadius: radius.xl, borderWidth: 0.5, padding: spacing.lg, marginBottom: spacing.sm },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel: { fontSize: fontSize.md, fontFamily: 'Inter_600SemiBold' },
  rowDesc: { fontSize: fontSize.xs, fontFamily: 'Inter_400Regular', marginTop: 1 },

  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingInfo: { flex: 1, marginLeft: spacing.md },

  inputRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  input: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.sm,
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
  },
  testBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: fontSize.xs, fontFamily: 'Inter_500Medium' },

  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.08)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: {},
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbOn: { alignSelf: 'flex-end' },

  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  divider: { height: 0.5, marginVertical: spacing.md },
});
