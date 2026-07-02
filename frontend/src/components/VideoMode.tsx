// src/components/VideoMode.tsx
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const VideoMode: React.FC = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [isVisionStreaming, setIsVisionStreaming] = useState<boolean>(false);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  
  const [videoSubtitles, setVideoSubtitles] = useState<string>('System ready. Turn on camera to initialize vision viewport.');
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(0);
  const [isAiReplying, setIsAiReplying] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);
  const cameraRef = useRef<any>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  
  // Thread Locks & Fluid Playback Queues
  const isAiReplyingRef = useRef<boolean>(false);
  const isMicActiveRef = useRef<boolean>(false);
  const isCyclingRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  
  const audioPlaybackQueueRef = useRef<string[]>([]);
  const isMediaChannelPlayingRef = useRef<boolean>(false);
  const currentSoundRef = useRef<Audio.Sound | null>(null);
  
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // VAD Calibrated Thresholds
  const SILENCE_THRESHOLD_DB = -34;
  const SUSTAINED_SPEECH_MS = 200;
  const SILENCE_DURATION_MS = 1000;
  
  const speechStartTimestampRef = useRef<number | null>(null);
  const silenceStartTimestampRef = useRef<number | null>(null);

  useEffect(() => { isAiReplyingRef.current = isAiReplying; }, [isAiReplying]);
  useEffect(() => { isMicActiveRef.current = isMicActive; }, [isMicActive]);

  // --- CONNECT UNIFIED MULTI-MODAL PROXY TUNNEL ---
  useEffect(() => {
    // Locks hardware profile into shared recording/playback capabilities when view initializes
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    }).catch(err => console.log('Audio profile bootstrap initialization skipped:', err));

    // ⚠️ Note: Remember to add your unique Render subdomain suffix here if needed
    const ws = new WebSocket('wss://my-multimodal-server.onrender.com');
    socketRef.current = ws;

    ws.onopen = () => console.log('👁️ Vision network active.');

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'TOKEN_STREAM') {
          if (!isAiReplyingRef.current) {
            isAiReplyingRef.current = true;
            setCurrentWordIndex(0);
            setVideoSubtitles(data.text);
            setIsAiReplying(true);
          } else {
            setVideoSubtitles((prev) => prev + data.text);
          }
        }

        if (data.type === 'AUDIO_PLAYBACK') {
          audioPlaybackQueueRef.current.push(data.audio);
          processAudioPlaybackQueue();
        }

        if (data.type === 'STREAM_COMPLETE') {
          setIsAiReplying(false);
        }
      } catch (err) {
        console.error('Error parsing vision stream frame:', err);
      }
    };

    return () => { 
      ws.close(); 
      teardownAudioHardware();
      stopVisionCaptureLoop();
      stopAllActiveAudioStreams();
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    };
  }, []);

  // --- NATIVE SPEAKERS AUDIO DRIVER LOOP ---
  const processAudioPlaybackQueue = async () => {
    if (isMediaChannelPlayingRef.current) return;

    if (audioPlaybackQueueRef.current.length === 0) {
      if (!isAiReplyingRef.current && isMicActiveRef.current) {
        rearmMicrophoneTracking();
      }
      return;
    }

    const nextBase64Chunk = audioPlaybackQueueRef.current.shift();
    if (!nextBase64Chunk) return;

    isMediaChannelPlayingRef.current = true;

    try {
      const tempAudioUri = `${FileSystem.cacheDirectory}vision_speech_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(tempAudioUri, nextBase64Chunk, {
        encoding: FileSystem.EncodingType.Base64,
      });

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
          processAudioPlaybackQueue();
        }
      });
    } catch (err) {
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
    } catch (e) {}
  };

  // --- AUTOMATED BACKGROUND VISION SAMPLER ---
  const startVisionCaptureLoop = () => {
    stopVisionCaptureLoop();
    visionIntervalRef.current = setInterval(async () => {
      if (cameraRef.current && socketRef.current?.readyState === WebSocket.OPEN && !isMicActiveRef.current && !isAiReplyingRef.current) {
        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.10, 
            base64: true,
            skipProcessing: true
          });

          if (photo?.base64 && !isMicActiveRef.current) {
            socketRef.current.send(JSON.stringify({
              type: 'VISION_FRAME',
              data: photo.base64
            }));
          }
        } catch (err) {}
      }
    }, 5000); 
  };

  const stopVisionCaptureLoop = () => {
    if (visionIntervalRef.current) {
      clearInterval(visionIntervalRef.current);
      visionIntervalRef.current = null;
    }
  };

  // --- MICROPHONE VAD CAPTURE SYSTEM ---
  const handleAudioStatusUpdate = async (status: Audio.RecordingStatus) => {
    if (!status.canRecord || isCyclingRef.current || !isMicActiveRef.current) return;

    const currentVolume = status.metering ?? -160;

    if (currentVolume > SILENCE_THRESHOLD_DB) {
      if (speechStartTimestampRef.current === null) speechStartTimestampRef.current = Date.now();
      const sustainedDuration = Date.now() - speechStartTimestampRef.current;

      if (sustainedDuration >= SUSTAINED_SPEECH_MS) {
        isSpeakingRef.current = true;
        silenceStartTimestampRef.current = null;
      }
    } else {
      speechStartTimestampRef.current = null;
      if (isSpeakingRef.current) {
        if (silenceStartTimestampRef.current === null) {
          silenceStartTimestampRef.current = Date.now();
        } else {
          const elapsedSilence = Date.now() - silenceStartTimestampRef.current;
          if (elapsedSilence >= SILENCE_DURATION_MS) {
            isSpeakingRef.current = false;
            silenceStartTimestampRef.current = null;
            transmitAudioTurnSegment();
          }
        }
      }
    }
  };

  const activateMicrophoneHardware = async () => {
    if (isCyclingRef.current || recordingRef.current) {
      console.log('🎙️ Guard Lock: Recorder already active or preparing. Bailing.');
      return;
    }
    isCyclingRef.current = true;

    try {
      const recordInstance = new Audio.Recording();
      await recordInstance.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      recordInstance.setOnRecordingStatusUpdate(handleAudioStatusUpdate);
      recordingRef.current = recordInstance;
      await recordInstance.startAsync();
    } catch (err) {
      console.error(err);
      recordingRef.current = null;
    } finally { isCyclingRef.current = false; }
  };

  const transmitAudioTurnSegment = async () => {
    if (!recordingRef.current || isCyclingRef.current) return;
    isCyclingRef.current = true;

    try {
      const activeRecord = recordingRef.current;
      recordingRef.current = null;
      await activeRecord.stopAndUnloadAsync();
      const uri = activeRecord.getURI();

      // 🚀 INTEGRATION PHASE INTERRUPT: The user is completely done speaking.
      // Halt historical playback queues right now to parse the new query framework cleanly.
      await stopAllActiveAudioStreams();
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send('SIGNAL:STOP_STREAM');
      }
      setVideoSubtitles('Integrating context matrix maps...');
      setCurrentWordIndex(0);
      setIsAiReplying(false);

      let speechPhotoBase64 = null;
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.2, base64: true, skipProcessing: true }).catch(() => null);
        speechPhotoBase64 = photo?.base64;
      }

      if (uri && socketRef.current?.readyState === WebSocket.OPEN) {
        const base64Audio = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        
        socketRef.current.send(JSON.stringify({
          type: 'AUDIO_CHUNK',
          mimeType: 'audio/m4a',
          data: base64Audio,
          visionContext: speechPhotoBase64
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      isCyclingRef.current = false;
    }
  };

  const rearmMicrophoneTracking = async () => {
    if (!isMicActiveRef.current || isCyclingRef.current || recordingRef.current) {
      console.log('🎙️ Guard Lock: Rearm skipped to prevent resource overlap.');
      return;
    }
    isCyclingRef.current = true;

    try {
      const freshInstance = new Audio.Recording();
      await freshInstance.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      freshInstance.setOnRecordingStatusUpdate(handleAudioStatusUpdate);
      recordingRef.current = freshInstance;
      
      isSpeakingRef.current = false;
      silenceStartTimestampRef.current = null;
      speechStartTimestampRef.current = null;
      await freshInstance.startAsync();
    } catch (e) {
      recordingRef.current = null;
    } finally { isCyclingRef.current = false; }
  };

  const teardownAudioHardware = async () => {
    try {
      if (recordingRef.current) {
        const activeRecordToUnload = recordingRef.current;
        recordingRef.current = null;
        await activeRecordToUnload.stopAndUnloadAsync().catch(() => {});
      }
    } catch (e) {}
  };

  // --- KINETIC HIGHLIGHT TYPOGRAPHY ENGINE ---
  const wordsArray = videoSubtitles.split(' ').filter(word => word.trim() !== '');

  useEffect(() => {
    if (wordsArray.length > currentWordIndex && wordsArray.length > 0) {
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
      
      playbackTimerRef.current = setTimeout(() => {
        setCurrentWordIndex((prev) => {
          const nextIndex = prev + 1;
          scrollViewRef.current?.scrollToEnd({ animated: true });
          return nextIndex;
        });
      }, 340); 
    }
  }, [videoSubtitles, currentWordIndex, wordsArray.length]);

  const toggleVisionStream = () => {
    if (!isVisionStreaming) {
      setVideoSubtitles(''); 
      setCurrentWordIndex(0);
      startVisionCaptureLoop();
    } else {
      stopVisionCaptureLoop();
      
      setIsMicActive(false);
      isMicActiveRef.current = false;
      teardownAudioHardware();
      stopAllActiveAudioStreams();
      
      setVideoSubtitles('System ready. Turn on camera to initialize vision viewport.');
      setCurrentWordIndex(0);
    }
    setIsVisionStreaming((prev) => !prev);
  };

  const toggleMicChannel = () => {
    if (!isVisionStreaming) return; 
    
    const nextState = !isMicActive;
    setIsMicActive(nextState);
    if (nextState) {
      // 🚀 FIXED: Removed stopAllActiveAudioStreams() and flag resets from here.
      // The AI audio keeps outputting out loud while the mic launches concurrently.
      activateMicrophoneHardware();
    } else {
      teardownAudioHardware();
    }
  };

  if (!permission) return <View style={styles.darkContainer}><Text style={styles.fallbackText}>Warming up subsystems...</Text></View>;
  if (!permission.granted) {
    return (
      <View style={styles.darkContainer}>
        <Text style={styles.permissionRequiredText}>Camera permission is required to process vision contexts.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}><Text style={styles.permissionButtonText}>Allow Camera Access</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isVisionStreaming ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back">
          <View style={styles.lensVignetteOverlay} />
        </CameraView>
      ) : (
        <View style={styles.idleViewport}>
          <View style={styles.radarRing}><Ionicons name="aperture" size={48} color="rgba(255, 255, 255, 0.12)" /></View>
          <Text style={styles.idleStatusText}>Vision Sensor Standby Mode</Text>
        </View>
      )}

      {videoSubtitles.length > 0 && (
        <View style={styles.floatingSubtitleContainer}>
          <View style={styles.magicalSubCard}>
            <ScrollView ref={scrollViewRef} style={{ maxHeight: 110 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.magicalText}>
                {wordsArray.map((word, index) => {
                  const isStandby = !isVisionStreaming;
                  const isPast = index < currentWordIndex;
                  const isCurrent = index === currentWordIndex;

                  return (
                    <Text
                      key={index}
                      style={[
                        styles.wordBase,
                        isStandby ? styles.wordCurrent : (isPast && styles.wordPast),
                        isCurrent && styles.wordCurrent,
                      ]}
                    >
                      {word}{' '}
                    </Text>
                  );
                })}
              </Text>
            </ScrollView>
          </View>
        </View>
      )}

      <View style={styles.actionOverlay}>
        <View style={styles.controlsRow}>
          <TouchableOpacity 
            style={[
              styles.hudButton, 
              isMicActive && styles.micActiveButton,
              !isVisionStreaming && { opacity: 0.15 } 
            ]} 
            onPress={toggleMicChannel}
            disabled={!isVisionStreaming} 
            activeOpacity={0.8}
          >
            <Ionicons name={isMicActive ? "mic" : "mic-off"} size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.hudButton, isVisionStreaming && styles.streamActiveButton]} 
            onPress={toggleVisionStream}
            activeOpacity={0.8}
          >
            <Ionicons name={isVisionStreaming ? "videocam" : "videocam-off"} size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090E' },
  darkContainer: { flex: 1, backgroundColor: '#09090E', justifyContent: 'center', alignItems: 'center' },
  lensVignetteOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.15)' },
  fallbackText: { color: 'rgba(255, 255, 255, 0.4)', fontSize: 14 },
  permissionRequiredText: { color: 'rgba(255, 255, 255, 0.5)', fontSize: 15, marginBottom: 20, textAlign: 'center', width: '75%' },
  permissionButton: { backgroundColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
  permissionButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  idleViewport: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  radarRing: { width: 100, height: 100, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.04)', backgroundColor: 'rgba(255, 255, 255, 0.01)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  idleStatusText: { color: 'rgba(255, 255, 255, 0.25)', fontSize: 14 },
  floatingSubtitleContainer: { position: 'absolute', bottom: 140, width: '100%', alignItems: 'center', paddingHorizontal: 24 },
  magicalSubCard: { backgroundColor: 'rgba(9, 9, 14, 0.55)', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)', maxWidth: SCREEN_WIDTH * 0.88, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  magicalText: { textAlign: 'center', lineHeight: 24 },
  wordBase: { fontSize: 16, color: 'rgba(255, 255, 255, 0.25)', fontWeight: '400' },
  wordPast: { color: 'rgba(255, 255, 255, 0.65)', textShadowColor: 'rgba(0, 0, 0, 0.8)', textShadowRadius: 4 },
  wordCurrent: { color: '#FFFFFF', fontWeight: '700', textShadowColor: 'rgba(157, 78, 221, 0.8)', textShadowRadius: 8 },
  actionOverlay: { position: 'absolute', bottom: 45, width: '100%', alignItems: 'center' },
  controlsRow: { flexDirection: 'row', backgroundColor: 'rgba(19, 19, 26, 0.75)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 32, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', gap: 20 },
  hudButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', justifyContent: 'center', alignItems: 'center' },
  micActiveButton: { backgroundColor: 'rgba(58, 134, 255, 0.25)', borderColor: 'rgba(58, 134, 255, 0.4)' },
  streamActiveButton: { backgroundColor: 'rgba(235, 94, 85, 0.25)', borderColor: 'rgba(235, 94, 85, 0.4)' }
});