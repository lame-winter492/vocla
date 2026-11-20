// A deck in the Today list. iOS: long press shows the native context menu with a preview of the deck
// (Link.Menu / Link.Preview). Android and web: long press opens the same actions in a sheet.
import { Link, router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import type { DeckTreeNode } from '@core/col';
import { exportDeckPackage } from '@core/importexport';
import { store } from '@core/store';
import { useTheme } from '@/theme';
import { askText, confirm, showActions, toast } from './dialogs';
import { haptic } from './feedback';
import { shareFile } from './io';
import { Monogram, T } from './kit';

export function deckActions(id: number, name: string) {
  const d = store.col.deck(id);
  return [
    { title: 'Study Now', sf: 'play.fill' as const, onPress: () => router.push(`/study/${id}`) },
    {
      title: 'Rename',
      sf: 'pencil' as const,
      onPress: async () => {
        const n = await askText('Rename deck', d?.name ?? name);
        if (!n?.trim()) return;
        try {
          store.update('Rename Deck', (c) => c.renameDeck(id, n.trim()));
        } catch (e) {
          toast((e as Error).message);
        }
      },
    },
    { title: 'Options', sf: 'slider.horizontal.3' as const, onPress: () => router.push(`/deck-options/${id}`) },
    {
      title: 'Export',
      sf: 'square.and.arrow.up' as const,
      onPress: () => void shareFile(`${name.replace(/[^\w-]+/g, '_')}.vocla.json`, JSON.stringify(exportDeckPackage(store.col, id, true))),
    },
    {
      title: 'Delete',
      sf: 'trash' as const,
      destructive: true,
      onPress: async () => {
        const sub = store.col.deckAndChildren(id);
        const ids = new Set(sub.map((x) => x.id));
        const cards = Object.values(store.col.d.cards).filter((c) => ids.has(c.did)).length;
        if (!(await confirm(`Delete "${d?.name ?? name}"?`, `${sub.length > 1 ? `${sub.length - 1} subdecks and ` : ''}${cards} cards will be deleted.`, 'Delete', true))) return;
        store.update('Delete Deck', (c) => c.removeDeck(id));
        haptic.warn();
        toast('Deck deleted', { label: 'Undo', onPress: () => store.undo() });
      },
    },
  ];
}

export function DeckRow({ node, first }: { node: DeckTreeNode; first: boolean }) {
  const t = useTheme();
  const d = node.deck;
  const due = node.counts.reviewCount + node.counts.learnCount;
  const fresh = node.counts.newCount;
  const href = `/today/deck/${d.id}` as const;
  const hasKids = node.children.length > 0;
  const collapsed = !!d.collapsed;
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: withSpring(collapsed ? '0deg' : '90deg', { damping: 16, stiffness: 220 }) }] }));

  const row = (
    <View style={[styles.row, { paddingLeft: 12 + node.depth * 22 }]}>
      <Pressable
        hitSlop={8}
        disabled={!hasKids}
        accessibilityLabel={hasKids ? (d.collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`) : undefined}
        onPress={() => {
          haptic.select();
          store.mutate(() => (d.collapsed = !d.collapsed));
        }}
        style={{ width: 16, alignItems: 'center' }}
      >
        {hasKids ? (
          <Animated.View style={chevron}>
            <ChevronRight size={14} color={t.c.faint} strokeWidth={2.4} />
          </Animated.View>
        ) : null}
      </Pressable>
      <Monogram name={node.name} size={node.depth ? 24 : 30} />
      <View style={[styles.body, { borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.c.line }]}>
        <T style={{ flex: 1, fontStyle: d.dyn ? 'italic' : 'normal' }} numberOfLines={1}>
          {node.name}
        </T>
        <T v="subhead" color={due ? 'revC' : 'faint'} style={[styles.num, t.mono]}>
          {due}
        </T>
        <T v="subhead" color={fresh ? 'newC' : 'faint'} style={[styles.num, t.mono]}>
          {fresh}
        </T>
      </View>
    </View>
  );

  const open = () => {
    store.mutate((c) => (c.d.prefs.currentDeck = d.id));
    router.push(href);
  };
  const actions = deckActions(d.id, node.name);

  if (Platform.OS === 'ios')
    return (
      <Link href={href} onPress={() => store.mutate((c) => (c.d.prefs.currentDeck = d.id))}>
        <Link.Trigger>
          <Pressable accessibilityRole="button" accessibilityLabel={`${node.name}, ${due} due, ${fresh} new`} style={({ pressed }) => ({ backgroundColor: pressed ? t.c.pill : 'transparent' })}>
            {row}
          </Pressable>
        </Link.Trigger>
        <Link.Preview />
        <Link.Menu>
          {actions.map((a) => (
            <Link.MenuAction key={a.title} title={a.title} icon={a.sf} destructive={a.destructive} onPress={a.onPress} />
          ))}
        </Link.Menu>
      </Link>
    );
  return (
    <Pressable
      testID={`deck-${node.name}`}
      accessibilityRole="button"
      accessibilityLabel={`${node.name}, ${due} due, ${fresh} new`}
      onPress={open}
      onLongPress={() => {
        haptic.firm();
        showActions(node.name, actions);
      }}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.c.pill : 'transparent' })}
    >
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingRight: 16, gap: 10 },
  num: { minWidth: 28, textAlign: 'right' },
});
