// Today, laid out like the App Store's Today tab: the date over a large title with an account-style
// button, a card that expands into the study session, then the decks and the courses to continue.
import { BlurView } from 'expo-blur';
import { Link, router, Stack } from 'expo-router';
import { ArrowRight, Plus } from 'lucide-react-native';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ALL_DECKS } from '@core/col';
import { allLessons, isUnlocked, streak } from '@core/courses';
import { store, useCol } from '@core/store';
import { dayNumber, formatIvlSecs } from '@core/time';
import { roundedFont, useTheme } from '@/theme';
import { DeckRow } from '@/ui/DeckRow';
import { askText } from '@/ui/dialogs';
import { Button, Monogram, PressScale, T } from '@/ui/kit';
import { useNow } from '@/ui/useNow';
import { GlassCircle, Ring, RollingNumber } from '@/ui/widgets';

export default function Today() {
  const col = useCol();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const glass = t.design === 'glass';
  const now = useNow(15000);

  const all = col.counts(ALL_DECKS);
  const total = all.newCount + all.learnCount + all.reviewCount;
  const roll = col.d.prefs.rolloverHour;
  const today = col.today();
  const recent = col.d.revlog.filter((r) => r.ease > 0).slice(-300);
  const avgSecs = recent.length >= 20 ? recent.reduce((s, r) => s + r.time, 0) / recent.length / 1000 : 8;
  const minutes = Math.max(1, Math.round((total * avgSecs) / 60));
  const studyDays = new Set(col.d.revlog.filter((r) => r.ease > 0).map((r) => dayNumber(r.id, roll)));
  for (const d of col.d.courseProgress.days) studyDays.add(d);
  const days = streak([...studyDays], today);
  const doneToday = col.d.revlog.filter((r) => r.ease > 0 && dayNumber(r.id, roll) === today).length;
  const nextLearn = col.nextLearnDue(ALL_DECKS);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  const courseRows = Object.values(col.d.courses).flatMap((c) => {
    const lessons = allLessons(c);
    const done = lessons.filter((l) => col.d.courseProgress.lessons[c.id]?.[l.id]).length;
    const next = lessons.find((l) => !col.d.courseProgress.lessons[c.id]?.[l.id] && isUnlocked(c, col.d.courseProgress, l.id));
    return next ? [{ course: c, lesson: next, done, total: lessons.length }] : [];
  });
  const nextLesson = courseRows[0];
  const heroHref = total > 0 ? (`/study/${ALL_DECKS}` as const) : nextLesson ? (`/lesson/${nextLesson.course.id}/${nextLesson.lesson.id}` as const) : null;

  const tree = col.deckTree();
  const rows: { node: (typeof tree)[number] }[] = [];
  const walk = (nodes: typeof tree) => {
    for (const n of nodes) {
      rows.push({ node: n });
      if (!n.deck.collapsed) walk(n.children);
    }
  };
  walk(tree);

  const newDeck = async () => {
    const name = await askText('New deck', '', 'Name (use :: for subdecks)');
    if (name?.trim()) store.update('Add Deck', (c) => c.addDeck(name.trim()));
  };

  const card = (
    <View
      style={
        glass
          ? [styles.story, { backgroundColor: t.c.surface, shadowColor: '#000' }]
          : { paddingVertical: 8, gap: 2 }
      }
    >
      {glass ? (
        <T v="footnote" weight={600} color="accent" style={styles.caps}>
          {total > 0 ? 'Daily review' : nextLesson ? 'Continue learning' : 'All caught up'}
        </T>
      ) : (
        <T v="footnote" color="muted">
          {[new Date().toLocaleDateString(undefined, { weekday: 'long' }), days > 0 && `${days}-day streak`, doneToday > 0 && `${doneToday} done`].filter(Boolean).join(' · ')}
        </T>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
        <RollingNumber
          value={total}
          style={[
            glass ? { fontSize: 64, lineHeight: 72, fontWeight: '700', color: t.c.accent, ...roundedFont } : { fontSize: 92, lineHeight: 100, color: t.c.fg, ...t.font(600), letterSpacing: -4 },
          ]}
        />
        <T v={glass ? 'headline' : 'title3'} weight={glass ? 500 : 400} color={glass ? 'fg' : 'fg2'}>
          {total === 1 ? 'card for today' : total ? 'cards for today' : 'cards left today'}
        </T>
      </View>
      <T v="subhead" color="muted" style={[!glass && t.mono, { marginBottom: 14 }]}>
        {total > 0
          ? `${all.reviewCount} due · ${all.learnCount} learning · ${all.newCount} new · about ${minutes} min`
          : nextLearn
            ? `Next learning card in ${formatIvlSecs(Math.max(0, (nextLearn - now) / 1000), false)}.`
            : "You're done for today."}
      </T>
      {heroHref ? (
        // the whole card is the button; this is just its label
        <View pointerEvents="none">
          <Button
            title={total > 0 ? 'Start session' : 'Continue course'}
            kind="primary"
            size="lg"
            icon={<ArrowRight size={19} color={t.c.onAccent} strokeWidth={2.4} />}
            style={glass ? undefined : { alignSelf: 'flex-start' }}
          />
        </View>
      ) : (
        <Button title="Add cards" size="lg" onPress={() => router.push('/add')} style={glass ? undefined : { alignSelf: 'flex-start' }} />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 140 }} testID="today">
        {/* App Store header */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <T v="footnote" weight={600} color="muted" style={styles.caps}>
              {dateLabel}
            </T>
            <T v="largeTitle" accessibilityRole="header">
              Today
            </T>
          </View>
          <GlassCircle Icon={Plus} label="Add card" onPress={() => router.push('/add')} size={40} testID="add-card" />
          <PressScale onPress={() => router.push('/stats')} accessibilityRole="button" accessibilityLabel={`${days}-day streak, ${doneToday} reviewed today. Statistics`}>
            <Ring value={doneToday + total > 0 ? doneToday / (doneToday + total) : 0} size={40} track={glass ? t.c.pill : t.c.line}>
              <T v="subhead" weight={700} rounded style={t.mono}>
                {days}
              </T>
            </Ring>
          </PressScale>
        </View>

        {/* the Today card: shrinks under the finger and (on iOS) zooms into the session */}
        {heroHref ? (
          <Link href={heroHref} asChild>
            <Link.AppleZoom>
              <PressScale
                scaleTo={glass ? 0.965 : 0.98}
                accessibilityRole="button"
                accessibilityLabel={total > 0 ? `Start session, ${total} cards` : 'Continue course'}
                testID="start-session"
              >
                {card}
              </PressScale>
            </Link.AppleZoom>
          </Link>
        ) : (
          card
        )}

        {/* decks */}
        <View style={styles.sectionHead}>
          <T v="footnote" color="muted">
            Decks
          </T>
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <T v="caption" color="muted">
              Due
            </T>
            <T v="caption" color="muted">
              New
            </T>
          </View>
        </View>
        <View style={[styles.list, { backgroundColor: t.c.surface, borderRadius: glass ? 22 : t.radius.lg, borderWidth: glass ? 0 : StyleSheet.hairlineWidth, borderColor: t.c.line }]}>
          {rows.map(({ node }, i) => (
            <DeckRow key={node.deck.id} node={node} first={i === 0} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <Button title="New deck" kind="tinted" size="sm" onPress={newDeck} testID="new-deck" />
          <Button title="Import" kind="tinted" size="sm" onPress={() => router.push('/settings/data')} />
        </View>

        {/* courses: App Store app rows with a grey "Get"-style capsule */}
        {courseRows.length > 0 ? (
          <View style={{ marginTop: 32 }}>
            <View style={styles.shelfHead}>
              <T v="title2">Courses</T>
              <T color="accent" onPress={() => router.push('/courses')} accessibilityRole="link">
                See All
              </T>
            </View>
            {courseRows.map((r, i) => (
              <View key={r.course.id} style={styles.appRow}>
                <Monogram name={r.course.title} text={r.course.targetLang.slice(0, 2)} size={56} />
                <View style={[styles.appBody, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.c.line }]}>
                  <View style={{ flex: 1 }}>
                    <T numberOfLines={1} onPress={() => router.push(`/courses/${r.course.id}`)}>
                      {r.course.title}
                    </T>
                    <T v="footnote" color="muted" numberOfLines={1}>
                      Next: {r.lesson.title} · {r.done}/{r.total}
                    </T>
                  </View>
                  <Button title={r.done ? 'Resume' : 'Start'} kind="tinted" size="sm" onPress={() => router.push(`/lesson/${r.course.id}/${r.lesson.id}`)} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      {/* status bar scroll edge: content softens as it passes under the clock */}
      {Platform.OS !== 'android' ? (
        <BlurView intensity={glass ? 40 : 30} tint={t.dark ? 'dark' : 'light'} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caps: { textTransform: 'uppercase', letterSpacing: 0.2 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 18 },
  story: {
    borderRadius: 26,
    padding: 20,
    paddingBottom: 18,
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28, marginBottom: 6, paddingHorizontal: 16, paddingRight: 22 },
  list: { overflow: 'hidden' },
  shelfHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  appBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, alignSelf: 'stretch' },
});
