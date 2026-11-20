// Liquid Glass: the system tab bar, untouched — on iOS 26 the floating glass capsule whose lens follows
// your finger, minimizing while you scroll down. Frosted: our own floating frosted capsule.
import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/theme';
import FloatingTabs from './FloatingTabs';

export default function AppTabs() {
  const t = useTheme();
  if (t.look === 'frosted') return <FloatingTabs />;
  return (
    <NativeTabs tintColor={t.c.accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar.badge.checkmark', selected: 'calendar.badge.checkmark' }} md="event_available" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="courses">
        <NativeTabs.Trigger.Label>Courses</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'graduationcap', selected: 'graduationcap.fill' }} md="school" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="browse">
        <NativeTabs.Trigger.Label>Browse</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }} md="library_books" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stats">
        <NativeTabs.Trigger.Label>Stats</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} md="bar_chart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
