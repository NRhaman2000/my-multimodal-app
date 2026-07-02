// src/components/VoiceMode.tsx
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { AnimatedOrb } from './AnimatedOrb';
import { COLORS } from '../theme/colors';

export const VoiceMode: React.FC = () => {
  const [isAmbientMicArmed, setIsAmbientMicArmed] = useState<boolean>(false);
  const [subtitles, setSubtitles] = useState<string>('');
  const [isAiReplying, setIsAiReplying] = useState<boolean>(false);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const currentSoundRef = useRef<Audio.Sound | null>(null);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalContentHeightRef = useRef<number>(0);
  const containerHeightRef = useRef<number>(150);
  const isUserInteractingRef = useRef<boolean>(false);

  // --- AUDIO MUTABLE CONFIG REFS ---
  const isAiReplyingRef = useRef<boolean>(false);
  const isAmbientMicArmedRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const silenceStartTimestampRef = useRef<number | null>(null);
  const isCyclingRef = useRef<boolean>(false); 
  const speechStartTimestampRef = useRef<number | null>(null);

  // --- AUDIO TRACK PLAYBACK QUEUE REFS ---
  const audioPlaybackQueueRef = useRef<string[]>([]);
  const isMediaChannelPlayingRef = useRef<boolean>(false);

  // --- CALIBRATED NOISE THRESHOLDS ---
  const SILENCE_THRESHOLD_DB = -34; 
  const SUSTAINED_SPEECH_MS = 200; 
  const SILENCE_DURATION_MS = 1000;  

  useEffect(() => { isAiReplyingRef.current = isAiReplying; }, [isAiReplying]);
  useEffect(() => { isAmbientMicArmedRef.current = isAmbientMicArmed; }, [isAmbientMicArmed]);

  // --- HIGH-SPEED WEBSOCKET CORE LAYER ---
  useEffect(() => {
  // 🚀 Placed your exact live ngrok address here with the wss protocol
  const ws = new WebSocket('wss://my-multimodal-server.onrender.com'); 
  socketRef.current = ws;

  ws.onopen = () => console.log('🔌 Bridge Link initialized securely to server socket.');
    
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

if (data.type === 'TOKEN_STREAM') {
  // 🚀 THE FIX: Check the ref gate
  if (!isAiReplyingRef.current) {
    isAiReplyingRef.current = true; // 🔒 LOCK IMMEDIATELY so the next token drops into the append loop
    setCurrentWordIndex(0);
    setSubtitles(data.text); // Captures the first word cleanly (e.g., "Hello")
    setIsAiReplying(true);
  } else {
    // All subsequent tokens stream and append behind it perfectly
    setSubtitles((prev) => prev + data.text);
  }
}

        if (data.type === 'AUDIO_PLAYBACK') {
          // Push binary Base64 audio track directly to execution array queue
          audioPlaybackQueueRef.current.push(data.audio);
          processAudioPlaybackQueue();
        }

        if (data.type === 'STREAM_COMPLETE') {
          setIsAiReplying(false);
          checkAndResumeListening();
        }
      } catch (err) {
        console.error('Error reading packet message frame data:', err);
      }
    };

    ws.onerror = (e) => console.error('Socket channel failure caught:', e);
    ws.onclose = () => console.log('Socket link channel severed.');

    return () => { ws.close(); };
  }, []);

  const wordsArray = subtitles.split(' ').filter(word => word.trim() !== '');

  const scrollToActiveWord = (wordIndex: number) => {
    if (!isUserInteractingRef.current && totalContentHeightRef.current > containerHeightRef.current) {
      const readingProgress = wordsArray.length > 0 ? wordIndex / wordsArray.length : 0;
      const targetScrollY = Math.max(0, (readingProgress * totalContentHeightRef.current) - (containerHeightRef.current / 2));
      scrollViewRef.current?.scrollTo({ y: targetScrollY, animated: true });
    }
  };

  // Highlight Text Synchronization Loop
  // src/components/VoiceMode.tsx (~Line 52)
