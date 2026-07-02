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
import { COLORS } from '../theme/colors';

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
  
  const socketRef = useRef<WebSocket | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const currentAiMessageRef = useRef<string>('');

  // --- CONNECT TO YOUR ACTIVE BACKEND ROUTER ---
  useEffect(() => {
    // 🚀 Uses your exact active Ngrok tunnel link
    const ws = new WebSocket('wss://my-multimodal-server.onrender.com');
    socketRef.current = ws;

    ws.onopen = () => console.log('💬 Text channel linked to server socket successfully.');

    ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);

    // 🚀 THE FIX: Use an explicit .map() iterator to guarantee clean state redraws
    if (data.type === 'TEXT_TOKEN') {
      currentAiMessageRef.current += data.text;
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === 'streaming_id' 
            ? { ...msg, text: currentAiMessageRef.current } 
            : msg
        )
      );
    }

    if (data.type === 'TEXT_STREAM_COMPLETE') {
      setIsAiStreaming(false); // 🔓 Unlocks your text box instantly
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === 'streaming_id' 
            ? { ...msg, id: `ai_${Date.now()}` } 
            : msg
        )
      );
    }
  } catch (err) {
    console.error('Failed to parse text token frame:', err);
  }
};

// 🛡️ SAFETY NET: If the socket throws an error, don't lock the user out forever
ws.onerror = (e) => {
  console.error('Text socket failure:', e);
  setIsAiStreaming(false); 
};

    ws.onerror = (e) => console.error('Text socket failure:', e);
    ws.onclose = () => console.log('Text channel closed.');

    return () => { ws.close(); };
  }, []);

  // Smooth layout autoscroll to follow streaming tokens
  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 60);
  }, [messages]);

  const handleSendMessage = () => {
    if (inputText.trim().length === 0 || isAiStreaming) return;

    const userPrompt = inputText.trim();
    setInputText('');

    // 1. Push user message bubble to view array
    const userMsg: Message = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: userPrompt,
    };

    // 2. Prep an empty AI response bubble to stream tokens into
    currentAiMessageRef.current = '';
    const placeholderAiMsg: Message = {
      id: 'streaming_id',
      sender: 'ai',
      text: '...', // Clean loader state while server processes initial generation
    };

    setMessages((prev) => [...prev, userMsg, placeholderAiMsg]);
    setIsAiStreaming(true);

    // 3. Dispatch raw prompt vector across your secure Ngrok tunnel socket
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'TEXT_PROMPT',
        text: userPrompt
      }));
    }
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
            placeholder="Type a message..."
            placeholderTextColor="rgba(255, 255, 255, 0.3)"
            value={inputText}
            onChangeText={setInputText}
            multiline
            editable={!isAiStreaming}
          />
          <TouchableOpacity 
            style={[styles.sendButton, isAiStreaming && { opacity: 0.3 }]} 
            onPress={handleSendMessage}
            disabled={isAiStreaming}
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