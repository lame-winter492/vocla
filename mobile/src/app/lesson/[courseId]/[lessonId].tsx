// A Duolingo-style lesson. Wrong answers come back at the end; finishing shows an accuracy ring that
// fills up and the XP counting up. Correct/incorrect use the success/error haptics.
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, CircleX, Volume2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkAnswer, choiceAnswer, lessonExercises, type Exercise } from '@core/courses';
import { store, useCol } from '@core/store';
import { useTheme } from '@/theme';
import { confirm, toast } from '@/ui/dialogs';
import { haptic, speak, stopSpeaking } from '@/ui/feedback';
import { shuffled } from '@/ui/useNow';
import { Button, PressScale, T } from '@/ui/kit';
import { Backdrop, Surface } from '@/ui/material';
import { GlassCircle, Ring, RollingNumber } from '@/ui/widgets';

type Result = 'correct' | 'accent' | 'wrong';
interface Item {
  ex: Exercise;
  key: number;
  retry: boolean;
}
type Submit = (r: Result, correct: string) => void;

export default function Lesson() {
  const { courseId, lessonId } = useLocalSearchParams<{ courseId: string; lessonId: string }>();
  const col = useCol();
  const insets = useSafeAreaInsets();
  const course = col.d.courses[courseId];
  const lesson = course?.units.flatMap((u) => u.lessons).find((l) => l.id === lessonId);
  const initial = useMemo(() => (course && lesson ? lessonExercises(course, lesson) : []), [course?.id, lesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [queue, setQueue] = useState<Item[]>(() => initial.map((ex, i) => ({ ex, key: i, retry: false })));
  const [feedback, setFeedback] = useState<{ result: Result; correct: string } | null>(null);
  const [firstTry, setFirstTry] = useState(0);
  const [done, setDone] = useState<{ xp: number; accuracy: number } | null>(null);
  const nextKey = useRef(initial.length);
  useEffect(() => () => stopSpeaking(), []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/courses'));
  if (!course || !lesson) return <T style={{ padding: 40 }}>Lesson not found.</T>;
  const lang = course.targetLang;
  const total = initial.length;
  const finished = total - queue.filter((q) => !q.retry).length;
  const cur = queue[0];

  const submit: Submit = (result, correct) => {
    if (feedback) return;
    if (result === 'wrong') haptic.error();
    else haptic.success();
    setFeedback({ result, correct });
    if (result !== 'wrong' && !cur.retry) setFirstTry((n) => n + 1);
  };

  const cont = () => {
    if (!feedback) return;
    const rest = queue.slice(1);
    if (feedback.result === 'wrong') rest.push({ ex: cur.ex, key: nextKey.current++, retry: true });
    setFeedback(null);
    if (rest.length === 0) {
      const accuracy = total ? firstTry / total : 1;
      const xp = store.update('Finish Lesson', (c) => c.completeLesson(course.id, lesson.id, accuracy));
      haptic.success();
      setDone({ xp, accuracy });
    }
    setQueue(rest);
  };

  if (done) return <Complete done={done} vocabCount={lesson.vocab?.length ?? 0} courseTitle={course.title} onClose={close} onAddWords={() => {
    const n = store.update('Add Lesson Words', (c) => c.addVocabToDeck(course.title, lesson.vocab ?? [], `course::${course.id}`));
    toast(n ? `Added ${n} words to "Courses::${course.title}"` : 'These words are already in your deck');
  }} />;
  if (!cur) return <T style={{ padding: 40 }}>This lesson has no exercises.</T>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <Backdrop />
      <View style={styles.head}>
        <GlassCircle
          Icon={X}
          label="Quit lesson"
          size={42}
          onPress={async () => (await confirm('Quit this lesson?', 'Progress in it will be lost.', 'Quit', true)) && close()}
        />
        <Meter value={total ? finished / total : 0} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
        {cur.retry ? (
          <T v="footnote" weight={600} color="hard" style={{ marginBottom: 8 }}>
            PREVIOUS MISTAKE
          </T>
        ) : null}
        <Animated.View key={cur.key} entering={FadeInDown.springify().damping(18)}>
          <ExerciseView ex={cur.ex} lang={lang} locked={!!feedback} onSubmit={submit} />
        </Animated.View>
      </ScrollView>
      {feedback ? <FeedbackPanel fb={feedback} onContinue={cont} bottom={insets.bottom} /> : null}
    </KeyboardAvoidingView>
  );
}

function Meter({ value }: { value: number }) {
  const t = useTheme();
  const w = useSharedValue(value);
  useEffect(() => {
    w.value = withSpring(value, { damping: 18, stiffness: 140 });
  }, [value, w]);
  const s = useAnimatedStyle(() => ({ width: `${Math.max(0.02, Math.min(1, w.value)) * 100}%` }));
  return (
    <View style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: t.c.pill, overflow: 'hidden' }} accessibilityRole="progressbar">
      <Animated.View style={[{ height: '100%', borderRadius: 6, backgroundColor: t.c.good }, s]} />
    </View>
  );
}

