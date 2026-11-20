import { askConfirm, modalOpen } from "./dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  allLessons,
  checkAnswer,
  choiceAnswer,
  isUnlocked,
  lessonExercises,
  streak,
  validateCourse,
  type Course,
  type Exercise,
} from "../lib/courses";
import { download } from "../lib/importexport";
import { store, useCol } from "../lib/store";
import { useNav } from "./nav";
import { haptic } from "./haptics";
import { RollingNumber } from "./RollingNumber";
import { GLYPH } from "./icons";

const speak = (text: string, lang: string) => (window as any).voclaSpeak?.(text, lang);

// ---------- course list ----------

export function Courses() {
  const col = useCol();
  const { go, toast } = useNav();
  const courses = Object.values(col.d.courses);
  const p = col.d.courseProgress;

  const importFile = async (f: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await f.text());
    } catch {
      return toast("Invalid JSON.");
    }
    const list = (Array.isArray(data) ? data : [data]) as Course[];
    for (const c of list) {
      const err = validateCourse(c);
      if (err) return toast(`${c?.title ?? "Course"}: ${err}`);
    }
    store.update("Import Course", (cc) => list.forEach((c) => (cc.d.courses[c.id] = c)));
    toast(`Imported ${list.length} course${list.length > 1 ? "s" : ""}.`);
  };

  return (
    <div className="page narrow">
      <h2>Courses</h2>
      <p className="muted">
        <span className="xp">{p.xp} XP</span> · <span className="xp">{streak(p.days, col.today())}</span> day streak
      </p>
      {courses.length === 0 && <p>No courses yet. Import one below.</p>}
      <div className="course-list">
        {courses.map((c) => {
          const lessons = allLessons(c);
          const done = lessons.filter((l) => p.lessons[c.id]?.[l.id]).length;
          return (
            <div key={c.id} className="panel course-card">
              <div className="grow stack">
                <a onClick={() => go({ name: "course", id: c.id })} className="deck-name" style={{ fontSize: "var(--fs-lg)" }}>
                  {c.title}
                </a>
                {c.description && <div className="small muted">{c.description}</div>}
                <div className="row small muted">
                  <div className="meter" style={{ flex: 1, maxWidth: 240 }}>
                    <div style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }} />
                  </div>
                  <span className="mono">
                    {done}/{lessons.length}
                  </span>{" "}
                  lessons
                </div>
              </div>
              <div className="row">
                <button className="primary" onClick={() => go({ name: "course", id: c.id })}>
                  {done ? "Continue" : "Start"}
                </button>
                <button className="ghost" onClick={() => download(`${c.id}.course.json`, JSON.stringify(c, null, 2))}>
                  Export
                </button>
                <button
                  className="ghost danger"
                  onClick={async () => {
                    if (await askConfirm(`Delete course "${c.title}"? Your progress in it is removed too.`))
                      store.update("Delete Course", (cc) => {
                        delete cc.d.courses[c.id];
                        delete cc.d.courseProgress.lessons[c.id];
                      });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <h3>Import course</h3>
      <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      <p className="small muted">A JSON file with one course or an array of courses. The format is described in docs/course-format.md.</p>
    </div>
  );
}

// ---------- course path ----------

export function CourseView({ id }: { id: string }) {
  const col = useCol();
  const { go, toast } = useNav();
  const course = col.d.courses[id];
  const [tips, setTips] = useState<string | null>(null);
  if (!course) return <div className="page">Course not found.</div>;
  const prog = col.d.courseProgress;

  return (
    <div className="page narrow">
      <h2>{course.title}</h2>
      {course.units.map((u, ui) => (
        <section key={u.id} style={{ marginBottom: 20 }}>
          <h3>
            Unit {ui + 1}: {u.title}
          </h3>
          {u.description && <p className="muted small">{u.description}</p>}
          <table className="panel lessons">
            <tbody>
              {u.lessons.map((l) => {
                const res = prog.lessons[course.id]?.[l.id];
                const open = isUnlocked(course, prog, l.id);
                return (
                  <tr key={l.id}>
                    <td className={`lesson-state${res ? " done" : open ? "" : " locked"}`} aria-label={res ? "Done" : open ? "Open" : "Locked"}>
                      {res ? GLYPH.done : open ? GLYPH.todo : GLYPH.locked}
                    </td>
                    <td style={{ width: "100%" }} className={open ? "" : "muted"}>
                      {l.title}
                      {!open && <span className="small"> · locked</span>}
                    </td>
                    <td className="muted small mono" style={{ whiteSpace: "nowrap" }}>
                      {res ? `${Math.round(res.best * 100)}% · ${res.times}×` : ""}
                    </td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      {l.tips && (
                        <button className="ghost" onClick={() => setTips(tips === l.id ? null : l.id)}>
                          Tips
                        </button>
                      )}{" "}
                      <button
                        className={open && !res ? "primary hero-cta" : ""}
                        disabled={!open}
                        onClick={() => go({ name: "lesson", courseId: course.id, lessonId: l.id })}
                      >
                        {res ? "Practice" : "Start"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {u.lessons.map(
            (l) => tips === l.id && <div key={l.id} className="panel" style={{ padding: "12px 16px", marginTop: 8 }} dangerouslySetInnerHTML={{ __html: l.tips! }} />,
          )}
        </section>
      ))}
      <button
        onClick={() => {
          const vocab = allLessons(course).flatMap((l) => l.vocab ?? []);
          const n = store.update("Add Course Words", (c) => c.addVocabToDeck(course.title, vocab, `course::${course.id}`));
          toast(n ? `Added ${n} words to "Courses::${course.title}".` : "All words are already in your deck.");
        }}
      >
        Add all course words to a deck
      </button>
    </div>
  );
}

// ---------- lesson player ----------

type Result = "correct" | "accent" | "wrong";
interface Item {
  ex: Exercise;
  key: number;
  retry: boolean;
}

export function LessonPlayer({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const col = useCol();
  const { go, toast } = useNav();
  const course = col.d.courses[courseId];
  const lesson = course?.units.flatMap((u) => u.lessons).find((l) => l.id === lessonId);
  const initial = useMemo(() => (course && lesson ? lessonExercises(course, lesson) : []), [course, lesson]);
  const [queue, setQueue] = useState<Item[]>(() => initial.map((ex, i) => ({ ex, key: i, retry: false })));
  const [feedback, setFeedback] = useState<{ result: Result; correct: string } | null>(null);
  const [firstTry, setFirstTry] = useState(0);
  const [done, setDone] = useState<{ xp: number; accuracy: number } | null>(null);
  const nextKey = useRef(initial.length);

  if (!course || !lesson) return <div className="page">Lesson not found.</div>;
  const lang = course.targetLang;
  const total = initial.length;
  const finishedCount = total - queue.filter((q) => !q.retry).length;
  const cur = queue[0];

  const submit = (result: Result, correct: string) => {
    if (feedback) return;
    haptic(result === "wrong" ? "error" : "success");
    setFeedback({ result, correct });
    if (result !== "wrong" && !cur.retry) setFirstTry((n) => n + 1);
  };

  const cont = () => {
    if (!feedback) return;
    const rest = queue.slice(1);
    // wrong answers come back at the end, like Duolingo
    if (feedback.result === "wrong") rest.push({ ex: cur.ex, key: nextKey.current++, retry: true });
    setFeedback(null);
    if (rest.length === 0) {
      const accuracy = total ? firstTry / total : 1;
      const xp = store.update("Finish Lesson", (c) => c.completeLesson(courseId, lessonId, accuracy));
      setDone({ xp, accuracy });
    }
    setQueue(rest);
  };

  if (done) {
    return (
      <div className="page narrow overview lesson-done hero-cta">
        <AccuracyRing value={done.accuracy} />
        <h2>Lesson complete!</h2>
        <p className="xp" style={{ fontSize: "var(--fs-lg)" }}>
          +<CountUp to={done.xp} /> XP · {Math.round(done.accuracy * 100)}% accuracy
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="primary" autoFocus onClick={() => go({ name: "course", id: courseId })}>
            Continue
          </button>
          {lesson.vocab?.length ? (
            <button
              onClick={() => {
                const n = store.update("Add Lesson Words", (c) => c.addVocabToDeck(course.title, lesson.vocab!, `course::${course.id}`));
                toast(n ? `Added ${n} words to "Courses::${course.title}".` : "These words are already in your deck.");
              }}
            >
              Add {lesson.vocab.length} words to my deck
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!cur) return <div className="page">This lesson has no exercises.</div>;

  return (
    <div className="page narrow hero-cta">
      <div className="lesson-head">
        <button
          className="ghost"
          aria-label="Quit lesson"
          onClick={async () => (await askConfirm("Quit this lesson? Progress in it will be lost.")) && go({ name: "course", id: courseId })}
        >
          {GLYPH.close}
        </button>
        <div className="meter">
          <div style={{ width: `${(finishedCount / Math.max(1, total)) * 100}%` }} />
        </div>
      </div>
      {cur.retry && <div className="small muted">Previous mistake</div>}
      <ExerciseView key={cur.key} ex={cur.ex} lang={lang} locked={!!feedback} onSubmit={submit} />
      {feedback && <Feedback fb={feedback} onContinue={cont} />}
    </div>
  );
}

function Feedback({ fb, onContinue }: { fb: { result: Result; correct: string }; onContinue: () => void }) {
  const cb = useRef(onContinue);
  cb.current = onContinue;
  useEffect(() => {
    const mounted = performance.now();
    const h = (e: KeyboardEvent) => {
      // ignore the Enter that submitted the answer (it happened before this mounted)
      if (e.key === "Enter" && !e.repeat && e.timeStamp > mounted && !modalOpen()) {
        e.preventDefault();
        cb.current();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const ok = fb.result !== "wrong";
  return (
    <div className={`feedback ${ok ? "good" : "bad"}`}>
      <b className="fb-title">
        <svg className="fb-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {/* Lucide's check / x paths, drawn on with a stroke animation */}
          {ok ? <path className="draw" d="M20 6 9 17l-5-5" pathLength={1} /> : <path className="draw" d="M18 6 6 18M6 6l12 12" pathLength={1} />}
        </svg>
        {fb.result === "correct" ? "Correct!" : fb.result === "accent" ? "Almost. Watch the accents:" : "Correct answer:"}
      </b>
      {fb.result !== "correct" && fb.correct && <div>{fb.correct}</div>}
      <div className="row">
        <button className="primary" onClick={onContinue}>
          Continue <span className="kbd" style={{ color: "inherit", opacity: 0.75 }}>Enter</span>
        </button>
      </div>
    </div>
  );
}

// ---------- exercises ----------

interface ExProps {
  ex: Exercise;
  lang: string;
  locked: boolean;
  onSubmit: (r: Result, correct: string) => void;
}

function ExerciseView(props: ExProps) {
  switch (props.ex.type) {
    case "choice":
      return <ChoiceEx {...props} ex={props.ex} />;
    case "translate":
      return <TranslateEx {...props} ex={props.ex} />;
    case "match":
      return <MatchEx {...props} ex={props.ex} />;
    case "listen":
      return <ListenEx {...props} ex={props.ex} />;
    case "fill":
      return <FillEx {...props} ex={props.ex} />;
  }
}

function TextAnswer({ answers, locked, onSubmit, placeholder }: { answers: string[]; locked: boolean; onSubmit: ExProps["onSubmit"]; placeholder: string }) {
  const [v, setV] = useState("");
  const check = () => v.trim() && onSubmit(checkAnswer(v, answers), answers[0]);
  return (
    <div className="row">
      <input
        autoFocus
        style={{ flex: 1 }}
        value={v}
        readOnly={locked} // not disabled: a disabled focused input swallows the Enter that continues
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !locked) {
            e.preventDefault();
            e.stopPropagation();
            check();
          }
        }}
      />
      <button className="primary" disabled={locked || !v.trim()} onClick={check}>
        Check
      </button>
    </div>
  );
}

function ChoiceEx({ ex, lang, locked, onSubmit }: ExProps & { ex: Extract<Exercise, { type: "choice" }> }) {
  const [sel, setSel] = useState<number | null>(null);
  const correct = choiceAnswer(ex);
  useEffect(() => {
    if (ex.speak) speak(ex.prompt, lang);
  }, [ex, lang]);
  const check = () => sel !== null && onSubmit(ex.choices[sel] === correct ? "correct" : "wrong", correct);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (locked || modalOpen()) return;
      const n = Number(e.key);
      if (n >= 1 && n <= ex.choices.length) setSel(n - 1);
      else if (e.key === "Enter" && sel !== null) {
        e.preventDefault();
        check();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  return (
    <div>
      <h3>
        Select the correct meaning{" "}
        {ex.speak && (
          <button className="ghost icon" aria-label="Play audio" onClick={() => speak(ex.prompt, lang)}>
            {GLYPH.sound}
          </button>
        )}
      </h3>
      <p className="prompt-text">{ex.prompt}</p>
      <div className="options">
        {ex.choices.map((c, i) => (
          <button
            key={i}
            disabled={locked}
            className={`option${locked && ex.choices[i] === correct ? " correct" : locked && sel === i ? " wrong" : sel === i ? " selected" : ""}`}
            onClick={() => setSel(i)}
          >
            <span className="kbd">{i + 1}</span>&nbsp;&nbsp;{c}
          </button>
        ))}
      </div>
      {!locked && (
        <button className="primary" style={{ marginTop: 14 }} disabled={sel === null} onClick={check}>
          Check
        </button>
      )}
    </div>
  );
}

function WordBank({ words, locked, onSubmit, answers }: { words: string[]; locked: boolean; onSubmit: ExProps["onSubmit"]; answers: string[] }) {
  const tiles = useMemo(() => [...words].sort(() => Math.random() - 0.5), [words]);
  const [picked, setPicked] = useState<number[]>([]);
  const check = () => picked.length && onSubmit(checkAnswer(picked.map((i) => tiles[i]).join(" "), answers), answers[0]);
  return (
    <div>
      <div className="row answer-line">
        {picked.map((i, j) => (
          <button key={j} className="tile" disabled={locked} onClick={() => setPicked(picked.filter((_, k) => k !== j))}>
            {tiles[i]}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {tiles.map((t, i) => (
          <button key={i} className="tile" disabled={locked || picked.includes(i)} onClick={() => setPicked([...picked, i])} style={{ visibility: picked.includes(i) ? "hidden" : undefined }}>
            {t}
          </button>
        ))}
      </div>
      {!locked && (
        <button className="primary" style={{ marginTop: 14 }} disabled={!picked.length} onClick={check}>
          Check
        </button>
      )}
    </div>
  );
}

function TranslateEx({ ex, lang, locked, onSubmit }: ExProps & { ex: Extract<Exercise, { type: "translate" }> }) {
  useEffect(() => {
    if (ex.speak) speak(ex.prompt, lang);
  }, [ex, lang]);
  return (
    <div>
      <h3>Translate this sentence</h3>
      <p className="prompt-text">{ex.prompt}</p>
      {ex.wordBank?.length ? (
        <WordBank words={ex.wordBank} answers={ex.answers} locked={locked} onSubmit={onSubmit} />
      ) : (
        <TextAnswer answers={ex.answers} locked={locked} onSubmit={onSubmit} placeholder="Type the translation" />
      )}
    </div>
  );
}

function ListenEx({ ex, lang, locked, onSubmit }: ExProps & { ex: Extract<Exercise, { type: "listen" }> }) {
  useEffect(() => speak(ex.text, lang), [ex, lang]);
  return (
    <div>
      <h3>Type what you hear</h3>
      <p>
        <button className="big play-btn" onClick={() => speak(ex.text, lang)}>
          {GLYPH.sound} Play
        </button>
      </p>
      <TextAnswer answers={ex.answers?.length ? ex.answers : [ex.text]} locked={locked} onSubmit={onSubmit} placeholder="Type what you hear" />
    </div>
  );
}

function FillEx({ ex, locked, onSubmit }: ExProps & { ex: Extract<Exercise, { type: "fill" }> }) {
  const [before, after] = ex.sentence.split("___");
  return (
    <div>
      <h3>Fill in the blank</h3>
      {ex.translation && <p className="muted">{ex.translation}</p>}
      <p className="prompt-text">
        {before}
        <u>&nbsp;&nbsp;?&nbsp;&nbsp;</u>
        {after}
      </p>
      {ex.choices?.length ? (
        <div className="row">
          {ex.choices.map((c) => (
            <button key={c} className="tile" disabled={locked} onClick={() => onSubmit(checkAnswer(c, ex.answers), ex.answers[0])}>
              {c}
            </button>
          ))}
        </div>
      ) : (
        <TextAnswer answers={ex.answers} locked={locked} onSubmit={onSubmit} placeholder="Missing word" />
      )}
    </div>
  );
}

function MatchEx({ ex, lang, onSubmit }: ExProps & { ex: Extract<Exercise, { type: "match" }> }) {
  const left = useMemo(() => ex.pairs.map((p, i) => ({ t: p[0], i })).sort(() => Math.random() - 0.5), [ex]);
  const right = useMemo(() => ex.pairs.map((p, i) => ({ t: p[1], i })).sort(() => Math.random() - 0.5), [ex]);
  const [selL, setSelL] = useState<number | null>(null);
  const [selR, setSelR] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (selL === null || selR === null) return;
    if (selL === selR) {
      const m = new Set(matched).add(selL);
      setMatched(m);
      // finishing the board counts as done; mistakes are shown but don't send it back into the queue
      if (m.size === ex.pairs.length) onSubmit("correct", "");
    } else {
      setMistakes((n) => n + 1);
      setWrong(true);
      setTimeout(() => setWrong(false), 400);
    }
    setSelL(null);
    setSelR(null);
  }, [selL, selR]); // eslint-disable-line react-hooks/exhaustive-deps

  const btn = (side: "l" | "r", item: { t: string; i: number }) => {
    const sel = side === "l" ? selL : selR;
    const done = matched.has(item.i);
    return (
      <button
        key={item.i}
        disabled={done}
        className={`option${done ? " matched" : ""}${sel === item.i ? (wrong ? " wrong" : " selected") : ""}`}
        onClick={() => {
          if (side === "l") {
            speak(item.t, lang);
            setSelL(item.i);
          } else setSelR(item.i);
        }}
      >
        {item.t}
      </button>
    );
  };

  return (
    <div>
      <h3>Tap the matching pairs</h3>
      <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="options">{left.map((x) => btn("l", x))}</div>
        <div className="options">{right.map((x) => btn("r", x))}</div>
      </div>
      {mistakes > 0 && <p className="small muted">{mistakes} mistake{mistakes > 1 ? "s" : ""}</p>}
    </div>
  );
}

// ---------- lesson complete ----------

/** Activity-style ring that fills to the lesson's accuracy. */
function AccuracyRing({ value }: { value: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg className="acc-ring" width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`${Math.round(value * 100)}% accuracy`}>
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" className="ring-track" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="12"
        strokeLinecap="round"
        className="ring-fill"
        transform="rotate(-90 60 60)"
        style={{ strokeDasharray: c, strokeDashoffset: c * (1 - Math.max(0.02, value)), ["--c" as string]: c }}
      />
    </svg>
  );
}

/** Counts up from 0 with rolling digits once the screen has appeared. */
function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setV(to), 300);
    return () => clearTimeout(t);
  }, [to]);
  return <RollingNumber value={v} />;
}
