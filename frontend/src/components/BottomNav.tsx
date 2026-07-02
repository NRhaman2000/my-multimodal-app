// src/components/BottomNav.tsx
import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/colors';

interface BottomNavProps {
  currentMode: 'text' | 'voice' | 'video';
  setMode: (mode: 'text' | 'voice' | 'video') => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentMode, setMode }) => {
  // Explicitly typing the icon names to match standard Ionicons glyph mapping perfectly
  const navItems: { id: 'text' | 'voice' | 'video'; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { id: 'text', icon: 'chatbubble-ellipses', label: 'Text' },
    { id: 'voice', icon: 'musical-notes', label: 'Voice' },
    { id: 'video', icon: 'videocam', label: 'Video' },
  ];

  return (
    <View style={styles.navBar}>
      {navItems.map((item) => {
        const isActive = currentMode === item.id;
        return (
          <TouchableOpacity 
            key={item.id} 
            style={styles.navItem} 
            onPress={() => setMode(item.id)}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={item.icon} 
              size={22} 
              color={isActive ? COLORS.accentCyan : COLORS.textMuted} 
            />
            <Text style={[styles.label, { color: isActive ? COLORS.text : COLORS.textMuted }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    height: 84,
    backgroundColor: '#0C0C12',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'space-around',
    paddingTop: 10,
  },
  navItem: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    flex: 1 
  },
  label: { 
    fontSize: 12, 
    marginTop: 4, 
    fontWeight: '500' 
  },
});