import React, { useRef, useEffect } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { ChatInput } from '../../src/components/chat/ChatInput';
import { ConnectionBanner } from '../../src/components/chat/ConnectionBanner';
import { useGateway } from '../../src/hooks/useGateway';
import { colors } from '../../src/theme/colors';
import type { ChatMessage } from '../../src/types/messages';

export default function ChatScreen() {
  const { state, messages, sendMessage, connect, config } = useGateway();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleReconnect = () => {
    if (config) connect(config);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ConnectionBanner state={state} onReconnect={handleReconnect} />
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }}
      />
      <ChatInput
        onSend={sendMessage}
        disabled={state !== 'connected'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  messagesList: {
    paddingVertical: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
});
