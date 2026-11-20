// The system tab bar: on iOS 26 a floating Liquid Glass bar that minimizes while you scroll down,
// on Android a Material navigation bar. Icons are SF Symbols / Material Symbols, as the system expects.
import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/theme';

export default function AppTabs() {
  const t = useTheme();
  return (
    <NativeTabs
      tintColor={t.c.accent}
      minimizeBehavior="onScrollDown"
      backgroundColor={t.design === 'focus' ? t.c.surface : undefined}
      labelStyle={t.design === 'focus' ? { fontFamily: 'Geist_500Medium' } : undefined}
    >
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar.badge.checkmark" md="event_available" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="courses">
        <NativeTabs.Trigger.Label>Courses</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="graduationcap" md="school" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="browse">
        <NativeTabs.Trigger.Label>Browse</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="books.vertical" md="library_books" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stats">
        <NativeTabs.Trigger.Label>Stats</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar" md="bar_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
