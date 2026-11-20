// Web: a bottom tab bar drawn with Lucide icons (the native tab bar only exists on iOS and Android).
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { BookOpenText, CalendarCheck, ChartColumn, GraduationCap, Settings, type LucideIcon } from 'lucide-react-native';
import { forwardRef, type ComponentRef } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';
import { T } from './kit';

const TABS: { name: string; href: '/today' | '/courses' | '/browse' | '/stats' | '/settings'; label: string; Icon: LucideIcon }[] = [
  { name: 'today', href: '/today', label: 'Today', Icon: CalendarCheck },
  { name: 'courses', href: '/courses', label: 'Courses', Icon: GraduationCap },
  { name: 'browse', href: '/browse', label: 'Browse', Icon: BookOpenText },
  { name: 'stats', href: '/stats', label: 'Stats', Icon: ChartColumn },
  { name: 'settings', href: '/settings', label: 'Settings', Icon: Settings },
];

const TabButton = forwardRef<ComponentRef<typeof Pressable>, TabTriggerSlotProps & { label: string; Icon: LucideIcon }>(function TabButton({ isFocused, label, Icon, ...props }, ref) {
  const t = useTheme();
  const color = isFocused ? t.c.accent : t.c.muted;
  return (
    <Pressable ref={ref} {...props} accessibilityRole="tab" accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2 }}>
      <Icon size={22} color={color} strokeWidth={1.9} />
      <T v="caption" weight={500} color={color} style={{ fontSize: 10 }}>
        {label}
      </T>
    </Pressable>
  );
});

export default function AppTabs() {
  const t = useTheme();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <View
          style={{
            flexDirection: 'row',
            borderTopWidth: 1,
            borderTopColor: t.c.line,
            backgroundColor: t.design === 'glass' ? (t.dark ? 'rgba(28,28,30,0.92)' : 'rgba(249,249,249,0.94)') : t.c.surface,
            paddingBottom: 4,
          }}
        >
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton label={tab.label} Icon={tab.Icon} />
            </TabTrigger>
          ))}
        </View>
      </TabList>
    </Tabs>
  );
}
