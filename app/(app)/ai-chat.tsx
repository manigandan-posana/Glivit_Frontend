import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSendChatMessageMutation, type ChatMessageDto } from '@/src/services/aiApi';
import { formatAiPlainText } from '@/src/services/aiPlainText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

const CONNECTION_ERROR = 'Unable to connect to AI. Please try again.';

function messageTime(timestamp?: string) {
  const parsed = timestamp ? new Date(timestamp) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AiChatScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [messages, setMessages] = useState<ChatMessageDto[]>([
    {
      role: 'assistant',
      content:
        "Hello! I'm your Glivt AI Fleet Assistant. Ask me about fleet status, maintenance, alerts, driver scores, routes, fuel, or reports.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sendMessage, { isLoading }] = useSendChatMessageMutation();
  const listRef = useRef<FlatList>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const showEvents = ['keyboardDidShow', 'keyboardWillShow'] as const;
    const hideEvents = ['keyboardDidHide', 'keyboardWillHide'] as const;
    const subs = [
      ...showEvents.map((e) =>
        Keyboard.addListener(e as any, () => {
          setKeyboardOpen(true);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        })
      ),
      ...hideEvents.map((e) =>
        Keyboard.addListener(e as any, () => setKeyboardOpen(false))
      ),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessageDto = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    try {
      const response = await sendMessage({
        message: userMsg.content,
        history: messages,
      }).unwrap();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: formatAiPlainText(response.message, 'Unable to connect to AI. Please try again.'),
          timestamp: response.timestamp || new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Unable to connect to AI. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [input, isLoading, messages, sendMessage]);

  const renderItem = ({ item }: { item: ChatMessageDto }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {!isUser && (
          <View style={styles.aiIconWrapper}>
            <MaterialCommunityIcons name="robot-outline" size={16} color="#fff" />
          </View>
        )}
        <View style={styles.messageContent}>
          {isUser ? (
            <Text style={[styles.messageText, styles.userMessageText]}>{item.content}</Text>
          ) : (
            <Text style={styles.messageText}>{formatAiPlainText(item.content)}</Text>
          )}
          <Text style={[styles.timestamp, isUser && styles.timestampUser]}>{messageTime(item.timestamp)}</Text>
        </View>
      </View>
    );
  };

  const quickPrompts = ['Fleet status', 'Maintenance', 'Alerts', 'Driver scores', 'Fuel report'];

  const bottomPadding = keyboardOpen ? spacing.md : Math.max(spacing.md, insets.bottom);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 50 : 0}>
      <FlatList
        ref={listRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => listRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={
          isLoading ? (
            <View style={styles.typingIndicator}>
              <View style={styles.aiIconWrapper}>
                <MaterialCommunityIcons name="robot-outline" size={16} color="#fff" />
              </View>
              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color={c.primary} />
                <Text style={styles.typingText}>Glivt AI is thinking...</Text>
              </View>
            </View>
          ) : null
        }
      />

      {messages.length <= 1 && (
        <View style={styles.quickRow}>
          {quickPrompts.map((p) => (
            <Pressable key={p} style={styles.quickChip} onPress={() => setInput(p)}>
              <Text style={styles.quickChipText}>{p}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={[styles.inputArea, { paddingBottom: bottomPadding }]}>
        <TextInput
          style={styles.input}
          placeholder="Ask AI anything about your fleet..."
          placeholderTextColor={c.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline
        />
        <Pressable
          style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || isLoading}>
          <MaterialCommunityIcons name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.pageBackground },
    messageList: { flex: 1 },
    messageListContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
    messageBubble: {
      maxWidth: '88%',
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
    },
    userBubble: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
    aiBubble: { alignSelf: 'flex-start' },
    messageContent: { flex: 1, gap: 3 },
    aiIconWrapper: {
      backgroundColor: c.primary,
      borderRadius: radius.pill,
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      flexShrink: 0,
    },
    messageText: {
      color: c.textPrimary,
      fontSize: typography.body,
      lineHeight: 21,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: radius.md,
      borderBottomLeftRadius: 2,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      flexShrink: 1,
    },
    userMessageText: {
      color: '#fff',
      backgroundColor: c.primary,
      borderColor: 'transparent',
      borderBottomLeftRadius: radius.md,
      borderBottomRightRadius: 2,
    },
    timestamp: { fontSize: 10, color: c.textMuted, marginLeft: 4 },
    timestampUser: { textAlign: 'right', marginRight: 4 },
    typingIndicator: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    typingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    typingText: { color: c.textMuted, fontSize: typography.caption, fontStyle: 'italic' },
    quickRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    quickChip: {
      backgroundColor: c.surface,
      borderColor: c.primary,
      borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    quickChipText: { color: c.primary, fontSize: typography.caption, fontWeight: '700' },
    inputArea: {
      flexDirection: 'row',
      padding: spacing.md,
      backgroundColor: c.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      gap: spacing.sm,
      alignItems: 'flex-end',
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: c.pageBackground,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      color: c.textPrimary,
      fontSize: typography.body,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: { opacity: 0.4 },
  });
