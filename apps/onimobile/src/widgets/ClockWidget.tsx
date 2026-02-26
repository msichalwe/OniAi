/**
 * Clock Widget — Time, date, and system info.
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import useThemeStore from '../stores/themeStore';
import { getColors } from '../theme/colors';
import { spacing, radius, fontSize } from '../theme/spacing';

export default function ClockWidget() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Text style={[styles.time, { color: c.text }]}>{time}</Text>
      <Text style={[styles.date, { color: c.textSecondary }]}>{date}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  time: { fontSize: 56, fontFamily: 'Inter_400Regular', letterSpacing: -2 },
  date: { fontSize: fontSize.lg, fontFamily: 'Inter_500Medium' },
});
