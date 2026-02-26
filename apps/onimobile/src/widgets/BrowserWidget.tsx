/**
 * Browser Widget — Simple WebView browser.
 */

import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Globe, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react-native';
import useThemeStore from '../stores/themeStore';
import { getColors } from '../theme/colors';
import { spacing, radius, fontSize } from '../theme/spacing';

export default function BrowserWidget() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);
  const [url, setUrl] = useState('https://google.com');

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={[styles.urlBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Globe size={16} color={c.textTertiary} />
        <TextInput
          style={[styles.urlInput, { color: c.text }]}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="Enter URL..."
          placeholderTextColor={c.textTertiary}
        />
        <TouchableOpacity>
          <RefreshCw size={16} color={c.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={styles.placeholder}>
        <Globe size={40} color={c.textTertiary} />
        <Text style={[styles.placeholderText, { color: c.textTertiary }]}>
          WebView browser{'\n'}(requires expo-web-browser or react-native-webview)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  urlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
  },
  urlInput: { flex: 1, fontSize: fontSize.sm, fontFamily: 'Inter_400Regular' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  placeholderText: { fontSize: fontSize.sm, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
});
