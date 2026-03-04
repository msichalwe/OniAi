import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme/colors';
import type { ChatMessage, MessageWidget } from '../../types/messages';

function WidgetChip({ widget }: { widget: MessageWidget }) {
  const iconMap: Record<string, string> = {
    thinking: 'bulb-outline',
    'tool-call': 'construct-outline',
    terminal: 'terminal-outline',
    browser: 'globe-outline',
    subagent: 'git-branch-outline',
    image: 'image-outline',
    voice: 'mic-outline',
    file: 'document-outline',
    code: 'code-slash-outline',
    error: 'alert-circle-outline',
  };
  const icon = iconMap[widget.type] || 'ellipsis-horizontal';
  const chipColors: Record<string, string> = {
    thinking: colors.info,
    'tool-call': colors.accent,
    terminal: colors.terminalText,
    browser: colors.info,
    subagent: colors.warning,
    error: colors.error,
  };
  const chipColor = chipColors[widget.type] || colors.textSecondary;

  return (
    <View style={[styles.widgetChip, { borderColor: chipColor + '40' }]}>
      <Ionicons name={icon as any} size={12} color={chipColor} />
      <Text style={[styles.widgetChipText, { color: chipColor }]} numberOfLines={1}>
        {widget.title || widget.type}
      </Text>
    </View>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.botContainer]}>
      {!isUser && (
        <View style={styles.avatarContainer}>
          <Text style={styles.avatar}>🦊</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.botText]}>
          {message.text}
        </Text>
        {message.streaming && (
          <Text style={styles.streamingIndicator}>●●●</Text>
        )}
        {message.widgets && message.widgets.length > 0 && (
          <View style={styles.widgetsRow}>
            {message.widgets.map((w, i) => (
              <WidgetChip key={i} widget={w} />
            ))}
          </View>
        )}
        <Text style={styles.timestamp}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: spacing.xs,
    marginHorizontal: spacing.md,
    maxWidth: '85%',
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  botContainer: {
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },
  avatar: {
    fontSize: 16,
  },
  bubble: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    maxWidth: '100%',
  },
  userBubble: {
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: radius.sm,
  },
  botBubble: {
    backgroundColor: colors.botBubble,
    borderBottomLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#fff',
  },
  botText: {
    color: colors.text,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  streamingIndicator: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 2,
    marginTop: spacing.xs,
  },
  widgetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  widgetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  widgetChipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  systemContainer: {
    alignSelf: 'center',
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgTertiary,
    borderRadius: radius.full,
  },
  systemText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
