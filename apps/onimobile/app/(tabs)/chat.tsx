/**
 * Chat Screen — Voice-first AI chat with rich message rendering.
 * Design: prominent mic button, message bubbles, floating action bar.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Mic,
  MicOff,
  Send,
  Plus,
  Sparkles,
  StopCircle,
  Camera,
} from 'lucide-react-native';
import useThemeStore from '../../src/stores/themeStore';
import useChatStore from '../../src/stores/chatStore';
import useGatewayStore from '../../src/stores/gatewayStore';
import { getColors, colors } from '../../src/theme/colors';
import { spacing, radius, fontSize } from '../../src/theme/spacing';
import { sendChatMessage } from '../../src/gateway/api';

export default function ChatScreen() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const isLoading = useChatStore((s) => s.isLoading);
  const setLoading = useChatStore((s) => s.setLoading);
  const sessionId = useChatStore((s) => s.sessionId);
  const newSession = useChatStore((s) => s.newSession);

  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText('');
    addMessage({ role: 'user', text });
    setLoading(true);

    try {
      const response = await sendChatMessage(text, sessionId);
      addMessage({
        role: 'assistant',
        text: response.text || '(no response)',
        sections: response.sections,
      });
    } catch (err: any) {
      addMessage({
        role: 'assistant',
        text: `Connection error: ${err.message}. Check gateway settings.`,
      });
    } finally {
      setLoading(false);
    }
  }, [inputText, isLoading, sessionId]);

  const handleMicPress = useCallback(() => {
    setIsRecording((prev) => !prev);
    // TODO: integrate expo-av recording + speech-to-text
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={[styles.headerBadge, { backgroundColor: c.primaryMuted }]}>
            <Sparkles size={14} color={c.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: c.text }]}>Oni</Text>
          <TouchableOpacity onPress={newSession} style={styles.headerAction}>
            <Plus size={20} color={c.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.messagesContent, isEmpty && styles.emptyCenter]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isEmpty ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: c.primaryMuted }]}>
                <Sparkles size={32} color={c.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: c.text }]}>Talk with Oni</Text>
              <Text style={[styles.emptyDesc, { color: c.textTertiary }]}>
                Tap the mic to speak, or type a message below.{'\n'}
                Oni can control your desktop, search the web, and more.
              </Text>

              {/* Quick prompts */}
              <View style={styles.prompts}>
                {['What can you do?', 'Open terminal', 'Search the web'].map((prompt) => (
                  <TouchableOpacity
                    key={prompt}
                    style={[styles.promptChip, { backgroundColor: c.surface, borderColor: c.border }]}
                    onPress={() => {
                      setInputText(prompt);
                    }}
                  >
                    <Text style={[styles.promptText, { color: c.textSecondary }]}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.bubble,
                  msg.role === 'user' ? styles.bubbleUser : styles.bubbleAi,
                  {
                    backgroundColor: msg.role === 'user' ? c.userBubble : c.aiBubble,
                  },
                ]}
              >
                {msg.role === 'assistant' && (
                  <View style={styles.bubbleHeader}>
                    <View style={[styles.bubbleAvatar, { backgroundColor: c.primaryMuted }]}>
                      <Sparkles size={12} color={c.primary} />
                    </View>
                    <Text style={[styles.bubbleName, { color: c.textTertiary }]}>Oni</Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.bubbleText,
                    {
                      color: msg.role === 'user' ? c.userBubbleText : c.aiBubbleText,
                    },
                  ]}
                  selectable
                >
                  {msg.text}
                </Text>
                <Text style={[styles.bubbleTime, { color: msg.role === 'user' ? 'rgba(255,255,255,0.4)' : c.textTertiary }]}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))
          )}

          {isLoading && (
            <View style={[styles.bubble, styles.bubbleAi, { backgroundColor: c.aiBubble }]}>
              <View style={styles.bubbleHeader}>
                <View style={[styles.bubbleAvatar, { backgroundColor: c.primaryMuted }]}>
                  <Sparkles size={12} color={c.primary} />
                </View>
                <Text style={[styles.bubbleName, { color: c.textTertiary }]}>Oni</Text>
              </View>
              <ActivityIndicator size="small" color={c.primary} style={{ alignSelf: 'flex-start' }} />
            </View>
          )}
        </ScrollView>

        {/* Floating Action Bar (mic + camera) — right side like design */}
        {isEmpty && (
          <View style={styles.floatingActions}>
            <TouchableOpacity style={[styles.floatingBtn, { backgroundColor: c.primaryMuted }]}>
              <Camera size={20} color={c.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.floatingBtnLarge, { backgroundColor: isRecording ? colors.error : '#2A2A2A' }]}
              onPress={handleMicPress}
              activeOpacity={0.8}
            >
              {isRecording ? <StopCircle size={24} color="#fff" /> : <Mic size={24} color="#fff" />}
            </TouchableOpacity>
          </View>
        )}

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <TextInput
            style={[styles.input, { color: c.text, backgroundColor: c.bg }]}
            placeholder="Ask anything here.."
            placeholderTextColor={c.textTertiary}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline
            maxLength={2000}
          />
          {inputText.trim() ? (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: c.primary }]}
              onPress={handleSend}
              disabled={isLoading}
            >
              <Send size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: isRecording ? colors.error : '#2A2A2A' }]}
              onPress={handleMicPress}
            >
              {isRecording ? <StopCircle size={18} color="#fff" /> : <Mic size={18} color="#fff" />}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    gap: spacing.sm,
  },
  headerBadge: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: fontSize.lg, fontFamily: 'Inter_700Bold' },
  headerAction: { padding: spacing.sm },

  messagesContent: { padding: spacing.xl, gap: spacing.md },
  emptyCenter: { flex: 1, justifyContent: 'center' },

  emptyState: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing['2xl'] },
  emptyIcon: { width: 64, height: 64, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  emptyTitle: { fontSize: fontSize['2xl'], fontFamily: 'Inter_700Bold' },
  emptyDesc: { fontSize: fontSize.sm, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },

  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg, justifyContent: 'center' },
  promptChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1 },
  promptText: { fontSize: fontSize.sm, fontFamily: 'Inter_500Medium' },

  bubble: { maxWidth: '85%', borderRadius: radius.xl, padding: spacing.lg },
  bubbleUser: { alignSelf: 'flex-end', borderBottomRightRadius: radius.sm },
  bubbleAi: { alignSelf: 'flex-start', borderBottomLeftRadius: radius.sm },
  bubbleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  bubbleAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bubbleName: { fontSize: fontSize.xs, fontFamily: 'Inter_600SemiBold' },
  bubbleText: { fontSize: fontSize.md, fontFamily: 'Inter_400Regular', lineHeight: 22 },
  bubbleTime: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 6, alignSelf: 'flex-end' },

  floatingActions: {
    position: 'absolute',
    right: spacing.xl,
    bottom: 100,
    gap: spacing.md,
    alignItems: 'center',
  },
  floatingBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  floatingBtnLarge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 0.5,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    fontFamily: 'Inter_400Regular',
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
