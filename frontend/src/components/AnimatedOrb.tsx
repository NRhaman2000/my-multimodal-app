// src/components/AnimatedOrb.tsx
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../theme/colors';

interface AnimatedOrbProps {
  isAiReplying: boolean;
}

export const AnimatedOrb: React.FC<AnimatedOrbProps> = ({ isAiReplying }) => {
  // Infinite background time tracks (Never reset, eliminating motion breaking)
  const timeDriver1 = useRef(new Animated.Value(0)).current;
  const timeDriver2 = useRef(new Animated.Value(0)).current;
  const timeDriver3 = useRef(new Animated.Value(0)).current;

  // Momentum driver to transition states gradually and smoothly
  const momentumIntensity = useRef(new Animated.Value(0)).current;

  // 1. STATE TRANSITION: Smoothly glide momentum intensity up and down
  useEffect(() => {
    Animated.timing(momentumIntensity, {
      toValue: isAiReplying ? 1 : 0,
      duration: isAiReplying ? 350 : 1500, // 1.5 seconds of gradual, elegant decay back to idle size
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isAiReplying]);

  // 2. LIFECYCLE CLOCKS: Fire infinite linear loops once on mount (Zero stutters)
  useEffect(() => {
    Animated.parallel([
      Animated.loop(Animated.timing(timeDriver1, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.timing(timeDriver2, { toValue: 1, duration: 4600, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.timing(timeDriver3, { toValue: 1, duration: 2500, easing: Easing.linear, useNativeDriver: true })),
    ]).start();
  }, []);

  // --- FLUID MOTION INTERPOLATION MAPS ---
  const spin1 = timeDriver1.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spin2 = timeDriver2.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const spin3 = timeDriver3.interpolate({ inputRange: [0, 1], outputRange: ['135deg', '495deg'] });

  // Continuous background morph loops
  const waveX1 = timeDriver1.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.6, 1] });
  const waveY1 = timeDriver1.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.1, 0.6] });

  const waveX2 = timeDriver2.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1.1, 0.5] });
  const waveY2 = timeDriver2.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.1, 0.5, 1.1] });

  // --- GRADUAL MOMENTUM COUPLING MAPS ---
  // Smoothly grows the overall scale from 1.02 (idle) to 1.14 (replying)
  const globalScale = momentumIntensity.interpolate({
    inputRange: [0, 1],
    outputRange: [1.02, 1.14],
  });

  // Smoothly modulates internal layer opacity to make active waves look faster/brighter
  const layer2Opacity = momentumIntensity.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] });
  const layer3Opacity = momentumIntensity.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.75] });

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: globalScale }] }]}>
      {/* Master Specular Housing Sphere */}
      <View style={styles.glassSphere}>
        
        {/* RIBBON 1: Base Magenta Fluid Mass */}
        <Animated.View style={[styles.ribbonLayer, { transform: [{ rotate: spin1 }, { scaleX: waveX1 }, { scaleY: waveY1 }] }]}>
          <LinearGradient
            colors={['#DB2777', 'transparent', '#7C3AED']}
            style={styles.gradientFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* RIBBON 2: Electric Cyan Dynamic Veil (Grows brighter/more vibrant with momentum) */}
        <Animated.View 
          style={[
            styles.ribbonLayer, 
            { opacity: layer2Opacity, transform: [{ rotate: spin2 }, { scaleX: waveX2 }, { scaleY: waveY2 }] }
          ]}
        >
          <LinearGradient
            colors={['transparent', '#3E8E9E', 'transparent', '#1E3A8A']}
            locations={[0.0, 0.45, 0.65, 1.0]}
            style={styles.gradientFill}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
        </Animated.View>

        {/* RIBBON 3: Royal Violet Interlocking Accent */}
        <Animated.View 
          style={[
            styles.ribbonLayer, 
            { opacity: layer3Opacity, transform: [{ rotate: spin3 }] }
          ]}
        >
          <LinearGradient
            colors={['#B47EB4', 'transparent', 'rgba(62, 142, 158, 0.45)']}
            style={styles.gradientFill}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </Animated.View>

        {/* Volumetric Central Shadow Core */}
        <View style={styles.centerDepthFilter} />
        
        {/* Curvature Rim Highlight Overlay */}
        <View style={styles.glassSpecularShine} />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 280,
    height: 280,
  },
  glassSphere: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#050508',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  ribbonLayer: {
    position: 'absolute',
    width: 216,
    height: 216,
    borderRadius: 108,
    opacity: 0.85,
  },
  gradientFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 108,
  },
  centerDepthFilter: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: '#050508',
    position: 'absolute',
    opacity: 0.15,
  },
  glassSpecularShine: {
    position: 'absolute',
    top: 5,
    left: 35,
    width: 160,
    height: 44,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    transform: [{ rotate: '-13deg' }],
  },
});