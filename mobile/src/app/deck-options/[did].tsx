// Deck options as an iOS settings form. Changes are a draft until Save; the sheet can be swiped away.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { store, useCol } from '@core/store';
import type { DeckConfig } from '@core/types';
import { useTheme } from '@/theme';
import { showActions, toast } from '@/ui/dialogs';
import { haptic } from '@/ui/feedback';
import { HeaderActions } from '@/ui/HeaderActions';
import { Group, Row, T } from '@/ui/kit';
import { Backdrop } from '@/ui/material';

const parseSteps = (s: string) =>
  s
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^([\d.]+)([smhd]?)$/);
      if (!m) return NaN;
      const n = parseFloat(m[1]);
      return m[2] === 's' ? n / 60 : m[2] === 'h' ? n * 60 : m[2] === 'd' ? n * 1440 : n;
    })
    .filter((n) => !isNaN(n) && n > 0);
const fmtSteps = (steps: number[]) =>
  steps.map((m) => (m >= 1440 && m % 1440 === 0 ? `${m / 1440}d` : m >= 60 && m % 60 === 0 ? `${m / 60}h` : m < 1 ? `${Math.round(m * 60)}s` : `${m}m`)).join(' ');

export default function DeckOptions() {
  const { did: p } = useLocalSearchParams<{ did: string }>();
  const did = Number(p);
  const col = useCol();
  const t = useTheme();
  const deck = col.deck(did);
  const [conf, setConf] = useState<DeckConfig>(() => structuredClone(col.confFor(did)));
  const [newSteps, setNewSteps] = useState(fmtSteps(conf.new.steps));
  const [lapseSteps, setLapseSteps] = useState(fmtSteps(conf.lapse.steps));
  const [children, setChildren] = useState(false);
  if (!deck) return <T style={{ padding: 20 }}>Deck not found.</T>;
  const upd = (fn: (c: DeckConfig) => void) =>
    setConf((c) => {
      const n = structuredClone(c);
      fn(n);
      return n;
    });

  const save = () => {
    const c = { ...conf, new: { ...conf.new, steps: parseSteps(newSteps) }, lapse: { ...conf.lapse, steps: parseSteps(lapseSteps) }, mod: Date.now() };
    store.update('Deck Options', (cc) => {
      cc.d.dconf[c.id] = c;
      cc.d.decks[did].confId = c.id;
      if (children) for (const d of cc.deckAndChildren(did)) if (!d.dyn) d.confId = c.id;
    });
    haptic.success();
    toast('Options saved');
    router.back();
  };

  const input = {
    minWidth: 70,
    textAlign: 'right' as const,
    color: t.c.accent,
    fontSize: 17,
    paddingVertical: 4,
    ...t.font(500),
  };
  const num = (title: string, value: number, set: (v: number) => void, first = false, decimals = false) => (
    <Row
      first={first}
      title={title}
      right={
        <TextInput
          defaultValue={String(value)}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          onEndEditing={(e) => {
            const v = Number(e.nativeEvent.text.replace(',', '.'));
            if (!isNaN(v)) set(v);
          }}
          onChangeText={(s) => {
            const v = Number(s.replace(',', '.'));
            if (s && !isNaN(v)) set(v);
          }}
          selectTextOnFocus
          accessibilityLabel={title}
          style={input}
        />
      }
    />
  );
  const text = (title: string, value: string, set: (v: string) => void, first = false) => (
    <Row
      first={first}
      title={title}
      right={<TextInput value={value} onChangeText={set} autoCapitalize="none" autoCorrect={false} accessibilityLabel={title} style={[input, { minWidth: 120 }]} />}
    />
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Backdrop />
      <Stack.Screen options={{ title: deck.name.split('::').pop() }} />
      <HeaderActions placement="left" items={[{ label: 'Cancel', sf: 'xmark', Icon: X, text: true, onPress: () => router.back() }]} />
      <HeaderActions items={[{ label: 'Save', sf: 'checkmark', Icon: Check, prominent: true, onPress: save, testID: 'save-options' }]} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <T v="footnote" color="muted" style={{ marginHorizontal: 16, marginBottom: 14 }}>
          Preset “{conf.name}”, shared by {col.decks().filter((d) => !d.dyn && d.confId === conf.id).length} deck(s).
        </T>
        <Group header="Daily limits">
          {num('New cards/day', conf.new.perDay, (v) => upd((c) => (c.new.perDay = v)), true)}
          {num('Maximum reviews/day', conf.rev.perDay, (v) => upd((c) => (c.rev.perDay = v)))}
        </Group>
        <Group
          header="Scheduler"
          footer="FSRS predicts when you'll forget each card, which usually means fewer reviews for the same retention. Desired retention is the chance of remembering a card when it comes back (0.9 = 90%)."
        >
          <Row first title="Use FSRS" toggle={conf.fsrs.enabled} onToggle={(v) => upd((c) => (c.fsrs.enabled = v))} />
          {conf.fsrs.enabled ? (
            <Row
              title="Desired retention"
              value={`${Math.round(conf.fsrs.desiredRetention * 100)}%`}
              chevron
              onPress={() =>
                showActions(
                  'Desired retention',
                  [0.8, 0.85, 0.9, 0.92, 0.95, 0.97].map((r) => ({
                    title: `${Math.round(r * 100)}%${r === 0.9 ? ' (recommended)' : ''}`,
                    onPress: () => upd((c) => (c.fsrs.desiredRetention = r)),
                  })),
                )
              }
            />
          ) : null}
        </Group>
        <Group header="New cards" footer="Steps are times like 1m 10m 1h 1d.">
          {text('Learning steps', newSteps, setNewSteps, true)}
          {conf.fsrs.enabled ? null : num('Graduating interval (days)', conf.new.graduatingIvl, (v) => upd((c) => (c.new.graduatingIvl = v)))}
          {conf.fsrs.enabled ? null : num('Easy interval (days)', conf.new.easyIvl, (v) => upd((c) => (c.new.easyIvl = v)))}
          <Row
            title="Order"
            value={conf.new.order === 'random' ? 'Random' : 'Order added'}
            chevron
            onPress={() =>
              showActions('New card order', [
                { title: 'Order added', onPress: () => upd((c) => (c.new.order = 'added')) },
                { title: 'Random', onPress: () => upd((c) => (c.new.order = 'random')) },
              ])
            }
          />
        </Group>
        <Group header="Lapses">
          {text('Relearning steps', lapseSteps, setLapseSteps, true)}
          {num('Leech threshold', conf.lapse.leechThreshold, (v) => upd((c) => (c.lapse.leechThreshold = v)))}
          <Row
            title="Leech action"
            value={conf.lapse.leechAction === 'suspend' ? 'Suspend card' : 'Tag only'}
            chevron
            onPress={() =>
              showActions('When a card becomes a leech', [
                { title: 'Suspend card', onPress: () => upd((c) => (c.lapse.leechAction = 'suspend')) },
                { title: 'Tag only', onPress: () => upd((c) => (c.lapse.leechAction = 'tag')) },
              ])
            }
          />
        </Group>
        <Group header="Burying" footer="Siblings are other cards from the same note (like the reverse of a word). Burying waits a day before showing them.">
          <Row first title="Bury new siblings" toggle={conf.new.bury} onToggle={(v) => upd((c) => (c.new.bury = v))} />
          <Row title="Bury review siblings" toggle={conf.rev.bury} onToggle={(v) => upd((c) => (c.rev.bury = v))} />
        </Group>
        <Group header="Audio & timer">
          <Row first title="Play audio automatically" toggle={conf.autoplay} onToggle={(v) => upd((c) => (c.autoplay = v))} />
          <Row title="Show answer timer" toggle={conf.showTimer} onToggle={(v) => upd((c) => (c.showTimer = v))} />
          {num('Maximum answer seconds', conf.maxAnswerSecs, (v) => upd((c) => (c.maxAnswerSecs = v)))}
        </Group>
        {col.deckAndChildren(did).length > 1 ? (
          <Group>
            <Row first title="Also use for subdecks" toggle={children} onToggle={setChildren} />
          </Group>
        ) : null}
        <View style={{ height: StyleSheet.hairlineWidth }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
