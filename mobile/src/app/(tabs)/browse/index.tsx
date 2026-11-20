// Browse: the native search bar takes Anki's search syntax. Results show as a list or as icons (rounded
// thumbnails, like Files' icon view); view, sort and cards/notes live in one pull-down menu.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ellipsis, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { searchCards } from '@core/search';
import { store, useCol } from '@core/store';
import { stripHtml } from '@core/template';
import { formatDate } from '@core/time';
import { CardType, Queue, type Card, type ID } from '@core/types';
import { useTheme } from '@/theme';
import { confirm, showActions, toast } from '@/ui/dialogs';
import { haptic } from '@/ui/feedback';
import { HeaderActions, type MenuItem } from '@/ui/HeaderActions';
import { T } from '@/ui/kit';
import { useNow } from '@/ui/useNow';

type SortKey = 'sort' | 'created' | 'due' | 'ivl' | 'reps' | 'lapses';
const SORTS: { key: SortKey; title: string }[] = [
  { key: 'sort', title: 'Word' },
  { key: 'created', title: 'Date Added' },
  { key: 'due', title: 'Due' },
  { key: 'ivl', title: 'Interval' },
  { key: 'reps', title: 'Reviews' },
  { key: 'lapses', title: 'Lapses' },
];
const FLAG = ['', '#ff3b30', '#ff9500', '#34c759', '#007aff', '#ff2d55', '#30b0c7', '#af52de'];

