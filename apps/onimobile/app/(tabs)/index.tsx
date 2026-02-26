/**
 * Home Screen — Greeting, quick actions, widget shortcuts, recent activity.
 * Matches the design reference: "Hello James" / quick cards / recent search list.
 */

import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  MessageSquare,
  Mic,
  Camera,
  Terminal,
  FileText,
  Calculator,
  Globe,
  FolderOpen,
  Clock,
  Activity,
  Settings,
  Sparkles,
  ChevronRight,
} from 'lucide-react-native';
import useThemeStore from '../../src/stores/themeStore';
import useWidgetStore from '../../src/stores/widgetStore';
import { getColors, colors } from '../../src/theme/colors';
import { spacing, radius, fontSize, fontWeight } from '../../src/theme/spacing';

const QUICK_ACTIONS = [
  {
    id: 'talk',
    label: 'Talk with\nOni',
    desc: "Let's try it now",
    icon: Mic,
    color: colors.primaryMuted,
    route: 'chat' as const,
  },
  {
    id: 'newchat',
    label: 'New chat',
    icon: MessageSquare,
    color: colors.yellowLight,
    badge: 'New',
    route: 'chat' as const,
  },
  {
    id: 'camera',
    label: 'Search by\nimage',
    icon: Camera,
    color: '#2A2A2A',
    iconColor: '#fff',
    route: 'chat' as const,
  },
];

const WIDGET_SHORTCUTS = [
  { type: 'terminal' as const, icon: Terminal, label: 'Terminal', color: '#1B1B1B', iconColor: '#fff' },
  { type: 'notes' as const, icon: FileText, label: 'Notes', color: '#FFCA28' },
  { type: 'calculator' as const, icon: Calculator, label: 'Calc', color: '#78909C', iconColor: '#fff' },
  { type: 'browser' as const, icon: Globe, label: 'Browser', color: '#4285F4', iconColor: '#fff' },
  { type: 'files' as const, icon: FolderOpen, label: 'Files', color: '#2196F3', iconColor: '#fff' },
  { type: 'clock' as const, icon: Clock, label: 'Clock', color: '#AB47BC', iconColor: '#fff' },
  { type: 'activity' as const, icon: Activity, label: 'Activity', color: '#7B1FA2', iconColor: '#fff' },
  { type: 'settings' as const, icon: Settings, label: 'Settings', color: '#546E7A', iconColor: '#fff' },
];

const RECENT_ITEMS = [
  { id: '1', icon: Sparkles, text: 'What is a wild animal?', color: colors.primaryMuted },
  { id: '2', icon: Camera, text: 'Scanning images', color: colors.primaryBg },
  { id: '3', icon: Sparkles, text: 'Run a terminal command', color: colors.primaryMuted },
  { id: '4', icon: Globe, text: 'Search the web for news', color: colors.primaryBg },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);
  const router = useRouter();
  const openWidget = useWidgetStore((s) => s.openWidget);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerBadge, { backgroundColor: c.primaryMuted }]}>
            <Sparkles size={16} color={c.primary} />
            <Text style={[styles.headerBadgeText, { color: c.primary }]}>OniOS 1.0</Text>
          </View>
        </View>

        {/* Greeting */}
        <Text style={[styles.greeting, { color: c.text }]}>{getGreeting()}</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>Make your day easy with Oni</Text>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <TouchableOpacity
                key={action.id}
                style={[
                  styles.quickCard,
                  {
                    backgroundColor: action.color,
                    flex: action.id === 'talk' ? 1.2 : 1,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => router.push(`/(tabs)/${action.route}`)}
              >
                <View style={styles.quickCardInner}>
                  <View style={[styles.quickIconWrap, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>
                    <Icon size={20} color={action.iconColor || c.text} />
                  </View>
                  {action.badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{action.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.quickLabel, { color: action.iconColor || c.text }]}>
                  {action.label}
                </Text>
                {action.desc && (
                  <Text style={[styles.quickDesc, { color: action.iconColor ? 'rgba(255,255,255,0.6)' : c.textTertiary }]}>
                    {action.desc}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Widget Shortcuts */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Widgets</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/widgets')}>
            <Text style={[styles.seeAll, { color: c.primary }]}>See All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.widgetRow}>
          {WIDGET_SHORTCUTS.map(({ type, icon: Icon, label, color, iconColor }) => (
            <TouchableOpacity
              key={type}
              style={styles.widgetChip}
              activeOpacity={0.7}
              onPress={() => {
                openWidget(type);
                router.push('/widget');
              }}
            >
              <View style={[styles.widgetChipIcon, { backgroundColor: color }]}>
                <Icon size={18} color={iconColor || '#1A1A1A'} />
              </View>
              <Text style={[styles.widgetChipLabel, { color: c.textSecondary }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recent Activity */}
        <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Recent</Text>
          <TouchableOpacity>
            <Text style={[styles.seeAll, { color: c.primary }]}>See All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.recentList}>
          {RECENT_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.recentRow, { backgroundColor: c.surface, borderColor: c.border }]}
                activeOpacity={0.7}
                onPress={() => router.push('/(tabs)/chat')}
              >
                <View style={[styles.recentIcon, { backgroundColor: item.color }]}>
                  <Icon size={16} color={c.primary} />
                </View>
                <Text style={[styles.recentText, { color: c.text }]} numberOfLines={1}>
                  {item.text}
                </Text>
                <ChevronRight size={16} color={c.textTertiary} />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl },

  header: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing['2xl'] },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full },
  headerBadgeText: { fontSize: fontSize.sm, fontFamily: 'Inter_600SemiBold' },

  greeting: { fontSize: fontSize['4xl'], fontFamily: 'Inter_700Bold', marginBottom: 4 },
  subtitle: { fontSize: fontSize.md, fontFamily: 'Inter_400Regular', marginBottom: spacing['2xl'] },

  quickActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing['2xl'] },
  quickCard: { borderRadius: radius.xl, padding: spacing.lg, minHeight: 140, justifyContent: 'space-between' },
  quickCardInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  quickIconWrap: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: fontSize.md, fontFamily: 'Inter_700Bold', marginTop: spacing.sm },
  quickDesc: { fontSize: fontSize.xs, fontFamily: 'Inter_400Regular', marginTop: 2 },
  badge: { backgroundColor: '#EF4444', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontFamily: 'Inter_700Bold' },
  seeAll: { fontSize: fontSize.sm, fontFamily: 'Inter_500Medium' },

  widgetRow: { gap: spacing.md, paddingRight: spacing.xl },
  widgetChip: { alignItems: 'center', gap: 6, width: 64 },
  widgetChipIcon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  widgetChipLabel: { fontSize: fontSize.xs, fontFamily: 'Inter_500Medium' },

  recentList: { gap: spacing.sm },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 0.5,
  },
  recentIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  recentText: { flex: 1, fontSize: fontSize.md, fontFamily: 'Inter_400Regular' },
});