// Kinetic Typography Highlight Word Loop
useEffect(() => {
  if (wordsArray.length > currentWordIndex) {
    if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    
    playbackTimerRef.current = setTimeout(() => {
      setCurrentWordIndex((prev) => {
        const nextIndex = prev + 1;
        scrollToActiveWord(nextIndex);
        return nextIndex;
      });
    }, 380); // 🚀 CALIBRATION: Changed from 260ms to 380ms to match real human vocal pacing
  }
  // 🛠️ REMOVED THE WIPING BLOCK: Text now stays securely on screen 
  // so you can actually read it while the AI finishes speaking!
  
  return () => { if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current); };
}, [subtitles, currentWordIndex, wordsArray.length]);

  // --- SERVER-SIDE AUDIO FILE PLAYBACK PIPELINE ---
  const processAudioPlaybackQueue = async () => {
    if (isMediaChannelPlayingRef.current) return;

    if (audioPlaybackQueueRef.current.length === 0) {
      if (!isAiReplyingRef.current) {
        console.log('🏁 Audio playback queue completely drained. Triggering microphone check...');
        checkAndResumeListening();
      }
      return;
    }

    // 🚀 THE FIX: Add this line back to extract the audio block before using it below
    const nextBase64Chunk = audioPlaybackQueueRef.current.shift();
    if (!nextBase64Chunk) return;

    isMediaChannelPlayingRef.current = true;

    try {
      // 💾 Map file array to phone runtime disk storage cache paths
      const tempAudioUri = `${FileSystem.cacheDirectory}ai_speech_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(tempAudioUri, nextBase64Chunk, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Fire uncompressed native media components directly through outer loudspeaker drivers
      const { sound } = await Audio.Sound.createAsync(
        { uri: tempAudioUri },
        { shouldPlay: true, volume: 1.0 }
      );

      currentSoundRef.current = sound;

      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.isLoaded && status.didJustFinish) {
          await sound.unloadAsync();
          currentSoundRef.current = null;
          isMediaChannelPlayingRef.current = false;
          // Loop progression to read next audio asset block
          processAudioPlaybackQueue();
        }
      });
    } catch (audioError) {
      console.error('Loudspeaker playback tracking crashed:', audioError);
      isMediaChannelPlayingRef.current = false;
      processAudioPlaybackQueue();
    }
  };

  const stopAllActiveAudioStreams = async () => {
    try {
      if (currentSoundRef.current) {
        await currentSoundRef.current.stopAsync();
        await currentSoundRef.current.unloadAsync();
        currentSoundRef.current = null;
      }
      audioPlaybackQueueRef.current = [];
      isMediaChannelPlayingRef.current = false;
    } catch (e) {
      console.log('Error purging active media playback links.');
    }
  };

  const checkAndResumeListening = async () => {
    if (isCyclingRef.current) return;

    if (!isAiReplyingRef.current && !isMediaChannelPlayingRef.current && audioPlaybackQueueRef.current.length === 0) {
      if (isAmbientMicArmedRef.current) {
        console.log('🔄 All voice elements finished playback. Re-arming ambient listening radar...');
        await cycleNextRecordingSegment();
      } else {
        await emergencyTeardown();
      }
    }
  };

  const emergencyTeardown = async () => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    } catch (e) {
      console.log('Teardown finalized successfully.');
    }
  };

  // VAD Volume Evaluation Loop
  const handleRecordingStatusUpdate = async (status: Audio.RecordingStatus) => {
    if (!status.canRecord || isCyclingRef.current || !isAmbientMicArmedRef.current) return;

    const currentVolume = status.metering ?? -160;

    if (currentVolume > SILENCE_THRESHOLD_DB) {
      if (speechStartTimestampRef.current === null) {
        speechStartTimestampRef.current = Date.now();
      }

      const soundSustainedDuration = Date.now() - speechStartTimestampRef.current;

      if (soundSustainedDuration >= SUSTAINED_SPEECH_MS) {
        // BARGE-IN INTERRUPTION GATE
        if (isAiReplyingRef.current || isMediaChannelPlayingRef.current) {
          console.log('🛑 BARGE-IN DETECTED: Severing audio tracks and clearing queues...');
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send('SIGNAL:STOP_STREAM');
          }
          await stopAllActiveAudioStreams();
          setSubtitles('');
          setCurrentWordIndex(0);
          setIsAiReplying(false);
          
          await cycleNextRecordingSegment();
          return;
        }

        isSpeakingRef.current = true;
        silenceStartTimestampRef.current = null;
      }
    } else {
      speechStartTimestampRef.current = null;

      if (isSpeakingRef.current) {
        if (silenceStartTimestampRef.current === null) {
          silenceStartTimestampRef.current = Date.now();
        } else {
          const silenceElapsed = Date.now() - silenceStartTimestampRef.current;
          
          if (silenceElapsed >= SILENCE_DURATION_MS && !isAiReplyingRef.current) {
            isSpeakingRef.current = false;
            silenceStartTimestampRef.current = null;
            processAndTransmitSegment();
          }
        }
      }
    }
  };

  const startAmbientListening = async () => {
    if (isCyclingRef.current) return;
    isCyclingRef.current = true;

    try {
      isAiReplyingRef.current = false;
      setIsAiReplying(false);
      setSubtitles('');
      setCurrentWordIndex(0);
      await stopAllActiveAudioStreams();
      isSpeakingRef.current = false;
      silenceStartTimestampRef.current = null;
      speechStartTimestampRef.current = null;

      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        alert('Microphone recording permissions are required.');
        isCyclingRef.current = false;
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const recordingInstance = new Audio.Recording();
      await recordingInstance.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      recordingInstance.setOnRecordingStatusUpdate(handleRecordingStatusUpdate);
      recordingRef.current = recordingInstance;
      
      setIsAmbientMicArmed(true);
      isAmbientMicArmedRef.current = true;
      
      await recordingInstance.startAsync();
      console.log('🟢 Ambient voice detection scanning active.');
    } catch (error) {
      console.error('Failed to open ambient input streams:', error);
      setIsAmbientMicArmed(false);
      isAmbientMicArmedRef.current = false;
    } finally {
      isCyclingRef.current = false;
    }
  };

  const processAndTransmitSegment = async () => {
    if (!recordingRef.current || isCyclingRef.current) return;
    isCyclingRef.current = true;

    try {
      const activeRecording = recordingRef.current;
      recordingRef.current = null;

      await activeRecording.stopAndUnloadAsync();
      const uri = activeRecording.getURI();

      // Deactivate recording access right now to safely hand the sound card to playback modules
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      setTimeout(async () => {
        try {
          if (uri && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            const base64AudioData = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            const payload = JSON.stringify({ type: 'AUDIO_CHUNK', mimeType: 'audio/m4a', data: base64AudioData });
            
            console.log('📤 Delivering voice vector to server framework.');
            socketRef.current.send(payload);
          }
        } catch (innerError) {
          console.error('Error preparing base64 audio string:', innerError);
        } finally {
          isCyclingRef.current = false;
        }
      }, 300);

    } catch (error) {
      console.error('Error closing capturing window segments:', error);
      isCyclingRef.current = false;
    }
  };

  const cycleNextRecordingSegment = async () => {
    if (isCyclingRef.current) return;
    isCyclingRef.current = true;

    try {

      isAiReplyingRef.current = false;
      setIsAiReplying(false);

      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const nextRecordingInstance = new Audio.Recording();
      await nextRecordingInstance.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true
      });

      nextRecordingInstance.setOnRecordingStatusUpdate(handleRecordingStatusUpdate);
      recordingRef.current = nextRecordingInstance;
      
      isSpeakingRef.current = false;
      silenceStartTimestampRef.current = null;
      speechStartTimestampRef.current = null;

      await nextRecordingInstance.startAsync();
      console.log('🔄 Microphone armed. Listening for voice elements...');
    } catch (err) {
      console.error('❌ Error cycling next capturing loop window:', err);
    } finally {
      isCyclingRef.current = false;
    }
  };

  const handleMasterToggle = () => {
    if (!isAmbientMicArmed) {
      startAmbientListening();
    } else {
      console.log('🔴 Master Disarm: Deactivating microphone arrays.');
      setIsAmbientMicArmed(false);
      isAmbientMicArmedRef.current = false;
      
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }

      // If fully idle, execute physical hardware teardown right away
      if (!isAiReplyingRef.current && !isMediaChannelPlayingRef.current && audioPlaybackQueueRef.current.length === 0) {
        emergencyTeardown();
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.orbContainer}>
        <AnimatedOrb isAiReplying={isAiReplying} />
      </View>

      <View style={styles.subtitleWrapper}>
        {wordsArray.length > 0 ? (
          <View style={styles.subtitleGlassCard} onLayout={(e) => { containerHeightRef.current = e.nativeEvent.layout.height; }}>
            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              onScrollBeginDrag={() => { isUserInteractingRef.current = true; }}
              onScrollEndDrag={() => { setTimeout(() => { isUserInteractingRef.current = false; }, 2500); }}
              onContentSizeChange={(w, h) => { totalContentHeightRef.current = h; }}
              scrollEventThrottle={16}
            >
              <Text style={styles.textContainer}>
                {wordsArray.map((word, index) => (
                  <Text
                    key={index}
                    style={[
                      styles.wordBase,
                      index < currentWordIndex && styles.wordPast,
                      index === currentWordIndex && styles.wordCurrent,
                    ]}
                  >
                    {word}{' '}
                  </Text>
                ))}
              </Text>
            </ScrollView>
          </View>
        ) : (
          <Text style={styles.statusText}>
            {isAmbientMicArmed ? "Listening hands-free... speak naturally" : "System off. Tap mic to arm ambient mode"}
          </Text>
        )}
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity 
          style={[styles.micButton, { backgroundColor: isAmbientMicArmed ? COLORS.micActive : COLORS.micInactive }]} 
          onPress={handleMasterToggle}
          activeOpacity={0.8}
        >
          <Ionicons name={isAmbientMicArmed ? "mic" : "mic-off"} size={28} color={COLORS.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center' },
  orbContainer: { flex: 2, justifyContent: 'center', alignItems: 'center' },
  subtitleWrapper: { flex: 1.2, width: '85%', alignItems: 'center', justifyContent: 'flex-start' },
  subtitleGlassCard: { backgroundColor: 'rgba(19, 19, 26, 0.65)', paddingHorizontal: 22, paddingVertical: 18, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', maxHeight: 150, width: '100%' },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-start' },
  textContainer: { textAlign: 'center', lineHeight: 28 },
  wordBase: { fontSize: 17, color: 'rgba(255, 255, 255, 0.22)', fontWeight: '400' },
  wordPast: { color: 'rgba(255, 255, 255, 0.65)', fontWeight: '400' },
  wordCurrent: { color: '#FFFFFF', fontWeight: '700', textShadowColor: 'rgba(255, 255, 255, 0.6)', textShadowRadius: 6 },
  statusText: { color: COLORS.textMuted, fontSize: 15, letterSpacing: 0.5 },
  controlsContainer: { marginBottom: 50, justifyContent: 'center' },
  micButton: { width: 74, height: 74, borderRadius: 37, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
});