// src/components/TextMode.tsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}

export const TextMode: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', sender: 'ai', text: 'Hello! How can I help you today?' }
  ]);
  const [inputText, setInputText] = useState<string>('');
  const [isAiStreaming, setIsAiStreaming] = useState<boolean>(false);
  const [isServerConnected, setIsServerConnected] = useState<boolean>(false);
  
  const socketRef = useRef<WebSocket | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const currentAiMessageRef = useRef<string>('');
  const activeStreamingIdRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // --- SELF-HEALING WEBSOCKET INITIALIZER ---
  const initializeWebSocketChannel = () => {
    if (!isMountedRef.current) return;

    // 🚀 CRITICAL: Swapped to your exact verified live Render domain string
    const ws = new WebSocket('wss://my-multimodal-server.onrender.com');
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('💬 Text channel linked to server socket successfully.');
      setIsServerConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'TEXT_TOKEN') {
          currentAiMessageRef.current += data.text;
          
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === activeStreamingIdRef.current 
                ? { ...msg, text: currentAiMessageRef.current } 
                : msg
            )
          );
        }

        if (data.type === 'TEXT_STREAM_COMPLETE') {
          setIsAiStreaming(false); 
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === activeStreamingIdRef.current 
                ? { ...msg, id: `ai_${Date.now()}` } 
                : msg
            )
          );
          activeStreamingIdRef.current = null;
        }
      } catch (err) {
        console.error('Failed to parse text token frame:', err);
      }
    };

    ws.onerror = (e) => {
      console.log('Text socket error intercepted:', e);
    };

    ws.onclose = () => {
      console.log('Text channel disconnected. Triggering background auto-reconnection loop...');
      setIsServerConnected(false);
      setIsAiStreaming(false);
      activeStreamingIdRef.current = null;

      // 🔄 AUTO-RECONNECT: Retries connection after 3 seconds if the view is active
      setTimeout(() => {
        if (isMountedRef.current) {
          initializeWebSocketChannel();
        }
      }, 3000);
    };
  };

  useEffect(() => {
    isMountedRef.current = true;
    initializeWebSocketChannel();

    return () => {
      isMountedRef.current = false;
      if (socketRef.current) socketRef.current.close();
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    };
  }, []);

  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smooth layout autoscroll to follow streaming tokens
  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 60);
  }, [messages]);

  const handleSendMessage = () => {
    if (inputText.trim().length === 0 || isAiStreaming) return;

    const userPrompt = inputText.trim();
    setInputText('');

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: userPrompt,
    };

    // 🚀 NETWORK FAILSAFE GUARD: If cellular drops, display a clean helpful alert bubble
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      const networkErrorMsg: Message = {
        id: `err_${Date.now()}`,
        sender: 'ai',
        text: 'Connecting to server... Your 5G data link or Render instance is warming up. Please try sending your message again in a few seconds.',
      };
      setMessages((prev) => [...prev, userMsg, networkErrorMsg]);
      return;
    }

    const uniqueStreamId = `streaming_${Date.now()}`;
    activeStreamingIdRef.current = uniqueStreamId;
    currentAiMessageRef.current = '';

    const placeholderAiMsg: Message = {
      id: uniqueStreamId,
      sender: 'ai',
      text: '...', 
    };

    setMessages((prev) => [...prev, userMsg, placeholderAiMsg]);
    setIsAiStreaming(true);

    socketRef.current.send(JSON.stringify({
      type: 'TEXT_PROMPT',
      text: userPrompt
    }));
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.rowUser : styles.rowAi]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
          <Text style={styles.messageText}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Network Connectivity Status Ribbon HUD */}
      {!isServerConnected && (
        <View style={styles.connectingRibbon}>
          <Text style={styles.connectingText}>Reconnecting to Cloud Core...</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessageItem}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.inputArea}>
        <View style={styles.inputGlassContainer}>
          <TextInput
            style={styles.textInput}
            placeholder={isServerConnected ? "Type a message..." : "Connecting..."}
            placeholderTextColor="rgba(255, 255, 255, 0.3)"
            value={inputText}
            onChangeText={setInputText}
            multiline
            editable={!isAiStreaming && isServerConnected}
          />
          <TouchableOpacity 
            style={[styles.sendButton, (isAiStreaming || !isServerConnected) && { opacity: 0.3 }]} 
            onPress={handleSendMessage}
            disabled={isAiStreaming || !isServerConnected}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-up-circle" size={32} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090E' },
  connectingRibbon: { backgroundColor: 'rgba(235, 94, 85, 0.15)', paddingVertical: 6, alignItems: 'center', borderBottomWidth: 1, borderColor: 'rgba(235, 94, 85, 0.25)' },
  connectingText: { color: '#EB5E55', fontSize: 12, fontWeight: '500', letterSpacing: 0.5 },
  chatContent: { paddingHorizontal: 20, paddingVertical: 24, flexGrow: 1, justifyContent: 'flex-end' },
  messageRow: { width: '100%', flexDirection: 'row', marginVertical: 6 },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  bubbleUser: { backgroundColor: 'rgba(255, 255, 255, 0.12)', borderBottomRightRadius: 4 },
  bubbleAi: { backgroundColor: 'rgba(19, 19, 26, 0.75)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 16, color: '#FFFFFF', lineHeight: 22 },
  inputArea: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
  inputGlassContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(19, 19, 26, 0.65)', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 16, paddingVertical: 6 },
  textInput: { flex: 1, color: '#FFFFFF', fontSize: 16, maxHeight: 100, paddingTop: 8, paddingBottom: 8 },
  sendButton: { justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
});