// The app's two materials.
// Liquid Glass: on iOS 26 every card and control is a real UIGlassEffect (GlassView): it refracts what's
// behind it, picks up its colour, and interactive pieces light up and flex under the finger. Where the
// API isn't available (older iOS, Android, web) it falls back to a clear blur with a bright rim.
// Frosted: the thicker, softer system materials of earlier iOS (UIBlurEffect), no refraction.
// As in Apple's own apps, only floating chrome (tab bar, buttons, banners, sheets) is made of a material;
// content (cards, grouped lists) is solid on the plain system background (`content`).
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type Look } from '@/theme';

export const nativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

export function Surface({
  children,
  style,
  radius = 26,
  interactive,
  tint,
  strong,
  content,
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
  /** a content card: solid secondary-grouped fill, no material (cards and lists are never glass in iOS) */
  content?: boolean;
  /** show a specific material regardless of the setting (the Appearance previews) */
  look?: Look;
}) {
  const t0 = useTheme();
  const t = look ? { ...t0, look } : t0;
  const shape: ViewStyle = { borderRadius: radius, overflow: 'hidden' };
  if (content) return <View style={[shape, { backgroundColor: t.c.surface }, style]}>{children}</View>;
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

/** The plain system background behind a screen. */
export function Backdrop() {
  const t = useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.c.bg }]} />;
}
