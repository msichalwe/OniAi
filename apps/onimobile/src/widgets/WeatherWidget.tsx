/**
 * Weather Widget — Current weather display (mock data, real data via gateway).
 */

import { View, Text, StyleSheet } from 'react-native';
import { Cloud, Sun, Droplets, Wind } from 'lucide-react-native';
import useThemeStore from '../stores/themeStore';
import { getColors } from '../theme/colors';
import { spacing, radius, fontSize } from '../theme/spacing';

export default function WeatherWidget() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.main}>
        <Sun size={56} color="#F59E0B" />
        <Text style={[styles.temp, { color: c.text }]}>24°C</Text>
        <Text style={[styles.condition, { color: c.textSecondary }]}>Partly Cloudy</Text>
        <Text style={[styles.location, { color: c.textTertiary }]}>Ask Oni for your weather</Text>
      </View>

      <View style={styles.stats}>
        {[
          { icon: Droplets, label: 'Humidity', value: '45%' },
          { icon: Wind, label: 'Wind', value: '12 km/h' },
          { icon: Cloud, label: 'UV Index', value: 'Moderate' },
        ].map(({ icon: Icon, label, value }) => (
          <View key={label} style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Icon size={18} color={c.primary} />
            <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
            <Text style={[styles.statLabel, { color: c.textTertiary }]}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xl },
  main: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing['4xl'] },
  temp: { fontSize: 64, fontFamily: 'Inter_400Regular', letterSpacing: -3 },
  condition: { fontSize: fontSize.xl, fontFamily: 'Inter_500Medium' },
  location: { fontSize: fontSize.sm, fontFamily: 'Inter_400Regular', marginTop: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 0.5,
  },
  statValue: { fontSize: fontSize.lg, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: fontSize.xs, fontFamily: 'Inter_400Regular' },
});
