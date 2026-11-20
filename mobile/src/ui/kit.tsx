// Building blocks shared by every screen: Dynamic Type text, spring press feedback, iOS grouped lists,
// capsule buttons and monogram icons. Everything reads the current design from useTheme().
import { ChevronRight } from 'lucide-react-native';
import { type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { roundedFont, useTheme, type Palette } from '@/theme';

// ---------- text: the iOS Dynamic Type scale ----------
const SIZES = {
  largeTitle: { fontSize: 34, lineHeight: 41, w: 700 },
  title1: { fontSize: 28, lineHeight: 34, w: 700 },
  title2: { fontSize: 22, lineHeight: 28, w: 700 },
  title3: { fontSize: 20, lineHeight: 25, w: 600 },
  headline: { fontSize: 17, lineHeight: 22, w: 600 },
  body: { fontSize: 17, lineHeight: 22, w: 400 },
  callout: { fontSize: 16, lineHeight: 21, w: 400 },
  subhead: { fontSize: 15, lineHeight: 20, w: 400 },
  footnote: { fontSize: 13, lineHeight: 18, w: 400 },
  caption: { fontSize: 12, lineHeight: 16, w: 400 },
} as const;
export type TextVariant = keyof typeof SIZES;

export function T({
  v = 'body',
  color,
  weight,
  rounded,
  style,
  ...rest
}: TextProps & { v?: TextVariant; color?: keyof Palette | (string & {}); weight?: 400 | 500 | 600 | 700; rounded?: boolean }) {
  const t = useTheme();
  const s = SIZES[v];
  const c = color ? ((t.c as unknown as Record<string, string>)[color] ?? color) : t.c.fg;
  // Focus runs a size smaller, like the web design
  const scale = t.design === 'focus' && v !== 'largeTitle' && v !== 'title1' ? 0.94 : 1;
  return (
    <Text
      {...rest}
      style={[
        { fontSize: Math.round(s.fontSize * scale), lineHeight: Math.round(s.lineHeight * scale), color: c },
        t.font(weight ?? s.w),
        rounded && t.design === 'glass' ? roundedFont : null,
        style,
      ]}
    />
  );
}

// ---------- press feedback: compress on touch, spring back on release ----------
const SPRING = { damping: 15, stiffness: 320, mass: 0.6 };
const APressable = Animated.createAnimatedComponent(Pressable);

export function PressScale({
  scaleTo = 0.96,
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style'> & { scaleTo?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...rest}
      onPressIn={(e) => {
        s.set(withTiming(scaleTo, { duration: 90 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, SPRING));
        onPressOut?.(e);
      }}
      style={[style, a]}
    >
      {children}
    </APressable>
  );
}

// ---------- buttons ----------
export function Button({
  title,
  onPress,
  kind = 'plain',
  size = 'md',
  icon,
  disabled,
  style,
  testID,
}: {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'plain' | 'tinted' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = useTheme();
  const glass = t.design === 'glass';
  const h = size === 'lg' ? 52 : size === 'sm' ? 32 : 44;
  const bg =
    kind === 'primary' ? t.c.accent : kind === 'tinted' ? t.c.pill : kind === 'plain' ? (glass ? t.c.pill : t.c.raised) : 'transparent';
  const fg =
    kind === 'primary' ? t.c.onAccent : kind === 'destructive' ? t.c.again : kind === 'plain' && !glass ? t.c.fg : t.c.accent;
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          minHeight: h,
          paddingHorizontal: size === 'sm' ? 14 : size === 'lg' ? 26 : 18,
          borderRadius: glass ? h / 2 : t.radius.md,
          backgroundColor: bg,
          borderWidth: !glass && kind === 'plain' ? StyleSheet.hairlineWidth : 0,
          borderColor: t.c.line,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: disabled ? 0.4 : 1,
        },
        kind === 'primary' && glass ? { shadowColor: t.c.accent, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } } : null,
        style,
      ]}
    >
      <T v={size === 'lg' ? 'headline' : size === 'sm' ? 'subhead' : 'body'} weight={600} color={fg}>
        {title}
      </T>
      {icon}
    </PressScale>
  );
}

