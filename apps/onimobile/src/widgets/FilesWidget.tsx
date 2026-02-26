/**
 * Files Widget — Browse files via gateway API.
 */

import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FolderOpen, FileText, ChevronRight, ArrowLeft } from 'lucide-react-native';
import useThemeStore from '../stores/themeStore';
import { getColors } from '../theme/colors';
import { spacing, radius, fontSize } from '../theme/spacing';
import { listFiles } from '../gateway/api';

export default function FilesWidget() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);
  const [path, setPath] = useState('~');
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    listFiles(path)
      .then((data) => setFiles(data?.files || data?.entries || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [path]);

  const goUp = () => {
    const parts = path.split('/');
    if (parts.length > 1) setPath(parts.slice(0, -1).join('/') || '~');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={[styles.pathBar, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goUp} style={styles.upBtn}>
          <ArrowLeft size={18} color={c.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.pathText, { color: c.textSecondary }]} numberOfLines={1}>{path}</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={c.primary} />
      ) : error ? (
        <Text style={[styles.errorText, { color: c.textTertiary }]}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {files.map((f: any, i: number) => {
            const isDir = f.type === 'directory' || f.isDirectory;
            const Icon = isDir ? FolderOpen : FileText;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.row, { borderBottomColor: c.border }]}
                onPress={() => isDir && setPath(f.path || `${path}/${f.name}`)}
              >
                <Icon size={18} color={isDir ? c.primary : c.textTertiary} />
                <Text style={[styles.fileName, { color: c.text }]} numberOfLines={1}>{f.name}</Text>
                {isDir && <ChevronRight size={16} color={c.textTertiary} />}
              </TouchableOpacity>
            );
          })}
          {files.length === 0 && <Text style={[styles.emptyText, { color: c.textTertiary }]}>Empty directory</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pathBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, borderBottomWidth: 0.5 },
  upBtn: { padding: 4 },
  pathText: { flex: 1, fontSize: fontSize.sm, fontFamily: 'Inter_500Medium' },
  loader: { marginTop: 40 },
  errorText: { padding: spacing.xl, fontSize: fontSize.sm, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  list: { padding: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 0.5 },
  fileName: { flex: 1, fontSize: fontSize.md, fontFamily: 'Inter_400Regular' },
  emptyText: { padding: spacing.xl, textAlign: 'center', fontSize: fontSize.sm, fontFamily: 'Inter_400Regular' },
});
