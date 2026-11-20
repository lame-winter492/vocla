// A floating tab bar drawn by the app: the Frosted look's tab bar, and the stand-in for the system's
// Liquid Glass bar where that doesn't exist (web). A capsule of material; the selection pill springs
// between tabs and swells like a lens while a tab is held, as on iOS 26.
import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { BookOpenText, CalendarCheck, ChartColumn, GraduationCap, Settings, type LucideIcon } from 'lucide-react-native';
import { forwardRef, useEffect, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { haptic } from './feedback';
import { T } from './kit';
import { Surface } from './material';

const TABS: { name: string; href: '/today' | '/courses' | '/browse' | '/stats' | '/settings'; label: string; Icon: LucideIcon }[] = [
  { name: 'today', href: '/today', label: 'Today', Icon: CalendarCheck },
  { name: 'courses', href: '/courses', label: 'Courses', Icon: GraduationCap },
  { name: 'browse', href: '/browse', label: 'Browse', Icon: BookOpenText },
  { name: 'stats', href: '/stats', label: 'Stats', Icon: ChartColumn },
  { name: 'settings', href: '/settings', label: 'Settings', Icon: Settings },
];
const SPRING = { damping: 17, stiffness: 230, mass: 0.7 };

const TabButton = forwardRef<ComponentRef<typeof Pressable>, TabTriggerSlotProps & { label: string; Icon: LucideIcon; onHold: (on: boolean) => void }>(
  function TabButton({ isFocused, label, Icon, onHold, onPressIn, onPressOut, ...props }, ref) {
    const t = useTheme();
    const color = isFocused ? t.c.accent : t.c.fg;
    return (
      <Pressable
        ref={ref}
        {...props}
        onPressIn={(e) => {
          onHold(true);
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          onHold(false);
          onPressOut?.(e);
        }}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: isFocused }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}
      >
        <Icon size={23} color={color} strokeWidth={isFocused ? 2.2 : 1.9} />
        <T v="caption" weight={600} color={color} style={{ fontSize: 10.5, lineHeight: 13 }}>
          {label}
        </T>
      </Pressable>
    );
  },
);

export default function FloatingTabs() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const index = Math.max(0, TABS.findIndex((x) => path.startsWith(x.href)));
  const [w, setW] = useState(0);
  const seg = (w - 12) / TABS.length;
  const x = useSharedValue(0);
  const lens = useSharedValue(1);
  useEffect(() => {
    x.set(withSpring(6 + index * seg, SPRING));
  }, [index, seg, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scaleX: lens.value }, { scaleY: 1 + (lens.value - 1) * 1.6 }] }));
  const hold = (on: boolean) => {
    lens.set(withSpring(on ? 1.1 : 1, SPRING));
    if (on) haptic.select();
  };

  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      {/* TabList registers the TabTriggers that are its direct children, so the material is a background layer */}
      <TabList asChild>
        <View
          onLayout={(e) => setW(e.nativeEvent.layout.width)}
          style={StyleSheet.flatten([styles.bar, { bottom: Math.max(insets.bottom, 10), shadowOpacity: t.dark ? 0.5 : 0.14 }])}
        >
          <Surface radius={34} strong style={StyleSheet.absoluteFill} />
          {w ? (
            <Animated.View pointerEvents="none" style={[styles.pill, { width: seg, backgroundColor: t.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)' }, pill]} />
          ) : null}
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton label={tab.label} Icon={tab.Icon} onHold={hold} />
            </TabTrigger>
          ))}
        </View>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 18,
    right: 18,
    height: 68,
    flexDirection: 'row',
    paddingHorizontal: 6,
    borderRadius: 34,
    shadowColor: '#000',
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  pill: { position: 'absolute', top: 6, bottom: 6, left: 0, borderRadius: 28 },
});