export default function Browse() {
  const col = useCol();
  const t = useTheme();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q ?? '');
  // a new ?q= (e.g. "Browse Cards" from a deck) replaces the search
  const [lastQ, setLastQ] = useState(params.q);
  if (params.q !== lastQ) {
    setLastQ(params.q);
    if (params.q !== undefined) setQuery(params.q);
  }
  const now = useNow(60000);
  const [mode, setMode] = useState<'cards' | 'notes'>('cards');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'created', desc: true });
  const view = col.d.prefs.browserView ?? 'list';
  const today = col.today();
  const { width } = useWindowDimensions();

  const ids = useMemo(() => {
    let cids: ID[];
    try {
      cids = searchCards(col, query.trim() || 'deck:*');
    } catch {
      cids = [];
    }
    let list = cids;
    if (mode === 'notes') {
      const seen = new Set<ID>();
      list = [];
      for (const cid of cids) {
        const nid = col.d.cards[cid].nid;
        if (!seen.has(nid)) {
          seen.add(nid);
          list.push(cid); // keep the note's first card as its representative
        }
      }
    }
    const key = (c: Card): string | number => {
      const note = col.d.notes[c.nid];
      switch (sort.key) {
        case 'sort':
          return stripHtml(note?.fields[col.d.notetypes[note.ntid]?.sortField ?? 0] ?? '').toLowerCase();
        case 'created':
          return mode === 'notes' ? c.nid : c.id;
        case 'due':
          return c.queue === Queue.New ? 1e9 + c.due : c.queue === Queue.Learn ? today + (c.due - now) / 86400e3 : c.due;
        case 'ivl':
          return c.ivl;
        case 'reps':
          return c.reps;
        case 'lapses':
          return c.lapses;
      }
    };
    const keyed = list.map((id) => [key(col.d.cards[id]), id] as const);
    keyed.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) * (sort.desc ? -1 : 1));
    return keyed.map((k) => k[1]);
  }, [col, store.version, query, mode, sort, today, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = (cid: ID) => {
    const c = col.d.cards[cid];
    const note = col.d.notes[c.nid];
    const nt = note ? col.d.notetypes[note.ntid] : undefined;
    const front = stripHtml(note?.fields[nt?.sortField ?? 0] ?? '');
    const back = stripHtml(note?.fields[(nt?.sortField ?? 0) === 0 ? 1 : 0] ?? '');
    const deck = col.deck(c.did)?.name.split('::').pop() ?? '';
    const due =
      c.queue === Queue.Suspended
        ? 'suspended'
        : c.queue < -1
          ? 'buried'
          : c.type === CardType.New
            ? 'new'
            : c.queue === Queue.Learn
              ? 'learning'
              : c.due <= today
                ? 'due'
                : `in ${c.due - today}d`;
    return { c, front, back, deck, due, template: col.cardTemplateName(c) };
  };

  const actions = (cid: ID) => {
    const c = col.d.cards[cid];
    const suspended = c.queue === Queue.Suspended;
    showActions(info(cid).front, [
      { title: 'Edit Note', onPress: () => router.push(`/note/${c.nid}`) },
      {
        title: suspended ? 'Unsuspend' : 'Suspend',
        onPress: () => store.update(suspended ? 'Unsuspend' : 'Suspend', (cc) => (suspended ? cc.unsuspendCards([cid]) : cc.suspendCards([cid]))),
      },
      { title: c.flags ? 'Remove Flag' : 'Flag Red', onPress: () => store.update('Flag', (cc) => cc.setFlag([cid], c.flags ? 0 : 1)) },
      { title: 'Bury Until Tomorrow', onPress: () => store.update('Bury', (cc) => cc.buryCards([cid])) },
      {
        title: 'Forget (Reset to New)',
        onPress: async () => {
          if (await confirm('Reset this card to new?', 'Its review history stays, the schedule starts over.', 'Reset', true)) store.update('Forget', (cc) => cc.forgetCards([cid]));
        },
      },
      {
        title: 'Delete Note',
        destructive: true,
        onPress: async () => {
          if (!(await confirm('Delete this note?', 'All of its cards are deleted too.', 'Delete', true))) return;
          store.update('Delete Note', (cc) => cc.removeNotes([c.nid]));
          haptic.warn();
          toast('Note deleted', { label: 'Undo', onPress: () => store.undo() });
        },
      },
    ]);
  };

  const menu: MenuItem[] = [
    { title: 'Icons', sf: 'square.grid.2x2', isOn: view === 'icons', onPress: () => store.mutate((c) => (c.d.prefs.browserView = 'icons')) },
    { title: 'List', sf: 'list.bullet', isOn: view === 'list', onPress: () => store.mutate((c) => (c.d.prefs.browserView = 'list')) },
    ...SORTS.map((s) => ({
      title: sort.key === s.key ? `${s.title} ${sort.desc ? '↓' : '↑'}` : s.title,
      isOn: sort.key === s.key,
      onPress: () => setSort((o) => ({ key: s.key, desc: o.key === s.key ? !o.desc : s.key === 'created' })),
    })),
    { title: 'Cards', sf: 'rectangle.stack', isOn: mode === 'cards', onPress: () => setMode('cards') },
    { title: 'Notes', sf: 'doc.text', isOn: mode === 'notes', onPress: () => setMode('notes') },
  ];

  const cols = Math.max(2, Math.floor((width - 24) / 170));
  const tileW = (width - 32 - (cols - 1) * 12) / cols;

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen
        options={{
          title: 'Browse',
          headerSearchBarOptions:
            Platform.OS === 'web'
              ? undefined
              : {
                  placeholder: 'Search (Anki syntax)',
                  autoCapitalize: 'none',
                  hideWhenScrolling: false,
                  onChangeText: (e) => setQuery(e.nativeEvent.text),
                  onCancelButtonPress: () => setQuery(''),
                },
        }}
      />
      <HeaderActions items={[{ label: 'View options', sf: 'ellipsis.circle', Icon: Ellipsis, menu }]} />
      <FlatList
        key={view === 'icons' ? `g${cols}` : 'l'}
        data={ids.slice(0, 1500)}
        keyExtractor={(id) => String(id)}
        numColumns={view === 'icons' ? cols : 1}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: view === 'icons' ? 16 : 0 }}
        columnWrapperStyle={view === 'icons' ? { gap: 12 } : undefined}
        ListHeaderComponent={
          <View style={{ marginBottom: 10, gap: 10 }}>
            {Platform.OS === 'web' ? (
              <View style={[styles.search, { backgroundColor: t.c.pill }]}>
                <Search size={17} color={t.c.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search (Anki syntax)"
                  placeholderTextColor={t.c.muted}
                  autoCapitalize="none"
                  accessibilityLabel="Search"
                  testID="browse-search"
                  style={[{ flex: 1, color: t.c.fg, fontSize: 17, paddingVertical: 8 }, t.font(400)]}
                />
              </View>
            ) : null}
            <T v="footnote" color="muted" style={{ marginHorizontal: 4 }} testID="browse-count">
              {ids.length} {mode}
              {ids.length > 1500 ? ' (showing the first 1500)' : ''}
            </T>
          </View>
        }
        ListEmptyComponent={
          <T color="muted" style={{ textAlign: 'center', marginTop: 40 }}>
            No {mode} match “{query}”.
          </T>
        }
        renderItem={({ item, index }) => {
          const r = info(item);
          const susp = r.c.queue === Queue.Suspended;
          if (view === 'icons')
            return (
              <Animated.View entering={FadeIn.duration(180)} style={{ width: tileW }}>
                <Pressable onPress={() => router.push(`/note/${r.c.nid}`)} onLongPress={() => (haptic.firm(), actions(item))} accessibilityRole="button" accessibilityLabel={r.front}>
                  {({ pressed }) => (
                    <>
                      <View
                        style={[
                          styles.thumb,
                          {
                            backgroundColor: t.c.surface,
                            borderRadius: t.design === 'glass' ? 16 : 12,
                            borderWidth: t.design === 'glass' ? 0 : StyleSheet.hairlineWidth,
                            borderColor: t.c.line,
                            opacity: susp ? 0.45 : 1,
                            transform: [{ scale: pressed ? 0.96 : 1 }],
                          },
                        ]}
                      >
                        <T v="headline" numberOfLines={3} style={{ textAlign: 'center' }}>
                          {r.front || '—'}
                        </T>
                        {r.c.flags ? <View style={[styles.dot, { backgroundColor: FLAG[r.c.flags], position: 'absolute', top: 8, right: 8 }]} /> : null}
                      </View>
                      <T v="footnote" weight={500} numberOfLines={1} style={{ textAlign: 'center', marginTop: 6 }}>
                        {mode === 'cards' ? r.template : r.back}
                      </T>
                      <T v="caption" color="muted" numberOfLines={1} style={{ textAlign: 'center' }}>
                        {r.deck} · {r.due}
                      </T>
                    </>
                  )}
                </Pressable>
              </Animated.View>
            );
          return (
            <Pressable
              onPress={() => router.push(`/note/${r.c.nid}`)}
              onLongPress={() => (haptic.firm(), actions(item))}
              accessibilityRole="button"
              accessibilityLabel={`${r.front}, ${r.deck}, ${r.due}`}
              testID={`browse-row-${index}`}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? t.c.pill : t.c.surface,
                  borderTopLeftRadius: index === 0 ? 18 : 0,
                  borderTopRightRadius: index === 0 ? 18 : 0,
                  borderBottomLeftRadius: index === Math.min(ids.length, 1500) - 1 ? 18 : 0,
                  borderBottomRightRadius: index === Math.min(ids.length, 1500) - 1 ? 18 : 0,
                },
              ]}
            >
              <View style={[styles.rowBody, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.c.line }]}>
                <View style={{ flex: 1, opacity: susp ? 0.45 : 1 }}>
                  <T numberOfLines={1}>{r.front || '—'}</T>
                  <T v="footnote" color="muted" numberOfLines={1}>
                    {r.back}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {r.c.flags ? <View style={[styles.dot, { backgroundColor: FLAG[r.c.flags] }]} /> : null}
                    <T v="footnote" color={r.due === 'due' ? 'revC' : r.due === 'new' ? 'newC' : 'muted'}>
                      {r.due}
                    </T>
                  </View>
                  <T v="caption" color="faint">
                    {sort.key === 'created' ? formatDate(r.c.id) : r.deck}
                  </T>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 10 },
  row: { paddingLeft: 16 },
  rowBody: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingRight: 16, minHeight: 56 },
  thumb: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', padding: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
