// Duolingo-style courses: Course → Unit → Lesson → Exercise.
// Courses are plain JSON so they can be written by hand, imported, or generated later.
// See docs/course-format.md for the format.

export interface VocabItem {
  word: string; // in the target language
  translation: string; // in the learner's language
  note?: string;
}

export type Exercise =
  /** Pick the right option. `answer` is the index into choices or the correct string. */
  | { type: "choice"; prompt: string; choices: string[]; answer: number | string; speak?: boolean }
  /** Translate a sentence by typing, or by tapping words when `wordBank` is given. */
  | { type: "translate"; prompt: string; answers: string[]; wordBank?: string[]; speak?: boolean }
  /** Match pairs (left in target language, right in learner's language). */
  | { type: "match"; pairs: [string, string][] }
  /** Hear the text (TTS) and type what you heard. */
  | { type: "listen"; text: string; answers?: string[] }
  /** Fill the blank (___) in a sentence, by typing or picking from `choices`. */
  | { type: "fill"; sentence: string; answers: string[]; choices?: string[]; translation?: string };

export interface Lesson {
  id: string;
  title: string;
  /** Words taught in this lesson. Used to auto-generate exercises and to add cards to a deck. */
  vocab?: VocabItem[];
  /** If omitted or empty, exercises are generated from `vocab`. */
  exercises?: Exercise[];
  /** Optional explanation shown before the lesson starts (HTML allowed). */
  tips?: string;
}

export interface Unit {
  id: string;
  title: string;
  description?: string;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  title: string;
  /** Language codes, e.g. "en" and "fr-FR". `targetLang` is used for text-to-speech. */
  sourceLang: string;
  targetLang: string;
  description?: string;
  units: Unit[];
}

export interface LessonResult {
  best: number; // best accuracy 0-1
  times: number;
  last: number; // epoch ms
}

export interface CourseProgress {
  xp: number;
  /** day numbers (local, rollover-adjusted) on which at least one lesson was finished */
  days: number[];
  lessons: Record<string, Record<string, LessonResult>>; // courseId -> lessonId -> result
}

export const emptyProgress = (): CourseProgress => ({ xp: 0, days: [], lessons: {} });

