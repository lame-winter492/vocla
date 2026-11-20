// The reviewer. Tap the card to see the answer, then swipe right for Good or left for Again (or use the
// buttons). The card follows the finger, a stamp fades in as you pass the threshold (with a haptic tick),
// and on release it flies off while the next card springs up. Every answer is one light impact.
import { router, useLocalSearchParams } from 'expo-router';
import { Ellipsis, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ALL_DECKS, type QueuedCard } from '@core/col';
import { store, useCol } from '@core/store';
import { formatIvlSecs } from '@core/time';
import type { Ease } from '@core/types';
import { roundedFont, useTheme } from '@/theme';
import { CardView, type CardViewHandle } from '@/ui/card/CardView';
import type { CardContent, CardMessage } from '@/ui/card/cardDoc';
import { confirm, showActions, toast } from '@/ui/dialogs';
import { haptic, speakAll, stopSpeaking } from '@/ui/feedback';
import { Button, PressScale, T } from '@/ui/kit';
import { GlassCircle, RollingNumber } from '@/ui/widgets';

const SWIPE = 96;
const SPRING = { damping: 17, stiffness: 210, mass: 0.8 };
const LABELS = ['Again', 'Hard', 'Good', 'Easy'];

export default function Study() {
  const { did: didParam } = useLocalSearchParams<{ did: string }>();
  const did = Number(didParam ?? ALL_DECKS);
  const col = useCol();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const glass = t.design === 'glass';

  const [current, setCurrent] = useState<QueuedCard | null>(() => store.col.getNextCard(did));
  const [showAnswer, setShowAnswer] = useState(false);
  const [typedAtReveal, setTypedAtReveal] = useState<string | undefined>(undefined);
  const [answered, setAnswered] = useState(0);
  const [started, setStarted] = useState(Date.now());
  const [, tick] = useState(0);
  const typed = useRef<string | undefined>(undefined);
  const lastCid = useRef<number | undefined>(undefined);
  const busy = useRef(false); // a card is flying off
  const cardView = useRef<CardViewHandle>(null);

  const next = useCallback(() => {
    const q = store.col.getNextCard(did, lastCid.current);
    setCurrent(q);
    setShowAnswer(false);
    setTypedAtReveal(undefined);
    typed.current = undefined;
    setStarted(Date.now());
    return q;
  }, [did]);

  useEffect(() => {
    if (did !== ALL_DECKS) store.mutate((c) => (c.d.prefs.currentDeck = did));
    return () => stopSpeaking();
  }, [did]);

  // learning cards come due while you wait on the "done" screen; also drives the timer
  const done = current === null;
  useEffect(() => {
    const iv = setInterval(() => {
      if (done && store.col.getNextCard(did)) next();
      tick((x) => x + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, [done, did, next]);
  useEffect(() => {
    if (done && answered > 0) haptic.success(); // finishing is a completed task
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = current ? col.d.cards[current.card.id] : undefined;
  const note = card ? col.d.notes[card.nid] : undefined;
  const conf = card ? col.confForCard(card) : col.confFor(did);

  const content: CardContent | null = useMemo(() => {
    if (!card) return null;
    const { q, a, css } = store.col.renderCard(card, typedAtReveal);
    return {
      html: showAnswer ? a : q,
      css,
      cardClass: `card card${card.ord + 1}${t.dark ? ' nightMode night_mode' : ''}`,
      autoplay: conf.autoplay,
      reveal: showAnswer,
    };
    // note.mod: an edited note re-renders
  }, [card?.id, showAnswer, typedAtReveal, note?.mod, t.dark, conf.autoplay]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- card motion ----------
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const op = useSharedValue(1);
  const armed = useSharedValue(0);

  const enter = () => {
    // the next card rises in from just below
    tx.value = 0;
    ty.value = 28;
    sc.value = 0.97;
    op.value = 0;
    ty.value = withSpring(0, SPRING);
    sc.value = withSpring(1, SPRING);
    op.value = withTiming(1, { duration: 180 });
  };

  const advance = () => {
    busy.current = false;
    setAnswered((n) => n + 1);
    next();
    enter();
  };

  const answer = (ease: Ease, fromSwipe = false) => {
    if (!card || !showAnswer || busy.current) return;
    busy.current = true;
    haptic.tap(); // one consistent impact for every answer
    const { leech } = store.update('Review', (c) => c.answer(card.id, ease, Date.now() - started));
    if (leech)
      toast(conf.lapse.leechAction === 'suspend' ? 'This card keeps slipping, so it was suspended.' : 'This card keeps slipping (tagged leech).');
    lastCid.current = card.id;
    stopSpeaking();
    // the answered card leaves in the direction of the answer: Again to the left, the rest to the right
    const dir = ease === 1 ? -1 : 1;
    const target = dir * W * 1.25;
    if (!fromSwipe) ty.value = withTiming(-12, { duration: 220 });
    tx.value = withTiming(target, { duration: fromSwipe ? 200 : 260, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) scheduleOnRN(advance);
    });
  };

  const reveal = () => {
    if (!card || showAnswer || busy.current) return;
    setTypedAtReveal(typed.current);
    setShowAnswer(true);
  };

  const pan = usePanGesture({
    enabled: showAnswer,
    activeOffsetX: [-12, 12],
    failOffsetY: [-18, 18],
    onUpdate: (e) => {
      'worklet';
      tx.value = e.translationX;
      ty.value = e.translationY * 0.15;
      const past = Math.abs(e.translationX) >= SWIPE ? 1 : 0;
      if (past !== armed.value) {
        armed.value = past;
        if (past) scheduleOnRN(haptic.select); // crossing the threshold
      }
    },
    onDeactivate: (e) => {
      'worklet';
      armed.value = 0;
      const x = e.translationX + e.velocityX * 0.12; // a quick flick counts
      if (x >= SWIPE) scheduleOnRN(answer, 3 as Ease, true);
      else if (x <= -SWIPE) scheduleOnRN(answer, 1 as Ease, true);
      else {
        tx.value = withSpring(0, SPRING);
        ty.value = withSpring(0, SPRING);
      }
    },
  });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${(tx.value / W) * 14}deg` }, { scale: sc.value }],
  }));
  const goodStamp = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [24, SWIPE], [0, 1], 'clamp') }));
  const againStamp = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [-SWIPE, -24], [1, 0], 'clamp') }));

  // ---------- keyboard (web, iPad keyboards) ----------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') return close();
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      return showAnswer ? answer(3) : reveal();
    }
    if (showAnswer && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) as Ease);
  };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const onCardMessage = (m: CardMessage) => {
    if (m.type === 'tap') reveal();
    else if (m.type === 'enter') reveal();
    else if (m.type === 'typed') typed.current = m.value;
    else if (m.type === 'speak') speakAll(m.items);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/today'));

  const undo = () => {
    const l = store.undo();
    if (!l) return;
    toast(`Undo: ${l}`);
    if (l === 'Review') setAnswered((n) => Math.max(0, n - 1));
    lastCid.current = undefined;
    next();
    enter();
  };

  const noteAction = (label: string, fn: () => void, msg: string) => {
    store.update(label, fn);
    toast(msg, { label: 'Undo', onPress: undo });
    lastCid.current = card?.id;
    next();
    enter();
  };

  const tools = () => {
    if (!card || !note) return;
    const marked = note.tags.some((x) => x.toLowerCase() === 'marked');
    showActions(undefined, [
      { title: 'Edit Note', onPress: () => router.push(`/note/${card.nid}`) },
      { title: marked ? 'Unmark' : 'Mark', onPress: () => store.update('Mark', (c) => c.toggleMark([card.nid])) },
      { title: card.flags ? 'Remove Flag' : 'Flag Red', onPress: () => store.update('Flag', (c) => c.setFlag([card.id], card.flags ? 0 : 1)) },
      { title: 'Replay Audio', onPress: () => cardView.current?.replay() },
      { title: 'Bury Card', onPress: () => noteAction('Bury', () => store.col.buryCards([card.id]), 'Card buried until tomorrow') },
      { title: 'Suspend Card', onPress: () => noteAction('Suspend', () => store.col.suspendCards([card.id]), 'Card suspended') },
      ...(store.undoLabel() ? [{ title: `Undo ${store.undoLabel()}`, onPress: undo }] : []),
      {
        title: 'Delete Note',
        destructive: true,
        onPress: async () => {
          if (await confirm('Delete this note?', 'All of its cards are deleted too.', 'Delete', true))
            noteAction('Delete Note', () => store.col.removeNotes([card.nid]), 'Note deleted');
        },
      },
    ]);
  };

  // ---------- done ----------
  if (!card || !content) {
    const nextLearn = col.nextLearnDue(did);
    return (
      <View style={[styles.fill, { backgroundColor: t.c.bg, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.head, { paddingHorizontal: 16 }]}>
          <GlassCircle Icon={X} label="Close" onPress={close} size={42} testID="close-study" />
        </View>
        <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 8 }}>
          <T v="subhead" color="muted">
            {answered > 0 ? `${answered} card${answered === 1 ? '' : 's'} reviewed this session` : 'Nothing to study here right now'}
          </T>
          <T style={[{ fontSize: 56, lineHeight: 62 }, glass ? { fontWeight: '700', ...roundedFont, color: t.c.accent } : { ...t.font(600), letterSpacing: -2 }]}>
            Done
          </T>
          <T v="title3" weight={400} color="fg2">
            for now
          </T>
          {nextLearn ? (
            <T v="subhead" color="muted" style={{ marginTop: 6 }}>
              Next learning card in {formatIvlSecs(Math.max(0, (nextLearn - Date.now()) / 1000), false)}. This screen picks it up automatically.
            </T>
          ) : null}
        </Animated.View>
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <Button title="Back to Today" kind="primary" size="lg" onPress={close} />
          {store.undoLabel() === 'Review' ? <Button title="Undo Last Answer" kind="ghost" onPress={undo} /> : null}
        </View>
      </View>
    );
  }

  const counts = col.studyCounts(did);
  const remaining = counts.newCount + counts.learnCount + counts.reviewCount;
  const sessionTotal = answered + remaining;
  const ivls = showAnswer ? col.nextIntervals(card) : null;
  const marked = note?.tags.some((x) => x.toLowerCase() === 'marked');
  const deckName = col.deck(card.odid || card.did)?.name ?? '';
  const easeColor = [t.c.again, t.c.hard, t.c.good, t.c.easy];

  return (
    <View style={[styles.fill, { backgroundColor: t.c.bg, paddingTop: insets.top + 8 }]} testID="reviewer">
      {/* header: close, progress, count, tools */}
      <View style={[styles.head, { paddingHorizontal: 14 }]}>
        <GlassCircle Icon={X} label="End session" onPress={close} size={42} testID="close-study" />
        <Progress value={sessionTotal ? answered / sessionTotal : 0} />
        <View style={{ flexDirection: 'row' }} accessibilityLabel={`${answered} of ${sessionTotal}`}>
          <RollingNumber value={answered} style={[styles.count, { color: t.c.muted }, t.mono]} />
          <T v="subhead" color="muted" style={t.mono}>
            /
          </T>
          <RollingNumber value={sessionTotal} style={[styles.count, { color: t.c.muted }, t.mono]} />
        </View>
        <GlassCircle Icon={Ellipsis} label="Card actions" onPress={tools} size={42} testID="card-actions" />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 22, marginTop: 8 }}>
        <T v="caption" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {deckName}
        </T>
        {marked ? (
          <T v="caption" color="hard">
            ★ marked
          </T>
        ) : null}
        {card.flags > 0 ? (
          <T v="caption" color="again">
            ⚑ flag {card.flags}
          </T>
        ) : null}
        <View style={{ flex: 1 }} />
        {conf.showTimer ? (
          <T v="caption" color="muted" style={t.mono}>
            {Math.min(Math.floor((Date.now() - started) / 1000), conf.maxAnswerSecs)}s
          </T>
        ) : null}
      </View>

      {/* the card */}
      <View style={styles.cardArea}>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.card,
              glass
                ? { backgroundColor: t.c.surface, shadowColor: '#000', borderRadius: 30 }
                : { backgroundColor: 'transparent' },
              cardStyle,
            ]}
          >
            <CardView ref={cardView} content={content} onMessage={onCardMessage} style={{ borderRadius: glass ? 30 : 0 }} />
            <Animated.View pointerEvents="none" style={[styles.stamp, styles.stampGood, { borderColor: t.c.good }, goodStamp]}>
              <T v="headline" weight={700} color="good">
                Good
              </T>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.stamp, styles.stampAgain, { borderColor: t.c.again }, againStamp]}>
              <T v="headline" weight={700} color="again">
                Again
              </T>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* bottom bar: same height whether it shows "Show Answer" or the four answers, so nothing jumps */}
      <View style={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 10, gap: 8 }}>
        {col.d.prefs.showRemaining ? (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityLabel="Remaining: new, learning, review">
            {[
              [counts.newCount, t.c.newC, 'new'],
              [counts.learnCount, t.c.learnC, 'learn'],
              [counts.reviewCount, t.c.revC, 'review'],
            ].map(([n, c, k], i) => (
              <T key={k as string} v="footnote" style={[t.mono, { color: c as string, textDecorationLine: current?.kind === k ? 'underline' : 'none' }]}>
                {i > 0 ? '·  ' : ''}
                {n as number}
              </T>
            ))}
          </View>
        ) : null}
        <View style={{ height: 66 }}>
          {!showAnswer ? (
            <Animated.View key="show" exiting={FadeOut.duration(120)} style={{ flex: 1, justifyContent: 'center' }}>
              <Button title="Show Answer" kind="primary" size="lg" onPress={reveal} testID="show-answer" />
            </Animated.View>
          ) : (
            <View key="answers" style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
              {([1, 2, 3, 4] as Ease[]).map((e, i) => (
                <Animated.View key={e} entering={FadeInDown.delay(i * 28).springify().damping(16).stiffness(240)} style={{ flex: 1 }}>
                  <PressScale
                    scaleTo={0.93}
                    onPress={() => answer(e)}
                    accessibilityRole="button"
                    accessibilityLabel={`${LABELS[e - 1]}${ivls ? `, ${formatIvlSecs(ivls[e])}` : ''}`}
                    testID={`ease-${e}`}
                    style={[
                      styles.ease,
                      glass
                        ? { backgroundColor: t.c.surface, borderRadius: 22, shadowColor: '#000', borderWidth: e === 3 ? 2 : 0, borderColor: t.c.good }
                        : { backgroundColor: t.c.surface, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: e === 3 ? t.c.accent : t.c.line },
                    ]}
                  >
                    <T v="callout" weight={600} color={glass ? easeColor[e - 1] : 'fg'}>
                      {LABELS[e - 1]}
                    </T>
                    {col.d.prefs.showIntervalsOnButtons && ivls ? (
                      <T v="caption" color="muted" style={t.mono}>
                        {ivls[e] === 0 ? 'end' : formatIvlSecs(ivls[e])}
                      </T>
                    ) : null}
                  </PressScale>
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/** Session progress: a thin bar that springs to its new length. */
function Progress({ value }: { value: number }) {
  const t = useTheme();
  const w = useSharedValue(value);
  useEffect(() => {
    w.value = withSpring(value, { damping: 20, stiffness: 160 });
  }, [value, w]);
  const s = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, w.value)) * 100}%` }));
  return (
    <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: t.c.pill, overflow: 'hidden' }} accessibilityRole="progressbar">
      <Animated.View style={[{ height: '100%', borderRadius: 3, backgroundColor: t.c.accent }, s]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  count: { fontSize: 15, lineHeight: 20 },
  cardArea: { flex: 1, paddingHorizontal: 16, paddingVertical: 14 },
  card: { flex: 1, overflow: 'visible', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 3 },
  stamp: { position: 'absolute', top: 22, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, borderWidth: 2.5 },
  stampGood: { left: 22, transform: [{ rotate: '-8deg' }] },
  stampAgain: { right: 22, transform: [{ rotate: '8deg' }] },
  ease: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
});
