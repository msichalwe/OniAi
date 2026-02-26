/**
 * Terminal Widget — Run shell commands via gateway API.
 */

import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Send } from 'lucide-react-native';
import useThemeStore from '../stores/themeStore';
import { getColors } from '../theme/colors';
import { spacing, radius, fontSize } from '../theme/spacing';
import { runTerminalCommand } from '../gateway/api';

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error';
  text: string;
}

let lineId = 0;

export default function TerminalWidget() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: lineId++, type: 'output', text: 'OniOS Terminal — connected to gateway' },
  ]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleRun = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || running) return;
    setInput('');
    setLines((prev) => [...prev, { id: lineId++, type: 'input', text: `$ ${cmd}` }]);
    setRunning(true);

    try {
      const res = await runTerminalCommand(cmd);
      const output = res?.output || res?.result || JSON.stringify(res);
      setLines((prev) => [...prev, { id: lineId++, type: 'output', text: String(output) }]);
    } catch (err: any) {
      setLines((prev) => [...prev, { id: lineId++, type: 'error', text: `Error: ${err.message}` }]);
    } finally {
      setRunning(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [input, running]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={[styles.output, { backgroundColor: '#0D0D0D' }]}
        contentContainerStyle={styles.outputContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {lines.map((line) => (
          <Text
            key={line.id}
            style={[
              styles.line,
              line.type === 'input' && styles.lineInput,
              line.type === 'error' && styles.lineError,
            ]}
            selectable
          >
            {line.text}
          </Text>
        ))}
        {running && <Text style={styles.line}>Running...</Text>}
      </ScrollView>

      <View style={styles.inputBar}>
        <Text style={styles.prompt}>$</Text>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleRun}
          placeholder="Enter command..."
          placeholderTextColor="rgba(255,255,255,0.25)"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
        />
        <TouchableOpacity onPress={handleRun} disabled={running || !input.trim()}>
          <Send size={18} color={input.trim() ? '#8B7EC8' : 'rgba(255,255,255,0.2)'} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  output: { flex: 1 },
  outputContent: { padding: spacing.lg },
  line: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 20, marginBottom: 2 },
  lineInput: { color: '#8B7EC8' },
  lineError: { color: '#EF4444' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  prompt: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14, color: '#8B7EC8' },
  input: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    color: '#fff',
    padding: 0,
  },
});
