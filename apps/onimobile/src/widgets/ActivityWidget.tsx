/**
 * Activity Widget — Gateway activity log.
 */

import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Activity, Zap, Terminal, FileText } from 'lucide-react-native';
import useThemeStore from '../stores/themeStore';
import { getColors } from '../theme/colors';
import { spacing, radius, fontSize } from '../theme/spacing';

const MOCK_ACTIVITY = [
  { id: '1', icon: Terminal, text: 'Ran command: ls -la', time: '2 min ago', color: '#1B1B1B' },
  { id: '2', icon: FileText, text: 'Created note: Meeting Notes', time: '5 min ago', color: '#FFCA28' },
  { id: '3', icon: Zap, text: 'Gateway connected', time: '10 min ago', color: '#8B7EC8' },
];

export default function ActivityWidget() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.list}>
        {MOCK_ACTIVITY.map((item) => {
          const Icon = item.icon;
          return (
            <View key={item.id} style={[styles.row, { borderBottomColor: c.border }]}>
              <View style={[styles.iconWrap, { backgroundColor: item.color }]}>
                <Icon size={14} color="#fff" />
              </View>
              <View style={styles.info}>
                <Text style={[styles.text, { color: c.text }]}>{item.text}</Text>
                <Text style={[styles.time, { color: c.textTertiary }]}>{item.time}</Text>
              </View>
            </View>
          );
        })}
        {MOCK_ACTIVITY.length === 0 && (
          <View style={styles.empty}>
            <Activity size={32} color={c.textTertiary} />
            <Text style={[styles.emptyText, { color: c.textTertiary }]}>No activity yet</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: 0.5 },
  iconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  text: { fontSize: fontSize.md, fontFamily: 'Inter_400Regular' },
  time: { fontSize: fontSize.xs, fontFamily: 'Inter_400Regular' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: spacing.md },
  emptyText: { fontSize: fontSize.md, fontFamily: 'Inter_400Regular' },
});
