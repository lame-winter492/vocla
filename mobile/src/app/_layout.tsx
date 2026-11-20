import '@/setup';

import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, useFonts } from '@expo-google-fonts/geist';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { store } from '@core/store';
import { headerFont, useTheme } from '@/theme';
import { DialogHost } from '@/ui/dialogs';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, setLoaded] = useState(store.loaded);
  const [fonts] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, GeistMono_400Regular });

  useEffect(() => {
    if (!store.loaded) void store.load().then(() => setLoaded(true));
    // save whenever the app leaves the foreground (the store also saves 300 ms after each change)
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && void store.save());
    return () => sub.remove();
  }, []);

  const ready = loaded && fonts;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return <App />;
}

function App() {
  const t = useTheme();
  const base = t.dark ? DarkTheme : DefaultTheme;
  const nav = {
    ...base,
    colors: { ...base.colors, primary: t.c.accent, background: t.c.bg, card: t.c.surface, text: t.c.fg, border: t.c.line, notification: t.c.again },
  };
  const modal = {
    headerShown: true,
    headerTintColor: t.c.accent,
    headerStyle: { backgroundColor: t.c.bg },
    headerTitleStyle: { color: t.c.fg, ...headerFont(t, 600) },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: t.c.bg },
  } as const;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.c.bg }}>
      <ThemeProvider value={nav}>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.bg } }}>
          <Stack.Screen name="(tabs)" />
          {/* study and lessons take the whole screen; on iOS the Today card zooms into them */}
          <Stack.Screen name="study/[did]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="lesson/[courseId]/[lessonId]" options={{ presentation: 'fullScreenModal' }} />
          {/* editing happens in sheets that slide up over the current screen and swipe down to dismiss */}
          <Stack.Screen name="add" options={{ ...modal, presentation: 'modal', title: 'Add' }} />
          <Stack.Screen name="note/[nid]" options={{ ...modal, presentation: 'modal', title: 'Edit Note' }} />
          <Stack.Screen name="deck-options/[did]" options={{ ...modal, presentation: 'modal', title: 'Deck Options' }} />
        </Stack>
        <DialogHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
