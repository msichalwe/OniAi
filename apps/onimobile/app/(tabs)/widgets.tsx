/**
 * Widgets Screen — Grid of all available widgets. Tap to open full-screen.
 */

import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Terminal,
  FileText,
  Calculator,
  Globe,
  FolderOpen,
  Clock,
  Activity,
  Settings,
  Database,
  Camera,
  Cloud,
  Map,
} from 'lucide-react-native';
import useThemeStore from '../../src/stores/themeStore';
import useWidgetStore, { WidgetType } from '../../src/stores/widgetStore';
import { getColors } from '../../src/theme/colors';
import { spacing, radius, fontSize } from '../../src/theme/spacing';

const ALL_WIDGETS = [
  { type: 'terminal' as WidgetType, icon: Terminal, label: 'Terminal', desc: 'Run shell commands', color: '#1B1B1B', iconColor: '#fff' },
  { type: 'notes' as WidgetType, icon: FileText, label: 'Notes', desc: 'Create & edit notes', color: '#FFCA28', iconColor: '#1A1A1A' },
  { type: 'calculator' as WidgetType, icon: Calculator, label: 'Calculator', desc: 'Quick calculations', color: '#78909C', iconColor: '#fff' },
  { type: 'browser' as WidgetType, icon: Globe, label: 'Browser', desc: 'Browse the web', color: '#4285F4', iconColor: '#fff' },
  { type: 'files' as WidgetType, icon: FolderOpen, label: 'Files', desc: 'File explorer', color: '#2196F3', iconColor: '#fff' },
  { type: 'clock' as WidgetType, icon: Clock, label: 'Clock', desc: 'Time & system info', color: '#AB47BC', iconColor: '#fff' },
  { type: 'activity' as WidgetType, icon: Activity, label: 'Activity', desc: 'Gateway activity log', color: '#7B1FA2', iconColor: '#fff' },
  { type: 'weather' as WidgetType, icon: Cloud, label: 'Weather', desc: 'Current conditions', color: '#0288D1', iconColor: '#fff' },
  { type: 'settings' as WidgetType, icon: Settings, label: 'Settings', desc: 'App preferences', color: '#546E7A', iconColor: '#fff' },
];

export default function WidgetsScreen() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);
  const router = useRouter();
  const openWidget = useWidgetStore((s) => s.openWidget);

  const handleOpen = (type: WidgetType) => {
    openWidget(type);
    router.push('/widget');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Widgets</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Tap to open full-screen
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {ALL_WIDGETS.map(({ type, icon: Icon, label, desc, color, iconColor }) => (
          <TouchableOpacity
            key={type}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
            activeOpacity={0.7}
            onPress={() => handleOpen(type)}
          >
            <View style={[styles.cardIcon, { backgroundColor: color }]}>
              <Icon size={22} color={iconColor} />
            </View>
            <Text style={[styles.cardLabel, { color: c.text }]}>{label}</Text>
            <Text style={[styles.cardDesc, { color: c.textTertiary }]}>{desc}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: fontSize['3xl'], fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: fontSize.sm, fontFamily: 'Inter_400Regular', marginTop: 4 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    width: '47%',
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 0.5,
    gap: spacing.sm,
  },
  cardIcon: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: fontSize.md, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  cardDesc: { fontSize: fontSize.xs, fontFamily: 'Inter_400Regular' },
});