// ---------- answer checking ----------

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[.,!?¡¿;:"«»()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "correct", "accent" (right apart from accents), or "wrong". */
export function checkAnswer(given: string, answers: string[]): "correct" | "accent" | "wrong" {
  const g = normalize(given);
  if (!g) return "wrong";
  if (answers.some((a) => normalize(a) === g)) return "correct";
  if (answers.some((a) => stripAccents(normalize(a)) === stripAccents(g))) return "accent";
  return "wrong";
}

export function choiceAnswer(ex: Extract<Exercise, { type: "choice" }>): string {
  return typeof ex.answer === "number" ? ex.choices[ex.answer] : ex.answer;
}

// ---------- generation ----------

function shuffle<T>(arr: T[], rand = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build exercises from a vocab list (used when a lesson has no hand-written exercises). */
export function generateExercises(vocab: VocabItem[], distractorPool: VocabItem[] = [], rand = Math.random): Exercise[] {
  if (vocab.length === 0) return [];
  const pool = [...vocab, ...distractorPool.filter((p) => !vocab.some((v) => v.word === p.word))];
  const distract = (v: VocabItem, key: "word" | "translation") =>
    shuffle(
      pool.filter((p) => p[key] !== v[key]).map((p) => p[key]),
      rand,
    ).slice(0, 3);
  const out: Exercise[] = [];
  for (const v of vocab) {
    // target → source, multiple choice
    const c1 = shuffle([v.translation, ...distract(v, "translation")], rand);
    out.push({ type: "choice", prompt: v.word, choices: c1, answer: v.translation, speak: true });
  }
  if (vocab.length >= 2) out.push({ type: "match", pairs: shuffle(vocab, rand).slice(0, 5).map((v) => [v.word, v.translation]) });
  for (const v of vocab) {
    // source → target, multiple choice then typing
    const c2 = shuffle([v.word, ...distract(v, "word")], rand);
    out.push({ type: "choice", prompt: v.translation, choices: c2, answer: v.word });
  }
  for (const v of shuffle(vocab, rand).slice(0, 3)) out.push({ type: "listen", text: v.word });
  for (const v of shuffle(vocab, rand).slice(0, 3)) out.push({ type: "translate", prompt: v.translation, answers: [v.word] });
  return out;
}

export function lessonExercises(course: Course, lesson: Lesson, rand = Math.random): Exercise[] {
  if (lesson.exercises?.length) return lesson.exercises;
  const all = course.units.flatMap((u) => u.lessons.flatMap((l) => l.vocab ?? []));
  return generateExercises(lesson.vocab ?? [], all, rand);
}

// ---------- progress ----------

export function allLessons(course: Course): Lesson[] {
  return course.units.flatMap((u) => u.lessons);
}

/** A lesson is unlocked when it's the first one or the one before it has been completed. */
export function isUnlocked(course: Course, progress: CourseProgress, lessonId: string): boolean {
  const lessons = allLessons(course);
  const i = lessons.findIndex((l) => l.id === lessonId);
  if (i <= 0) return true;
  return !!progress.lessons[course.id]?.[lessons[i - 1].id];
}

export function streak(days: number[], today: number): number {
  const set = new Set(days);
  let d = set.has(today) ? today : today - 1; // streak survives until today ends
  let n = 0;
  while (set.has(d)) {
    n++;
    d--;
  }
  return n;
}

export function validateCourse(c: unknown): string | null {
  const x = c as Course;
  if (!x || typeof x !== "object") return "Not an object.";
  if (!x.id || !x.title) return "Course needs an id and a title.";
  if (!Array.isArray(x.units)) return "Course needs a units array.";
  const ids = new Set<string>();
  for (const u of x.units) {
    if (!u.id || !Array.isArray(u.lessons)) return `Unit "${u.title ?? "?"}" needs an id and lessons.`;
    for (const l of u.lessons) {
      if (!l.id) return `A lesson in unit "${u.title}" has no id.`;
      if (ids.has(l.id)) return `Duplicate lesson id "${l.id}".`;
      ids.add(l.id);
      if (!l.exercises?.length && !l.vocab?.length) return `Lesson "${l.title}" needs vocab or exercises.`;
    }
  }
  return null;
}

/** A tiny built-in course so the tab isn't empty. Replace with real data. */
export const SAMPLE_COURSE: Course = {
  id: "sample-fr",
  title: "French (sample)",
  sourceLang: "en",
  targetLang: "fr-FR",
  description: "A small demo course. Import your own courses as JSON.",
  units: [
    {
      id: "u1",
      title: "Basics",
      lessons: [
        {
          id: "u1l1",
          title: "Greetings",
          tips: "<p><b>Bonjour</b> is used during the day, <b>bonsoir</b> in the evening.</p>",
          vocab: [
            { word: "bonjour", translation: "hello" },
            { word: "bonsoir", translation: "good evening" },
            { word: "merci", translation: "thank you" },
            { word: "au revoir", translation: "goodbye" },
          ],
        },
        {
          id: "u1l2",
          title: "People",
          vocab: [
            { word: "un homme", translation: "a man" },
            { word: "une femme", translation: "a woman" },
            { word: "un garçon", translation: "a boy" },
            { word: "une fille", translation: "a girl" },
          ],
        },
        {
          id: "u1l3",
          title: "Sentences",
          exercises: [
            { type: "translate", prompt: "I am a man.", answers: ["Je suis un homme"], wordBank: ["Je", "suis", "un", "homme", "une", "femme"] },
            { type: "fill", sentence: "Je ___ une fille.", answers: ["suis"], choices: ["suis", "es", "est"], translation: "I am a girl." },
            { type: "choice", prompt: "Which one means “thank you”?", choices: ["merci", "bonjour", "bonsoir"], answer: 0 },
            { type: "listen", text: "Bonjour, je suis une femme.", answers: ["Bonjour je suis une femme"] },
            { type: "translate", prompt: "Goodbye and thank you!", answers: ["Au revoir et merci", "Merci et au revoir"] },
          ],
        },
      ],
    },
  ],
};