// ---------- iOS inset grouped list ----------
export function Group({ header, footer, children, style }: { header?: string; footer?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ marginBottom: 26 }, style]}>
      {header ? (
        <T v="footnote" color="muted" style={{ marginLeft: 16, marginBottom: 6, textTransform: t.design === 'glass' ? 'none' : 'none' }}>
          {header}
        </T>
      ) : null}
      <View
        style={{
          backgroundColor: t.c.surface,
          borderRadius: t.design === 'glass' ? 22 : t.radius.lg,
          overflow: 'hidden',
          borderWidth: t.design === 'focus' ? StyleSheet.hairlineWidth : 0,
          borderColor: t.c.line,
        }}
      >
        {children}
      </View>
      {footer ? (
        <T v="footnote" color="muted" style={{ marginHorizontal: 16, marginTop: 6 }}>
          {footer}
        </T>
      ) : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  value,
  left,
  right,
  onPress,
  onLongPress,
  chevron,
  destructive,
  toggle,
  onToggle,
  first,
  inset = 16,
  testID,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
  first?: boolean;
  inset?: number;
  testID?: string;
}) {
  const t = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingLeft: inset }}>
      {left ? <View style={{ marginRight: 12 }}>{left}</View> : null}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'stretch',
          paddingRight: 16,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: t.c.line,
          paddingVertical: 10,
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <T color={destructive ? 'again' : 'fg'} numberOfLines={1}>
            {title}
          </T>
          {subtitle ? (
            <T v="footnote" color="muted" numberOfLines={2}>
              {subtitle}
            </T>
          ) : null}
        </View>
        {value ? <T color="muted">{value}</T> : null}
        {right}
        {toggle !== undefined ? <Switch value={toggle} onValueChange={onToggle} trackColor={{ true: t.design === 'glass' ? t.c.good : t.c.accent }} thumbColor="#ffffff" /> : null}
        {chevron ? <ChevronRight size={18} color={t.c.faint} strokeWidth={2.2} /> : null}
      </View>
    </View>
  );
  if (!onPress && !onLongPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.c.pill : 'transparent' })}
    >
      {body}
    </Pressable>
  );
}

// ---------- monogram icons (Safari Favorites / app icons) ----------
export function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}
/** hsl → hex, lightness picked per hue so white text reads on yellow as well as on blue */
function tile(h: number, l: number): string {
  const s = 0.62;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
export function Monogram({ name, text, size = 28 }: { name: string; text?: string; size?: number }) {
  const t = useTheme();
  const h = hueOf(name);
  const yellowish = h > 35 && h < 75;
  const label = (text ?? name.trim().charAt(0)).toUpperCase() || '?';
  if (t.design === 'focus')
    return (
      <View style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: t.c.raised, borderWidth: StyleSheet.hairlineWidth, borderColor: t.c.line, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[{ color: t.c.accent, fontSize: size * 0.42 }, t.mono]}>{label}</Text>
      </View>
    );
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.235,
        backgroundColor: tile(h, yellowish ? 0.42 : 0.52),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[{ color: '#fff', fontSize: size * 0.5, fontWeight: '600' }, roundedFont]}>{label}</Text>
    </View>
  );
}

// ---------- screen scaffolding ----------
/** A scrolling screen. contentInsetAdjustmentBehavior lets the native large title collapse on iOS. */
export function Screen({ children, style, contentContainerStyle, ...rest }: ScrollViewProps & { children: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={[{ flex: 1, backgroundColor: t.c.bg }, style]}
      contentContainerStyle={[{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }, contentContainerStyle]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export const textStyle = (t: ReturnType<typeof useTheme>, extra?: TextStyle): TextStyle => ({ color: t.c.fg, fontSize: 17, ...t.font(400), ...extra });
