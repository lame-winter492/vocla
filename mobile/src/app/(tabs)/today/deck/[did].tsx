// One deck: what's due, a Study button that zooms into the session, and the deck's actions in the
// navigation bar's menu.
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { ArrowRight, Ellipsis } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { store, useCol } from '@core/store';
import { stripHtml } from '@core/template';
import { roundedFont, useTheme } from '@/theme';
import { deckActions } from '@/ui/DeckRow';
import { toast } from '@/ui/dialogs';
import { haptic } from '@/ui/feedback';
import { HeaderActions } from '@/ui/HeaderActions';
import { Button, Group, PressScale, Row, Screen, T } from '@/ui/kit';
import { RollingNumber } from '@/ui/widgets';

export default function DeckOverview() {
  const { did: p } = useLocalSearchParams<{ did: string }>();
  const did = Number(p);
  const col = useCol();
  const t = useTheme();
  const deck = col.deck(did);
  if (!deck) return <Screen><T>Deck not found.</T></Screen>;
  const name = deck.name.split('::').pop()!;
  const c = col.counts(did);
  const total = c.newCount + c.learnCount + c.reviewCount;
  const buried = Object.values(col.d.cards).some((x) => x.queue < -1 && col.deckAndChildren(did).some((d) => d.id === x.did));
  const glass = t.design === 'glass';
  const actions = deckActions(did, name).filter((a) => a.title !== 'Study Now');

  const stat = (label: string, n: number, color: string) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <RollingNumber value={n} style={[{ fontSize: 34, lineHeight: 40, color }, glass ? { fontWeight: '700', ...roundedFont } : { ...t.font(600) }]} />
      <T v="footnote" color="muted">
        {label}
      </T>
    </View>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />
      <HeaderActions
        items={[
          {
            label: 'Deck actions',
            sf: 'ellipsis.circle',
            Icon: Ellipsis,
            menu: [
              ...actions.map((a) => ({ title: a.title, sf: a.sf, destructive: a.destructive, onPress: a.onPress })),
              ...(deck.dyn
                ? []
                : [
                    {
                      title: 'Study 10 more new cards',
                      sf: 'plus.circle' as const,
                      onPress: () => {
                        store.update('Custom Study', (cc) => cc.extendLimits(did, 10, 0));
                        toast("Today's new-card limit raised by 10");
                      },
                    },
                  ]),
            ],
          },
        ]}
      />
      <View style={[styles.counts, { backgroundColor: t.c.surface, borderRadius: glass ? 22 : t.radius.lg, borderWidth: glass ? 0 : StyleSheet.hairlineWidth, borderColor: t.c.line }]}>
        {stat('New', c.newCount, t.c.newC)}
        {stat('Learning', c.learnCount, t.c.learnC)}
        {stat('To review', c.reviewCount, t.c.revC)}
      </View>

      {total > 0 ? (
        <Link href={`/study/${did}`} asChild>
          <Link.AppleZoom>
            <PressScale accessibilityRole="button" accessibilityLabel={`Study ${name}, ${total} cards`} testID="study-now" style={{ marginTop: 18 }}>
              <View pointerEvents="none">
                <Button title="Study Now" kind="primary" size="lg" icon={<ArrowRight size={19} color={t.c.onAccent} strokeWidth={2.4} />} />
              </View>
            </PressScale>
          </Link.AppleZoom>
        </Link>
      ) : (
        <View style={{ marginTop: 22, gap: 6, paddingHorizontal: 6 }}>
          <T v="headline">{"You've finished this deck for now."}</T>
          <T color="muted">{"New cards and reviews come back tomorrow. You can raise today's limit from the menu."}</T>
        </View>
      )}

      {deck.description ? (
        <T color="fg2" style={{ marginTop: 22, marginHorizontal: 6 }}>
          {stripHtml(deck.description)}
        </T>
      ) : null}

      <Group style={{ marginTop: 28 }}>
        <Row first title="Add Cards" chevron onPress={() => router.push(`/add?did=${did}`)} />
        <Row title="Browse Cards" chevron onPress={() => router.push(`/browse?q=${encodeURIComponent(`"deck:${deck.name}"`)}`)} />
        <Row title="Options" chevron onPress={() => router.push(`/deck-options/${did}`)} />
        {buried ? (
          <Row
            title="Unbury"
            onPress={() => {
              const ids = new Set(col.deckAndChildren(did).map((d) => d.id));
              store.update('Unbury', (cc) => cc.unburyCards(Object.values(cc.d.cards).filter((x) => x.queue < -1 && ids.has(x.did)).map((x) => x.id)));
              haptic.success();
              toast('Buried cards are back');
            }}
          />
        ) : null}
        {deck.dyn ? (
          <>
            <Row
              title="Rebuild"
              onPress={() => {
                const n = store.update('Rebuild', (cc) => cc.rebuildFiltered(did));
                toast(`${n} cards gathered`);
              }}
            />
            <Row title="Empty" onPress={() => store.update('Empty', (cc) => cc.emptyFiltered(did))} />
          </>
        ) : null}
      </Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  counts: { flexDirection: 'row', paddingVertical: 20, marginTop: 4 },
});
