// Settings, laid out like the iOS Settings app: grouped sections, switches, and pickers that open a menu.
import { router, Stack } from 'expo-router';
import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { store, useCol } from '@core/store';
import { currentLook, useTheme, type Look } from '@/theme';
import { showActions, toast } from '@/ui/dialogs';
import { haptic } from '@/ui/feedback';
import { Group, PressScale, Row, Screen, T } from '@/ui/kit';
import { Backdrop, Surface } from '@/ui/material';

const LANGS: [string, string][] = [
  ['es-ES', 'Spanish'],
  ['fr-FR', 'French'],
  ['de-DE', 'German'],
  ['it-IT', 'Italian'],
  ['pt-BR', 'Portuguese (Brazil)'],
  ['ja-JP', 'Japanese'],
  ['ko-KR', 'Korean'],
  ['zh-CN', 'Chinese (Mandarin)'],
  ['nl-NL', 'Dutch'],
  ['ru-RU', 'Russian'],
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
];

export default function Settings() {
  const col = useCol();
  const t = useTheme();
  const prefs = col.d.prefs;
  const look = currentLook(prefs.look);
  const set = (fn: () => void) => store.mutate(fn);

  // each option is a live sample of its material over the same soft light the app uses
  const lookCard = (l: Look, title: string, sub: string) => (
    <PressScale
      onPress={() => {
        haptic.select();
        set(() => (prefs.look = l));
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: look === l }}
      accessibilityLabel={title}
      testID={`look-${l}`}
      style={{ flex: 1, gap: 8 }}
    >
      <View style={{ height: 110, borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: look === l ? t.c.accent : 'transparent' }}>
        <Backdrop />
        <View style={{ position: 'absolute', left: 22, top: 18, width: 46, height: 46, borderRadius: 23, backgroundColor: '#ff9f0a' }} />
        <View style={{ position: 'absolute', right: 18, top: 30, width: 60, height: 22, borderRadius: 11, backgroundColor: '#30d158' }} />
        <Surface look={l} radius={22} style={{ position: 'absolute', left: 12, right: 12, bottom: 12, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <T v="footnote" weight={600}>
            {l === 'liquid' ? 'Glass' : 'Frost'}
          </T>
        </Surface>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
        <T v="subhead" weight={600} style={{ flex: 1 }}>
          {title}
        </T>
        {look === l ? <Check size={16} color={t.c.accent} strokeWidth={2.6} /> : null}
      </View>
      <T v="caption" color="muted" style={{ paddingHorizontal: 4 }}>
        {sub}
      </T>
    </PressScale>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Settings' }} />
      <Group header="Appearance" footer="Both follow your light or dark appearance. Liquid Glass bends and lights up what is behind it (iOS 26); Frosted is the soft blur of earlier iOS.">
        <View style={{ flexDirection: 'row', gap: 12, padding: 12 }}>
          {lookCard('liquid', 'Liquid Glass', 'Clear, refractive glass')}
          {lookCard('frosted', 'Frosted', 'Soft frosted material')}
        </View>
      </Group>

      <Group header="Studying">
        <Row first title="Show intervals on answer buttons" toggle={prefs.showIntervalsOnButtons} onToggle={(v) => set(() => (prefs.showIntervalsOnButtons = v))} />
        <Row title="Show remaining card counts" toggle={prefs.showRemaining} onToggle={(v) => set(() => (prefs.showRemaining = v))} />
        <Row title="Haptics" toggle={prefs.haptics !== false} onToggle={(v) => set(() => (prefs.haptics = v))} />
        <Row
          title="Next day starts at"
          value={`${String(prefs.rolloverHour).padStart(2, '0')}:00`}
          chevron
          onPress={() =>
            showActions(
              'Next day starts at',
              [0, 2, 3, 4, 5, 6].map((h) => ({ title: `${String(h).padStart(2, '0')}:00${h === 4 ? ' (Anki default)' : ''}`, onPress: () => set(() => (prefs.rolloverHour = h)) })),
            )
          }
        />
        <Row
          title="Learn ahead limit"
          value={`${prefs.learnAheadMins} min`}
          chevron
          onPress={() => showActions('Learn ahead limit', [0, 10, 20, 30, 60].map((m) => ({ title: `${m} minutes`, onPress: () => set(() => (prefs.learnAheadMins = m)) })))}
        />
      </Group>

      <Group header="Speech" footer="Used by {{tts auto:Field}} on cards and by courses without a language of their own.">
        <Row
          first
          title="Language"
          value={LANGS.find(([c]) => c === prefs.targetLang)?.[1] ?? prefs.targetLang}
          chevron
          onPress={() => showActions('Speech language', LANGS.map(([code, name]) => ({ title: name, onPress: () => set(() => (prefs.targetLang = code)) })))}
        />
      </Group>

      <Group header="Collection">
        <Row first title="Import & Export" chevron onPress={() => router.push('/settings/data')} />
        <Row
          title="Check Database"
          onPress={() => {
            const problems = store.update('Check Database', (c) => c.checkDatabase());
            haptic.success();
            toast(problems.length ? `Fixed ${problems.length} problem${problems.length > 1 ? 's' : ''}` : 'No problems found');
          }}
        />
        <Row
          title="Empty Cards"
          subtitle="Delete cards whose template now renders empty"
          onPress={() => {
            const ids = store.col.emptyCards();
            if (!ids.length) return toast('No empty cards');
            store.update('Empty Cards', (c) => c.removeCards(ids));
            toast(`Deleted ${ids.length} empty card${ids.length > 1 ? 's' : ''}`, { label: 'Undo', onPress: () => store.undo() });
          }}
        />
        <Row
          title="Undo"
          value={store.undoLabel() ?? 'Nothing to undo'}
          onPress={() => {
            const l = store.undo();
            toast(l ? `Undo: ${l}` : 'Nothing to undo');
          }}
        />
      </Group>

      <Group header="About" footer="Spaced repetition with FSRS, compatible with Anki's note types, templates and search. Icons by Lucide.">
        <Row first title="Cards" value={String(Object.keys(col.d.cards).length)} />
        <Row title="Notes" value={String(Object.keys(col.d.notes).length)} />
        <Row title="Reviews" value={String(col.d.revlog.length)} />
      </Group>
    </Screen>
  );
}
