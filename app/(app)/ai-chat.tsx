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

import {
  useSendChatMessageMutation,
  type ChatMessageDto,
  type ChatResponseDto,
} from '@/src/services/aiApi';
import { apiErrorMessage } from '@/src/services/apiError';
import { useAppSelector } from '@/src/store/hooks';
import { formatAiPlainText } from '@/src/services/aiPlainText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

const CONNECTION_ERROR = 'Unable to reach the assistant. Please try again.';

/**
 * Short, honest label for where an answer came from.
 *
 * A deterministic answer is still built from the user's real fleet data, so it
 * is labelled as such rather than as a failure - but the *reason* the model was
 * skipped matters: a missing token is an operator problem, a stopped Ollama is
 * a different one, and blaming "the model" for either is misleading.
 */
function sourceLabel(
  message: ChatMessageDto
): { text: string; tone: 'ai' | 'rule' | 'error' } | null {
  if (message.role !== 'assistant') return null;
  if (message.source === 'OLLAMA') return null;
  if (message.source === 'NONE') {
    return { text: CONNECTION_ERROR, tone: 'error' };
  }
  if (message.source === 'DETERMINISTIC') {
    const reason = degradedReason(message.fallbackReason);
    const text = reason ? `Answered from your fleet data — ${reason}` : 'Answered from your fleet data.';
    return { text, tone: 'rule' };
  }
  return null;
}

