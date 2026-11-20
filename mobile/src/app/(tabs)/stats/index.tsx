// Statistics, like the Health/Fitness summaries: today's numbers up top, retention as a ring, then charts
// (reviews per day, upcoming reviews) whose bars grow in, and how mature the collection is.
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';

import { streak } from '@core/courses';
import { useCol } from '@core/store';
import { dayNumber } from '@core/time';
import { CardType, Queue } from '@core/types';
import { roundedFont, useTheme } from '@/theme';
import { haptic } from '@/ui/feedback';
import { Screen, T } from '@/ui/kit';
import { Ring } from '@/ui/widgets';

const PERIODS = [
  { days: 30, label: '1 Month' },
  { days: 90, label: '3 Months' },
  { days: 365, label: '1 Year' },
];

export default function Stats() {
  const col = useCol();
  const t = useTheme();
  const [period, setPeriod] = useState(30);
  const today = col.today();
  const roll = col.d.prefs.rolloverHour;
  const cards = Object.values(col.d.cards);
  const logs = col.d.revlog.filter((r) => r.ease > 0);

  const todayLogs = logs.filter((r) => dayNumber(r.id, roll) === today);
  const todayMin = Math.round(todayLogs.reduce((s, r) => s + r.time, 0) / 60000);
  const todayAgain = todayLogs.filter((r) => r.ease === 1).length;
  const studyDays = new Set(logs.map((r) => dayNumber(r.id, roll)));
  for (const d of col.d.courseProgress.days) studyDays.add(d);
  const days = streak([...studyDays], today);

  // bucket long periods by week so the bars stay readable
  const bucket = period > 90 ? 7 : 1;
  const n = Math.ceil(period / bucket);
  const perDay = new Array(n).fill(0);
  for (const r of logs) {
    const ago = today - dayNumber(r.id, roll);
    if (ago >= 0 && ago < period) perDay[n - 1 - Math.floor(ago / bucket)]++;
  }
  const forecast = new Array(n).fill(0);
  for (const c of cards) {
    if (c.queue === Queue.Review || c.queue === Queue.DayLearn) {
      const d = Math.max(0, c.due - today);
      if (d < period) forecast[Math.floor(d / bucket)]++;
    } else if (c.queue === Queue.Learn) forecast[0]++;
  }
  const reviews = logs.filter((r) => r.type === 1 && dayNumber(r.id, roll) > today - period);
  const retention = reviews.length ? reviews.filter((r) => r.ease > 1).length / reviews.length : null;
  const counts = { New: 0, Learning: 0, Young: 0, Mature: 0, Suspended: 0 };
  for (const c of cards) {
    if (c.queue === Queue.Suspended) counts.Suspended++;
    else if (c.type === CardType.New) counts.New++;
    else if (c.type === CardType.Learn || c.type === CardType.Relearn) counts.Learning++;
    else if (c.ivl >= 21) counts.Mature++;
    else counts.Young++;
  }
  const countColors: Record<keyof typeof counts, string> = { New: t.c.newC, Learning: t.c.learnC, Young: t.c.good, Mature: t.dark ? '#1f8a46' : '#248a3d', Suspended: t.c.faint };

  const card = { backgroundColor: t.c.surface, borderRadius: t.design === 'glass' ? 22 : t.radius.lg, padding: 16, marginBottom: 16, borderWidth: t.design === 'glass' ? 0 : StyleSheet.hairlineWidth, borderColor: t.c.line };
  const big = [{ fontSize: 34, lineHeight: 40 }, t.design === 'glass' ? { fontWeight: '700' as const, ...roundedFont } : t.font(600)];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Statistics' }} />
      {/* today */}
      <View style={[card, { flexDirection: 'row', gap: 12 }]}>
        {[
          [todayLogs.length, 'cards today', t.c.accent],
          [todayMin, 'minutes', t.c.fg],
          [days, 'day streak', t.c.hard],
        ].map(([v, l, c]) => (
          <View key={l as string} style={{ flex: 1 }}>
            <T style={[...big, { color: c as string }]}>{v as number}</T>
            <T v="footnote" color="muted">
              {l as string}
            </T>
          </View>
        ))}
      </View>
      {todayLogs.length ? (
        <T v="footnote" color="muted" style={{ marginTop: -8, marginBottom: 16, marginHorizontal: 6 }}>
          {todayAgain} answered Again today ({Math.round((todayAgain / todayLogs.length) * 100)}%).
        </T>
      ) : null}

      {/* period */}
      <Segmented options={PERIODS.map((p) => p.label)} index={PERIODS.findIndex((p) => p.days === period)} onChange={(i) => setPeriod(PERIODS[i].days)} />

      {/* retention */}
      <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: 18 }]}>
        <Ring key={period} value={retention ?? 0} size={92} stroke={11} color={t.c.good}>
          <T v="headline" style={t.design === 'glass' ? roundedFont : undefined}>
            {retention === null ? '–' : `${Math.round(retention * 100)}%`}
          </T>
        </Ring>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="headline">True retention</T>
          <T v="footnote" color="muted">
            {retention === null
              ? 'Shows once you have reviewed cards that were due.'
              : `Of ${reviews.length} due reviews, ${Math.round(retention * 100)}% were remembered. The scheduler aims for ${Math.round(col.confFor(col.d.prefs.currentDeck).fsrs.desiredRetention * 100)}%.`}
          </T>
        </View>
      </View>

      <Chart key={`r${period}`} title="Reviews" note={bucket > 1 ? 'per week' : 'per day'} values={perDay} color={t.c.accent} style={card} right="today" />
      <Chart key={`f${period}`} title="Coming up" note={bucket > 1 ? 'per week' : 'per day'} values={forecast} color={t.c.revC} style={card} left="today" right={`in ${period} days`} />

      {/* card maturity */}
      <View style={card}>
        <T v="headline" style={{ marginBottom: 12 }}>
          Cards
        </T>
        <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: t.c.pill }}>
          {(Object.keys(counts) as (keyof typeof counts)[]).map((k) => (counts[k] ? <View key={k} style={{ flex: counts[k], backgroundColor: countColors[k] }} /> : null))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
          {(Object.keys(counts) as (keyof typeof counts)[]).map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: countColors[k] }} />
              <T v="footnote" color="fg2">
                {k} {counts[k]}
              </T>
            </View>
          ))}
        </View>
        <T v="caption" color="muted" style={{ marginTop: 10 }}>
          Young cards are due again within 3 weeks; mature cards after that.
        </T>
      </View>
    </Screen>
  );
}

