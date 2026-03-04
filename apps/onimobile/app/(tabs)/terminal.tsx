import React, { useState, useRef } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../src/theme/colors';
import { getGatewayClient } from '../../src/hooks/useGateway';

type TermLine = { type: 'input' | 'output' | 'error' | 'system'; text: string };

const QUICK_COMMANDS = [
  { label: 'Status', cmd: '/status' },
  { label: 'Health', cmd: '/health' },
  { label: 'Sessions', cmd: '/sessions' },
  { label: 'Nodes', cmd: '/nodes' },
  { label: 'Tasks', cmd: '/tasks' },
  { label: 'Cron', cmd: '/cron list' },
];

export default function TerminalScreen() {
  const [lines, setLines] = useState<TermLine[]>([
    { type: 'system', text: '🦊 Oni Terminal — connected to gateway' },
    { type: 'system', text: 'Type a command or use quick buttons below.' },
  ]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const addLine = (line: TermLine) => {
    setLines((prev) => [...prev, line]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const runCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    addLine({ type: 'input', text: `$ ${trimmed}` });
    setInput('');

    const client = getGatewayClient();
    if (!client?.isConnected) {
      addLine({ type: 'error', text: 'Not connected to gateway' });
      return;
    }

    try {
      // Route /commands to chat.send, raw commands to gateway RPC
      if (trimmed.startsWith('/')) {
        await client.sendChat(trimmed);
        addLine({ type: 'system', text: '→ Command sent (check chat for response)' });
      } else {
        const result = await client.request<Record<string, unknown>>(trimmed, {});
        addLine({ type: 'output', text: JSON.stringify(result, null, 2) });
      }
    } catch (err) {
      addLine({ type: 'error', text: String(err) });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Ionicons name="terminal-outline" size={20} color={colors.terminalText} />
        <Text style={styles.headerTitle}>Terminal</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
      >
        {lines.map((line, i) => (
          <Text
            key={i}
            style={[
              styles.line,
              line.type === 'input' && styles.lineInput,
              line.type === 'output' && styles.lineOutput,
              line.type === 'error' && styles.lineError,
              line.type === 'system' && styles.lineSystem,
            ]}
            selectable
          >
            {line.text}
          </Text>
        ))}
      </ScrollView>

      <View style={styles.quickBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickContent}>
          {QUICK_COMMANDS.map((qc) => (
            <Pressable
              key={qc.cmd}
              style={styles.quickBtn}
              onPress={() => runCommand(qc.cmd)}
            >
              <Text style={styles.quickBtnText}>{qc.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.inputRow}>
        <Text style={styles.prompt}>$</Text>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="command..."
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={() => runCommand(input)}
          returnKeyType="send"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.runBtn} onPress={() => runCommand(input)}>
          <Ionicons name="play" size={16} color={colors.terminalText} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.terminalBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.terminalText, fontSize: 16, fontWeight: '700' },
  output: { flex: 1 },
  outputContent: { padding: spacing.md },
  line: { fontFamily: 'Courier', fontSize: 13, lineHeight: 20, marginBottom: 2 },
  lineInput: { color: colors.terminalPrompt, fontWeight: '700' },
  lineOutput: { color: colors.text },
  lineError: { color: colors.error },
  lineSystem: { color: colors.textMuted, fontStyle: 'italic' },
  quickBar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.terminalBg },
  quickContent: { padding: spacing.sm, gap: spacing.sm },
  quickBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickBtnText: { color: colors.terminalText, fontSize: 12, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  prompt: { color: colors.terminalPrompt, fontFamily: 'Courier', fontSize: 15, fontWeight: '700' },
  input: {
    flex: 1,
    color: colors.terminalText,
    fontFamily: 'Courier',
    fontSize: 14,
    paddingVertical: spacing.sm,
  },
  runBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