// ---------- exercises ----------
function ExerciseView(props: { ex: Exercise; lang: string; locked: boolean; onSubmit: Submit }) {
  switch (props.ex.type) {
    case 'choice':
      return <Choice {...props} ex={props.ex} />;
    case 'translate':
      return <Translate {...props} ex={props.ex} />;
    case 'match':
      return <Match {...props} ex={props.ex} />;
    case 'listen':
      return <Listen {...props} ex={props.ex} />;
    case 'fill':
      return <Fill {...props} ex={props.ex} />;
  }
}

function Heading({ children, onSpeak }: { children: string; onSpeak?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <T v="title3">{children}</T>
      {onSpeak ? (
        <Pressable onPress={onSpeak} accessibilityRole="button" accessibilityLabel="Play audio" hitSlop={10}>
          <Volume2 size={22} color={t.c.accent} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A tappable answer option that compresses on touch and shakes when wrong. */
function Option({ label, state, onPress, disabled, testID }: { label: string; state?: 'selected' | 'correct' | 'wrong' | 'matched'; onPress: () => void; disabled?: boolean; testID?: string }) {
  const t = useTheme();
  const x = useSharedValue(0);
  useEffect(() => {
    if (state === 'wrong') x.value = withSequence(withTiming(-8, { duration: 50 }), withTiming(7, { duration: 60 }), withTiming(-4, { duration: 60 }), withTiming(0, { duration: 60 }));
  }, [state, x]);
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const border = state === 'correct' ? t.c.good : state === 'wrong' ? t.c.again : state === 'selected' ? t.c.accent : t.c.line;
  return (
    <Animated.View style={[shake, state === 'matched' && { opacity: 0.35 }]}>
      <PressScale
        onPress={onPress}
        disabled={disabled}
        scaleTo={0.97}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: state === 'selected', disabled }}
        testID={testID}
        style={{ borderRadius: 20 }}
      >
        <Surface
          radius={20}
          interactive
          tint={state === 'correct' ? `${t.c.good}44` : state === 'wrong' ? `${t.c.again}44` : undefined}
          style={[{ minHeight: 56, justifyContent: 'center', paddingHorizontal: 18 }, state && state !== 'matched' ? { borderWidth: 2, borderColor: border } : null]}
        >
          <T>{label}</T>
        </Surface>
      </PressScale>
    </Animated.View>
  );
}

function Choice({ ex, lang, locked, onSubmit }: { ex: Extract<Exercise, { type: 'choice' }>; lang: string; locked: boolean; onSubmit: Submit }) {
  const [sel, setSel] = useState<number | null>(null);
  const correct = choiceAnswer(ex);
  useEffect(() => {
    if (ex.speak) speak(ex.prompt, lang);
  }, [ex, lang]);
  return (
    <View>
      <Heading onSpeak={ex.speak ? () => speak(ex.prompt, lang) : undefined}>Select the correct meaning</Heading>
      <T v="title1" style={{ marginBottom: 20 }}>
        {ex.prompt}
      </T>
      <View style={{ gap: 10 }}>
        {ex.choices.map((c, i) => (
          <Option
            key={i}
            label={c}
            testID={`option-${i}`}
            disabled={locked}
            state={locked && c === correct ? 'correct' : locked && sel === i ? 'wrong' : sel === i ? 'selected' : undefined}
            onPress={() => {
              haptic.select();
              setSel(i);
            }}
          />
        ))}
      </View>
      {!locked ? <Button title="Check" kind="primary" size="lg" disabled={sel === null} style={{ marginTop: 22 }} testID="check" onPress={() => sel !== null && onSubmit(ex.choices[sel] === correct ? 'correct' : 'wrong', correct)} /> : null}
    </View>
  );
}

function TextAnswer({ answers, locked, onSubmit, placeholder }: { answers: string[]; locked: boolean; onSubmit: Submit; placeholder: string }) {
  const t = useTheme();
  const [v, setV] = useState('');
  const check = () => v.trim() && onSubmit(checkAnswer(v, answers), answers[0]);
  return (
    <View style={{ gap: 14 }}>
      <TextInput
        autoFocus
        value={v}
        editable={!locked}
        onChangeText={setV}
        onSubmitEditing={check}
        placeholder={placeholder}
        placeholderTextColor={t.c.faint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel={placeholder}
        testID="answer-input"
        style={[{ minHeight: 54, borderRadius: 16, paddingHorizontal: 16, fontSize: 18, color: t.c.fg, backgroundColor: t.c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.c.line }, t.font(400)]}
      />
      {!locked ? <Button title="Check" kind="primary" size="lg" disabled={!v.trim()} onPress={check} testID="check" /> : null}
    </View>
  );
}

function WordBank({ words, answers, locked, onSubmit }: { words: string[]; answers: string[]; locked: boolean; onSubmit: Submit }) {
  const t = useTheme();
  const [tiles] = useState(() => shuffled(words));
  const [picked, setPicked] = useState<number[]>([]);
  const tile = (label: string, onPress: () => void, hidden = false, key?: string | number) => (
    <Animated.View key={key} entering={FadeIn.duration(140)} style={hidden ? { opacity: 0 } : undefined}>
      <PressScale
        onPress={onPress}
        disabled={locked || hidden}
        scaleTo={0.94}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: t.c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.c.line, borderBottomWidth: 3 }}
      >
        <T>{label}</T>
      </PressScale>
    </Animated.View>
  );
  return (
    <View style={{ gap: 18 }}>
      <View style={[styles.wrap, { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.c.line, paddingBottom: 10 }]}>
        {picked.map((i, j) => tile(tiles[i], () => setPicked(picked.filter((_, k) => k !== j)), false, `p${j}-${i}`))}
      </View>
      <View style={styles.wrap}>{tiles.map((w, i) => tile(w, () => (haptic.select(), setPicked([...picked, i])), picked.includes(i), `b${i}`))}</View>
      {!locked ? (
        <Button title="Check" kind="primary" size="lg" disabled={!picked.length} testID="check" onPress={() => onSubmit(checkAnswer(picked.map((i) => tiles[i]).join(' '), answers), answers[0])} />
      ) : null}
    </View>
  );
}

function Translate({ ex, lang, locked, onSubmit }: { ex: Extract<Exercise, { type: 'translate' }>; lang: string; locked: boolean; onSubmit: Submit }) {
  useEffect(() => {
    if (ex.speak) speak(ex.prompt, lang);
  }, [ex, lang]);
  return (
    <View>
      <Heading onSpeak={ex.speak ? () => speak(ex.prompt, lang) : undefined}>Translate this sentence</Heading>
      <T v="title2" weight={600} style={{ marginBottom: 20 }}>
        {ex.prompt}
      </T>
      {ex.wordBank?.length ? <WordBank words={ex.wordBank} answers={ex.answers} locked={locked} onSubmit={onSubmit} /> : <TextAnswer answers={ex.answers} locked={locked} onSubmit={onSubmit} placeholder="Type the translation" />}
    </View>
  );
}

function Listen({ ex, lang, locked, onSubmit }: { ex: Extract<Exercise, { type: 'listen' }>; lang: string; locked: boolean; onSubmit: Submit }) {
  const t = useTheme();
  useEffect(() => speak(ex.text, lang), [ex, lang]);
  return (
    <View>
      <Heading>Type what you hear</Heading>
      <PressScale
        onPress={() => speak(ex.text, lang)}
        accessibilityRole="button"
        accessibilityLabel="Play again"
        style={{ alignSelf: 'center', width: 96, height: 96, borderRadius: 48, backgroundColor: t.c.accent, alignItems: 'center', justifyContent: 'center', marginVertical: 18 }}
      >
        <Volume2 size={40} color={t.c.onAccent} strokeWidth={2} />
      </PressScale>
      <TextAnswer answers={ex.answers?.length ? ex.answers : [ex.text]} locked={locked} onSubmit={onSubmit} placeholder="Type what you hear" />
    </View>
  );
}

function Fill({ ex, locked, onSubmit }: { ex: Extract<Exercise, { type: 'fill' }>; lang: string; locked: boolean; onSubmit: Submit }) {
  const [before, after] = ex.sentence.split('___');
  return (
    <View>
      <Heading>Fill in the blank</Heading>
      {ex.translation ? (
        <T color="muted" style={{ marginBottom: 8 }}>
          {ex.translation}
        </T>
      ) : null}
      <T v="title2" weight={600} style={{ marginBottom: 20 }}>
        {before}
        <T v="title2" color="accent">
          {' ____ '}
        </T>
        {after}
      </T>
      {ex.choices?.length ? (
        <View style={styles.wrap}>
          {ex.choices.map((c) => (
            <Option key={c} label={c} disabled={locked} onPress={() => onSubmit(checkAnswer(c, ex.answers), ex.answers[0])} />
          ))}
        </View>
      ) : (
        <TextAnswer answers={ex.answers} locked={locked} onSubmit={onSubmit} placeholder="Missing word" />
      )}
    </View>
  );
}

function Match({ ex, lang, onSubmit }: { ex: Extract<Exercise, { type: 'match' }>; lang: string; locked: boolean; onSubmit: Submit }) {
  const [left] = useState(() => shuffled(ex.pairs.map((p, i) => ({ t: p[0], i }))));
  const [right] = useState(() => shuffled(ex.pairs.map((p, i) => ({ t: p[1], i }))));
  const [selL, setSelL] = useState<number | null>(null);
  const [selR, setSelR] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  // once one of each side is picked, check the pair right away
  const pick = (side: 'l' | 'r', i: number) => {
    const l = side === 'l' ? i : selL;
    const r = side === 'r' ? i : selR;
    if (l === null || r === null) {
      if (side === 'l') setSelL(i);
      else setSelR(i);
      return;
    }
    if (l === r) {
      const m = new Set(matched).add(l);
      setMatched(m);
      haptic.tap();
      if (m.size === ex.pairs.length) onSubmit('correct', '');
    } else {
      haptic.error();
      setMistakes((n) => n + 1);
      setWrong(r);
      setTimeout(() => setWrong(null), 450);
    }
    setSelL(null);
    setSelR(null);
  };
  const col = (items: { t: string; i: number }[], side: 'l' | 'r') => (
    <View style={{ flex: 1, gap: 10 }}>
      {items.map((it) => (
        <Option
          key={it.i}
          label={it.t}
          disabled={matched.has(it.i)}
          state={matched.has(it.i) ? 'matched' : side === 'r' && wrong === it.i ? 'wrong' : (side === 'l' ? selL : selR) === it.i ? 'selected' : undefined}
          onPress={() => {
            if (side === 'l') speak(it.t, lang);
            pick(side, it.i);
          }}
        />
      ))}
    </View>
  );
  return (
    <View>
      <Heading>Tap the matching pairs</Heading>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {col(left, 'l')}
        {col(right, 'r')}
      </View>
      {mistakes ? (
        <T v="footnote" color="muted" style={{ marginTop: 12 }}>
          {mistakes} mistake{mistakes > 1 ? 's' : ''}
        </T>
      ) : null}
    </View>
  );
}

// ---------- feedback and completion ----------
function FeedbackPanel({ fb, onContinue, bottom }: { fb: { result: Result; correct: string }; onContinue: () => void; bottom: number }) {
  const t = useTheme();
  const ok = fb.result !== 'wrong';
  const color = ok ? t.c.good : t.c.again;
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18).stiffness(200)}
      exiting={SlideOutDown.duration(160)}
      style={[styles.panel, { bottom: bottom + 8 }]}
      accessibilityLiveRegion="polite"
    >
     <Surface radius={32} content style={{ padding: 20, borderWidth: 2, borderColor: color }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon size={28} color={color} strokeWidth={2.4} />
        <T v="title3" color={color}>
          {fb.result === 'correct' ? 'Correct!' : fb.result === 'accent' ? 'Almost. Watch the accents:' : 'Correct answer:'}
        </T>
      </View>
      {fb.correct && fb.result !== 'correct' ? (
        <T v="headline" style={{ marginTop: 6 }}>
          {fb.correct}
        </T>
      ) : null}
      <Button title="Continue" kind="primary" size="lg" style={[{ marginTop: 16 }, { backgroundColor: color, shadowColor: color }]} onPress={onContinue} testID="continue" />
    </Surface>
    </Animated.View>
  );
}

