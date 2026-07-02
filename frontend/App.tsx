// App.tsx
import './src/polyfill';

import React, { useState } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar } from 'react-native';
import { TextMode } from './src/components/TextMode';
import { VoiceMode } from './src/components/VoiceMode';
import { VideoMode } from './src/components/VideoMode';
import { BottomNav } from './src/components/BottomNav';
import { COLORS } from './src/theme/colors';

export default function App() {
  const [activeMode, setActiveMode] = useState<'text' | 'voice' | 'video'>('text');

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      <SafeAreaView style={styles.container}>
        <View style={styles.contentView}>
          {/* Key properties force complete layout unmounting/reset to guarantee total silence on switch */}
          {activeMode === 'text' && <TextMode key="text-screen" />}
          {activeMode === 'voice' && <VoiceMode key="voice-screen" />}
          {activeMode === 'video' && <VideoMode key="video-screen" />}
        </View>
      </SafeAreaView>

      <BottomNav currentMode={activeMode} setMode={setActiveMode} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  contentView: { flex: 1, backgroundColor: COLORS.background },
});