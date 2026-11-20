// Small animated pieces: rolling digits, progress rings, Liquid Glass circle buttons.
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  FadeOutUp,
  LayoutAnimationConfig,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme';
import { PressScale } from './kit';

/** Digits roll up (count grew) or down (count shrank), like iOS's numeric text transition. */
export function RollingNumber({ value, style }: { value: number; style?: StyleProp<TextStyle> }) {
  // remember the last value and which way it moved (React's "adjust state while rendering" pattern)
  const [last, setLast] = useState({ value, up: true });
  if (last.value !== value) setLast({ value, up: value >= last.value });
  const up = last.value !== value ? value >= last.value : last.up;
  const digits = String(value).split('');
  return (
    <LayoutAnimationConfig skipEntering>
      <View style={{ flexDirection: 'row', overflow: 'hidden' }} accessible accessibilityLabel={String(value)}>
        {digits.map((d, i) => (
          <Animated.Text
            key={`${digits.length - i}:${d}`}
            entering={(up ? FadeInDown : FadeInUp).springify().damping(16).stiffness(220)}
            exiting={(up ? FadeOutUp : FadeOutDown).duration(160)}
            style={style}
          >
            {d}
          </Animated.Text>
        ))}
      </View>
    </LayoutAnimationConfig>
  );
}

const ACircle = Animated.createAnimatedComponent(Circle);

/** Activity-style ring that fills to `value` (0–1) with an ease-out once it appears. */
export function Ring({ value, size = 40, stroke = 3.5, color, track, delay = 150, children }: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  delay?: number;
  children?: React.ReactNode;
}) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(Math.max(0, Math.min(1, value)), { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [value, delay, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? t.c.pill} strokeWidth={stroke} fill="none" />
        {value > 0 ? (
          <ACircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color ?? t.c.accent}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            animatedProps={props}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

const glassOK = Platform.OS === 'ios' && isLiquidGlassAvailable();

/** A floating circular control: real Liquid Glass on iOS 26 (lights up under the finger), a raised disc elsewhere. */
export function GlassCircle({ Icon, onPress, label, size = 44, style, testID }: {
  Icon: LucideIcon;
  onPress: () => void;
  label: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = useTheme();
  const icon = <Icon size={size * 0.46} color={t.design === 'glass' ? t.c.fg : t.c.fg2} strokeWidth={2} />;
  const shape = { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} scaleTo={t.design === 'glass' ? 1.08 : 0.94} style={style}>
      {glassOK && t.design === 'glass' ? (
        <GlassView isInteractive glassEffectStyle="regular" style={shape}>
          {icon}
        </GlassView>
      ) : (
        <View
          style={[
            shape,
            t.design === 'glass'
              ? { backgroundColor: t.dark ? 'rgba(44,44,46,0.9)' : 'rgba(255,255,255,0.9)', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 }
              : { backgroundColor: t.c.raised, borderWidth: StyleSheet.hairlineWidth, borderColor: t.c.line },
          ]}
        >
          {icon}
        </View>
      )}
    </PressScale>
  );
}
