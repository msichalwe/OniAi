/**
 * Widget Screen — Full-screen container for a single widget.
 * Renders the active widget from widgetStore with a back header.
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, X } from 'lucide-react-native';
import useThemeStore from '../src/stores/themeStore';
import useWidgetStore from '../src/stores/widgetStore';
import { getColors } from '../src/theme/colors';
import { spacing, radius, fontSize } from '../src/theme/spacing';

import TerminalWidget from '../src/widgets/TerminalWidget';
import NotesWidget from '../src/widgets/NotesWidget';
import CalculatorWidget from '../src/widgets/CalculatorWidget';
import FilesWidget from '../src/widgets/FilesWidget';
import BrowserWidget from '../src/widgets/BrowserWidget';
import ClockWidget from '../src/widgets/ClockWidget';
import ActivityWidget from '../src/widgets/ActivityWidget';
import WeatherWidget from '../src/widgets/WeatherWidget';

const WIDGET_MAP: Record<string, { component: React.ComponentType<any>; title: string }> = {
  terminal: { component: TerminalWidget, title: 'Terminal' },
  notes: { component: NotesWidget, title: 'Notes' },
  calculator: { component: CalculatorWidget, title: 'Calculator' },
  files: { component: FilesWidget, title: 'Files' },
  browser: { component: BrowserWidget, title: 'Browser' },
  clock: { component: ClockWidget, title: 'Clock' },
  activity: { component: ActivityWidget, title: 'Activity' },
  weather: { component: WeatherWidget, title: 'Weather' },
};

export default function WidgetScreen() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);
  const router = useRouter();
  const activeWidget = useWidgetStore((s) => s.activeWidget);
  const widgetProps = useWidgetStore((s) => s.widgetProps);
  const closeWidget = useWidgetStore((s) => s.closeWidget);

  const entry = activeWidget ? WIDGET_MAP[activeWidget] : null;

  const handleClose = () => {
    closeWidget();
    router.back();
  };

  if (!entry || !activeWidget) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: c.textTertiary }]}>No widget selected</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text style={[styles.link, { color: c.primary }]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const WidgetComponent = entry.component;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>{entry.title}</Text>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={8}>
          <X size={20} color={c.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Widget content */}
      <View style={styles.widgetContainer}>
        <WidgetComponent {...widgetProps} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { flex: 1, fontSize: fontSize.lg, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  closeBtn: { padding: spacing.xs },

  widgetContainer: { flex: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Inter_400Regular' },
  link: { fontSize: fontSize.md, fontFamily: 'Inter_600SemiBold' },
});
