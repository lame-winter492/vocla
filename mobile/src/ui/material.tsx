// The app's two materials.
// Liquid Glass: on iOS 26 every card and control is a real UIGlassEffect (GlassView): it refracts what's
// behind it, picks up its colour, and interactive pieces light up and flex under the finger. Where the
// API isn't available (older iOS, Android, web) it falls back to a clear blur with a bright rim.
// Frosted: the thicker, softer system materials of earlier iOS (UIBlurEffect), no refraction.
// Both sit on a Backdrop of soft coloured light, so the material always has something to bend or blur.
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme, type Look } from '@/theme';

export const nativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

export function Surface({
  children,
  style,
  radius = 26,
  interactive,
  tint,
  strong,
  look,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** lights up and flexes under the finger (Liquid Glass) */
  interactive?: boolean;
  /** tinted glass, e.g. the accent colour for a prominent button */
  tint?: ColorValue;
  /** a thicker material for content that must stay readable (cards, sheets) */
  strong?: boolean;
  /** show a specific material regardless of the setting (the Appearance previews) */
  look?: Look;
}) {
  const t0 = useTheme();
  const t = look ? { ...t0, look } : t0;
  const shape: ViewStyle = { borderRadius: radius, overflow: 'hidden' };
  if (t.look === 'liquid' && nativeGlass) {
    return (
      <GlassView glassEffectStyle={strong ? 'regular' : 'clear'} isInteractive={interactive} tintColor={tint} colorScheme="auto" style={[shape, style]}>
        {children}
      </GlassView>
    );
  }
  const liquid = t.look === 'liquid';
  const tinted = tint !== undefined;
  return (
    <View
      style={[
        shape,
        {
          borderWidth: StyleSheet.hairlineWidth,
          // glass has a bright specular rim; frost a soft edge
          borderColor: liquid ? (t.dark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)') : t.dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)',
          backgroundColor: tinted ? (tint as string) : 'transparent',
        },
        style,
      ]}
    >
      {tinted ? null : (
        <BlurView
          intensity={liquid ? (strong ? 50 : 30) : strong ? 90 : 70}
          tint={
            liquid
              ? t.dark
                ? 'systemUltraThinMaterialDark'
                : 'systemUltraThinMaterialLight'
              : t.dark
                ? strong
                  ? 'systemThickMaterialDark'
                  : 'systemMaterialDark'
                : strong
                  ? 'systemThickMaterialLight'
                  : 'systemMaterialLight'
          }
          blurMethod="dimezisBlurViewSdk31Plus"
          style={StyleSheet.absoluteFill}
        />
      )}
      {liquid && !tinted ? (
        // the light catching the top edge of the glass
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderTopWidth: 1, borderTopColor: t.dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)', backgroundColor: t.dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.28)' }]} />
      ) : null}
      {children}
    </View>
  );
}

/** Soft coloured light behind a screen (fixed while content scrolls over it). */
export function Backdrop() {
  const t = useTheme();
  const [a, b, c] = t.c.glow;
  const o = t.dark ? 0.9 : 0.75;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.c.bg }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="g1" cx="12%" cy="8%" r="65%">
            <Stop offset="0" stopColor={a} stopOpacity={o} />
            <Stop offset="1" stopColor={a} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="g2" cx="95%" cy="42%" r="60%">
            <Stop offset="0" stopColor={b} stopOpacity={o} />
            <Stop offset="1" stopColor={b} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="g3" cx="20%" cy="92%" r="60%">
            <Stop offset="0" stopColor={c} stopOpacity={o} />
            <Stop offset="1" stopColor={c} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#g1)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#g2)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#g3)" />
      </Svg>
    </View>
  );
}