/** iOS segmented control: the selected segment's background slides between options. */
function Segmented({ options, index, onChange }: { options: string[]; index: number; onChange: (i: number) => void }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const segW = w / options.length;
  useEffect(() => {
    x.value = withTiming(index * segW, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [index, segW, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width - 4)}
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: 2, borderRadius: 10, backgroundColor: t.c.pill, marginBottom: 16 }}
    >
      {w ? <Animated.View style={[{ position: 'absolute', top: 2, bottom: 2, left: 2, width: segW, borderRadius: 8, backgroundColor: t.design === 'glass' ? (t.dark ? '#636366' : '#ffffff') : t.c.raised, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }, thumb]} /> : null}
      {options.map((o, i) => (
        <Pressable
          key={o}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === index }}
          onPress={() => {
            haptic.select();
            onChange(i);
          }}
          style={{ flex: 1, paddingVertical: 7, alignItems: 'center' }}
        >
          <T v="footnote" weight={i === index ? 600 : 500}>
            {o}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

const CHART_H = 110;

function Bar({ v, max, color, p, i }: { v: number; max: number; color: string; p: SharedValue<number>; i: number }) {
  const s = useAnimatedStyle(() => {
    // bars grow left to right: each starts a little after the one before it
    const k = Math.max(0, Math.min(1, p.value * 1.6 - i * 0.012));
    return { height: Math.max(v ? 2 : 0, (v / max) * CHART_H * k) };
  });
  return (
    <View style={{ flex: 1, height: CHART_H, justifyContent: 'flex-end' }}>
      <Animated.View style={[{ backgroundColor: color, borderTopLeftRadius: 2, borderTopRightRadius: 2 }, s]} />
    </View>
  );
}

function Chart({ title, note, values, color, style, left, right }: { title: string; note: string; values: number[]; color: string; style: object; left?: string; right?: string }) {
  const t = useTheme();
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(120, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [p]);
  return (
    <View style={style} accessibilityLabel={`${title}: ${total} total`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <T v="headline">{title}</T>
        <T v="footnote" color="muted">
          {total} total · {note}
        </T>
      </View>
      <View style={{ flexDirection: 'row', gap: values.length > 40 ? 1 : 2, alignItems: 'flex-end' }}>
        {values.map((v, i) => (
          <Bar key={i} v={v} max={max} color={color} p={p} i={i} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.c.line, paddingTop: 4 }}>
        <T v="caption" color="muted">
          {left ?? ''}
        </T>
        <T v="caption" color="muted">
          {right ?? ''}
        </T>
      </View>
    </View>
  );
}
