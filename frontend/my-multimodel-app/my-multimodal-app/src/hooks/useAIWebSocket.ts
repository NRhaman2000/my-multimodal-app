// src/hooks/useAIWebSocket.ts
import { useState, useEffect, useRef } from 'react';

export const useAIWebSocket = (mode: 'text' | 'voice' | 'video') => {
  const [subtitles, setSubtitles] = useState<string>('');
  const [isAiReplying, setIsAiReplying] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const SERVER_URL = 'ws://10.0.0.246:5001';
    console.log(`🔌 Attempting link to backend orchestrator: ${SERVER_URL}`);
    
    const ws = new WebSocket(SERVER_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('✅ iPhone successfully established network socket handshake.');
    };

    ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        if (packet.type === 'TOKEN_STREAM') {
          setIsAiReplying(true);
          setSubtitles((prev) => prev + packet.text);
        } 
        if (packet.type === 'STREAM_COMPLETE') {
          setIsAiReplying(false);
        }
      } catch (err) {
        setSubtitles(event.data);
      }
    };

    ws.onerror = (e) => {
      console.log('❌ WebSocket connection error: ', e);
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket disconnected from Mac server.');
    };

    return () => {
      ws.close();
    };
  }, [mode]);

  // DEFENSIVE TRANSMISSION GATEWAY
  const sendVoiceChunk = (textOrBlob: string) => {
    setSubtitles('');
    setIsAiReplying(false);
    
    if (socketRef.current) {
      // 1 represents standard WebSocket.OPEN across all platforms
      if (socketRef.current.readyState === 1) {
        socketRef.current.send(textOrBlob);
      } else {
        console.log(`⚠️ Cannot transmit: Socket is not ready. Current state index: ${socketRef.current.readyState}`);
      }
    } else {
      console.log('⚠️ Cannot transmit: No active socket instance found.');
    }
  };

  const triggerMockAiResponse = () => {};

  return { 
    subtitles, 
    isAiReplying, 
    sendVoiceChunk, 
    triggerMockAiResponse, 
    setSubtitles, 
    setIsAiReplying 
  };
};