function Complete({ done, vocabCount, courseTitle, onClose, onAddWords }: { done: { xp: number; accuracy: number }; vocabCount: number; courseTitle: string; onClose: () => void; onAddWords: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [xp, setXp] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setXp(done.xp), 450);
    return () => clearTimeout(id);
  }, [done.xp]);
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }}>
      <Backdrop />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }} accessibilityLabel={`Lesson complete. ${Math.round(done.accuracy * 100)}% accuracy, ${done.xp} XP`}>
        <Ring value={done.accuracy} size={150} stroke={16} color={t.c.good} delay={250}>
          <T v="title1" rounded>
            {Math.round(done.accuracy * 100)}%
          </T>
        </Ring>
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <T v="title1" style={{ marginTop: 18, textAlign: 'center' }}>
            Lesson complete!
          </T>
        </Animated.View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <T v="title3" color="hard">
            +
          </T>
          <RollingNumber value={xp} style={[{ fontSize: 22, lineHeight: 28, color: t.c.hard }, t.font(700)]} />
          <T v="title3" color="hard">
            {' '}XP
          </T>
        </View>
        <T color="muted">{courseTitle}</T>
      </View>
      <View style={{ gap: 10 }}>
        <Button title="Continue" kind="primary" size="lg" onPress={onClose} testID="lesson-continue" />
        {vocabCount ? <Button title={`Add ${vocabCount} words to my deck`} kind="tinted" onPress={onAddWords} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  panel: { position: 'absolute', left: 8, right: 8, borderRadius: 32, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
});