/** Plain-language cause for a degraded answer. */
function degradedReason(reason?: string | null): string {
  if (!reason || reason === 'NONE') {
    return '';
  }
  switch (reason) {
    case 'OLLAMA_UNAVAILABLE':
      return 'the AI model is not running';
    case 'MODEL_NOT_INSTALLED':
      return 'the configured AI model is not installed';
    case 'OLLAMA_TIMEOUT':
      return 'the AI model timed out';
    case 'NOT_CONFIGURED':
      return 'the AI service is not configured (missing internal token)';
    case 'UNAUTHORIZED':
      return 'the AI service rejected the internal token';
    case 'CONNECTION_REFUSED':
    case 'CONNECT_TIMEOUT':
      return 'the AI service is unreachable';
    case 'CIRCUIT_OPEN':
      return 'the AI service is temporarily circuit-broken after repeated failures';
    case 'EMPTY_RESPONSE':
      return 'the AI model returned nothing';
    default:
      return 'the AI model was unavailable';
  }
}

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
  // The vehicle the user is currently looking at, so "where is it?" resolves.
  const selectedVehicleId = useAppSelector((s) => s.vehiclePreferences?.selectedVehicleId ?? null);
  const listRef = useRef<FlatList>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  // `isLoading` updates a tick after dispatch, so a fast double-tap could fire
  // two identical requests before it flips. This ref closes that window.
  const inFlightRef = useRef(false);

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
    const question = input.trim();
    if (!question || isLoading || inFlightRef.current) return;
    inFlightRef.current = true;

    const userMsg: ChatMessageDto = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    try {
      const response: ChatResponseDto = await sendMessage({
        message: question,
        history: messages.slice(-6),
        ...(selectedVehicleId ? { selectedVehicleId } : {}),
      }).unwrap();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: formatAiPlainText(response.reply || 'No response', CONNECTION_ERROR),
          timestamp: response.timestamp || new Date().toISOString(),
          source: response.source,
          mode: response.mode,
          fallbackReason: response.fallbackReason,
          citations: response.citations,
        },
      ]);
    } catch (error) {
      // A transport failure is distinct from a degraded AI answer, and is
      // reported as such rather than being dressed up as an assistant reply.
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: apiErrorMessage(error) || CONNECTION_ERROR,
          timestamp: new Date().toISOString(),
          source: 'NONE',
          mode: 'UNKNOWN',
        },
      ]);
    } finally {
      inFlightRef.current = false;
    }
  }, [input, isLoading, messages, sendMessage, selectedVehicleId]);

  const renderItem = ({ item }: { item: ChatMessageDto }) => {
    const isUser = item.role === 'user';
    const badge = sourceLabel(item);
    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.aiRow]}>
        {!isUser && (
          <View style={styles.aiIconWrapper}>
            <MaterialCommunityIcons name="robot-outline" size={16} color="#fff" />
          </View>
        )}
        <View style={[styles.bubbleContainer, isUser ? styles.userBubbleContainer : styles.aiBubbleContainer]}>
          <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
            <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.aiMessageText]}>
              {isUser ? item.content : formatAiPlainText(item.content)}
            </Text>
            {!isUser && badge && (
              <View style={styles.sourceRow}>
                <MaterialCommunityIcons
                  name={badge.tone === 'error' ? 'alert-circle-outline' : 'information-outline'}
                  size={12}
                  color={badge.tone === 'error' ? c.danger : c.warningOrange}
                />
                <Text
                  style={[
                    styles.sourceText,
                    { color: badge.tone === 'error' ? c.danger : c.warningOrange },
                  ]}>
                  {badge.text}
                </Text>
              </View>
            )}
            {!isUser && (item.citations?.length ?? 0) > 0 && (
              <View style={styles.citationRow}>
                {item.citations!.slice(0, 4).map((citation) => (
                  <View key={`${citation.type}-${citation.id}-${citation.label}`} style={styles.citation}>
                    <Text style={styles.citationText}>{citation.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.aiTimestamp]}>
            {messageTime(item.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

  const quickPrompts = ['Fleet status', 'Maintenance', 'Alerts', 'Driver scores', 'Fuel report'];

  const QUICK_PROMPT_ICONS: Record<string, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
    'Fleet status': 'chart-bar',
    'Maintenance': 'wrench',
    'Alerts': 'bell-outline',
    'Driver scores': 'star-outline',
    'Fuel report': 'gas-station',
  };

  const bottomPadding = keyboardOpen
    ? spacing.md
    : Math.max(spacing.md, insets.bottom);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 60 : 0}>
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
        <View style={styles.quickContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={quickPrompts}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.quickScrollContent}
            renderItem={({ item }) => (
              <Pressable style={styles.quickChip} onPress={() => setInput(item)}>
                <MaterialCommunityIcons
                  name={QUICK_PROMPT_ICONS[item] || 'help-circle-outline'}
                  size={14}
                  color={c.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.quickChipText}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      <View style={[styles.inputArea, { paddingBottom: bottomPadding }]}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask anything about your fleet..."
            placeholderTextColor={c.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
          />
        </View>

        <Pressable
          style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || isLoading}>
          <MaterialCommunityIcons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.pageBackground },
    messageList: { flex: 1 },
    messageListContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg },
    messageRow: {
      flexDirection: 'row',
      width: '100%',
    },
    userRow: {
      justifyContent: 'flex-end',
    },
    aiRow: {
      justifyContent: 'flex-start',
      gap: spacing.sm,
    },
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
    bubbleContainer: {
      maxWidth: '82%',
      gap: 4,
    },
    userBubbleContainer: {
      alignItems: 'flex-end',
    },
    aiBubbleContainer: {
      alignItems: 'flex-start',
      flex: 1,
    },
    bubble: {
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    userBubble: {
      backgroundColor: c.primary,
      borderBottomRightRadius: 2,
    },
    aiBubble: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderBottomLeftRadius: 2,
    },
    messageText: {
      fontSize: typography.body,
      lineHeight: 21,
    },
    userMessageText: {
      color: '#fff',
    },
    aiMessageText: {
      color: c.textPrimary,
    },
    timestamp: {
      fontSize: 10,
      color: c.textMuted,
    },
    userTimestamp: {
      marginRight: 4,
    },
    aiTimestamp: {
      marginLeft: 4,
    },
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
    sourceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    sourceText: { fontSize: 10, marginLeft: 4, flexShrink: 1 },
    citationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
    citation: {
      backgroundColor: c.pageBackground,
      borderColor: c.border,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    citationText: { color: c.textSecondary, fontSize: 10, fontWeight: '600' },
    quickContainer: {
      paddingVertical: spacing.sm,
      backgroundColor: 'transparent',
    },
    quickScrollContent: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    quickChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
    },
    quickChipText: { color: c.textPrimary, fontSize: typography.caption, fontWeight: '600' },
    inputArea: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      backgroundColor: c.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      gap: spacing.sm,
      alignItems: 'center',
    },
    inputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.pageBackground,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      maxHeight: 120,
    },
    input: {
      flex: 1,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      color: c.textPrimary,
      fontSize: typography.body,
      maxHeight: 100,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: c.border,
      opacity: 0.7,
    },
  });
