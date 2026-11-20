// The stack inside each tab: native large titles that collapse into the bar as you scroll, a
// transparent Liquid Glass bar on iOS 26 (content scrolls under it with the soft edge effect).
import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { headerFont, useTheme } from '@/theme';

export function TabStack() {
  const t = useTheme();
  const ios = Platform.OS === 'ios';
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerTransparent: ios,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
        headerTintColor: t.c.accent,
        headerStyle: ios ? undefined : { backgroundColor: t.c.bg },
        headerTitleStyle: { color: t.c.fg, ...headerFont(t, 600) },
        // the large title style types fontWeight as a plain string
        headerLargeTitleStyle: { color: t.c.fg, fontWeight: headerFont(t, 700).fontWeight as string | undefined },
        contentStyle: { backgroundColor: 'transparent' },
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );
}
