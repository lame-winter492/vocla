// "Today": the home screen. One big number, one Start button, then the decks.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ALL_DECKS, type DeckTreeNode } from "../lib/col";
import { allLessons, isUnlocked, streak } from "../lib/courses";
import { store, useCol } from "../lib/store";
import { dayNumber, formatIvlSecs } from "../lib/time";
import { askConfirm, askText } from "./dialog";
import { useNav } from "./nav";
import { haptic } from "./haptics";
import { currentDesign, longPress } from "./motion";
import { RollingNumber } from "./RollingNumber";
import { GLYPH, Monogram } from "./icons";

// the number shown last time, so returning to Today rolls from the old count to the new one
let lastShownTotal: number | null = null;

export function DeckList() {
  const col = useCol();
  const { go, toast } = useNav();
  const tree = col.deckTree();
  const [menu, setMenu] = useState<number | null>(null);
  const [lifted, setLifted] = useState(false); // long-press context menu: row lifted above a blurred scrim
  const firedRef = useRef(false);
  const closeMenu = () => {
    setMenu(null);
    setLifted(false);
  };
  const roll = col.d.prefs.rolloverHour;
  const today = col.today();

  const all = col.counts(ALL_DECKS);
  const total = all.newCount + all.learnCount + all.reviewCount;
  const [shown, setShown] = useState(lastShownTotal ?? total);
  useEffect(() => {
    const t = setTimeout(() => setShown(total), lastShownTotal !== null && lastShownTotal !== total ? 350 : 0);
    lastShownTotal = total;
    return () => clearTimeout(t);
  }, [total]);

  // estimate from the last few hundred answers (8 s per card until there is history)
  const recent = col.d.revlog.filter((r) => r.ease > 0).slice(-300);
  const avgSecs = recent.length >= 20 ? recent.reduce((s, r) => s + r.time, 0) / recent.length / 1000 : 8;
  const minutes = Math.max(1, Math.round((total * avgSecs) / 60));

  const studyDays = new Set(col.d.revlog.filter((r) => r.ease > 0).map((r) => dayNumber(r.id, roll)));
  for (const d of col.d.courseProgress.days) studyDays.add(d);
  const days = streak([...studyDays], today);
  const doneToday = col.d.revlog.filter((r) => r.ease > 0 && dayNumber(r.id, roll) === today).length;
  const weekday = new Date().toLocaleDateString(undefined, { weekday: "long" });
  const nextLearn = col.nextLearnDue(ALL_DECKS);

  // courses with a lesson to do next (App Store-style rows below the decks); the first one can fill the hero
  const courseRows = Object.values(col.d.courses).flatMap((c) => {
    const lessons = allLessons(c);
    const done = lessons.filter((l) => col.d.courseProgress.lessons[c.id]?.[l.id]).length;
    const next = lessons.find((l) => !col.d.courseProgress.lessons[c.id]?.[l.id] && isUnlocked(c, col.d.courseProgress, l.id));
    return next ? [{ course: c, lesson: next, done, total: lessons.length }] : [];
  });
  const nextLesson = courseRows[0] ?? null;

  // Liquid Glass: the hero is an App Store "Today" card that shrinks under the finger and expands into the session
  const glass = currentDesign(col.d.prefs.design) === "glass";
  const heroAction: (() => void) | null =
    total > 0
      ? () => go({ name: "study", did: ALL_DECKS })
      : nextLesson
        ? () => go({ name: "lesson", courseId: nextLesson.course.id, lessonId: nextLesson.lesson.id })
        : null;
  const storyCard = glass && heroAction !== null;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const ring = doneToday + total > 0 ? doneToday / (doneToday + total) : 0;

  const createDeck = async () => {
    const name = await askText("New deck name (use :: for subdecks):");
    if (!name?.trim()) return;
    store.update("Add Deck", (c) => c.addDeck(name));
  };

  const rows: ReactNode[] = [];
  const walk = (nodes: DeckTreeNode[]) => {
    for (const n of nodes) {
      const d = n.deck;
      const due = n.counts.reviewCount + n.counts.learnCount;
      rows.push(
        <tr
          key={d.id}
          className={lifted && menu === d.id ? "lifted" : undefined}
          {...longPress(() => {
            firedRef.current = true;
            haptic("tap");
            setMenu(d.id);
            setLifted(true);
          })}
          onClickCapture={(e) => {
            // the release that ends a long press must not also open the deck
            if (firedRef.current) {
              firedRef.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <td style={{ paddingLeft: 4 + n.depth * 22 }}>
            {n.children.length > 0 ? (
              <a className="twisty" onClick={() => store.mutate(() => (d.collapsed = !d.collapsed))} aria-label={d.collapsed ? "Expand" : "Collapse"}>
                {d.collapsed ? "▸" : "▾"}
              </a>
            ) : (
              <span className="twisty" />
            )}
            <Monogram name={n.name} size={n.depth ? "sm" : undefined} />
            <a
              onClick={() => {
                store.mutate((c) => (c.d.prefs.currentDeck = d.id));
                go({ name: "overview", did: d.id });
              }}
              className={`deck-name${col.d.prefs.currentDeck === d.id ? " current" : ""}`}
              style={{ fontStyle: d.dyn ? "italic" : undefined }}
            >
              {n.name}
            </a>
          </td>
          <td className={`num${due ? " c-rev" : ""}`}>{due ? `${due} due` : <span className="zero">0 due</span>}</td>
          <td className={`num${n.counts.newCount ? " c-new" : ""}`}>{n.counts.newCount ? `${n.counts.newCount} new` : <span className="zero">0 new</span>}</td>
          <td style={{ position: "relative", width: 44, textAlign: "right", padding: "4px 0" }}>
            <button className="ghost icon" aria-label={`Actions for ${n.name}`} onClick={() => setMenu(menu === d.id ? null : d.id)}>
              ⋯
            </button>
            {menu === d.id && (
              <div className="menu" onMouseLeave={() => !lifted && setMenu(null)}>
                <button onClick={() => go({ name: "overview", did: d.id })}>
                  Open {GLYPH.open}
                </button>
                <button
                  onClick={async () => {
                    closeMenu();
                    const name = await askText("Rename deck:", d.name);
                    if (name)
                      try {
                        store.update("Rename Deck", (c) => c.renameDeck(d.id, name));
                      } catch (e) {
                        toast((e as Error).message);
                      }
                  }}
                >
                  Rename {GLYPH.rename}
                </button>
                <button onClick={() => go(d.dyn ? { name: "filtered", did: d.id } : { name: "options", did: d.id })}>
                  Options {GLYPH.options}
                </button>
                <button onClick={() => go({ name: "export", did: d.id })}>
                  Export {GLYPH.export}
                </button>
                <hr />
                <button
                  className="danger"
                  onClick={async () => {
                    closeMenu();
                    const sub = col.deckAndChildren(d.id);
                    const ids = new Set(sub.map((x) => x.id));
                    const cards = Object.values(col.d.cards).filter((c) => ids.has(c.did)).length;
                    if (await askConfirm(`Delete "${d.name}"${sub.length > 1 ? ` and ${sub.length - 1} subdecks` : ""}${d.dyn ? "" : ` with ${cards} cards`}?`)) {
                      store.update("Delete Deck", (c) => c.removeDeck(d.id));
                      toast("Deck deleted.");
                    }
                  }}
                >
                  Delete {GLYPH.trash}
                </button>
              </div>
            )}
          </td>
        </tr>,
      );
      if (!d.collapsed) walk(n.children);
    }
  };
  walk(tree);

  return (
    <div className="page today">
      {lifted && <div className="context-scrim" onClick={closeMenu} onContextMenu={(e) => (e.preventDefault(), closeMenu())} />}
      {/* App Store-style header: date above the large title, account-style button on the trailing edge */}
      <header className="title-row">
        <div className="eyebrow">{dateLabel}</div>
        <h1 className="large-title">Today</h1>
        <button
          className="streak-ring"
          style={{ ["--p" as string]: ring }}
          aria-label={`${days}-day streak, ${doneToday} reviewed today. Statistics`}
          onClick={() => go({ name: "stats" })}
        >
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle className="track" cx="20" cy="20" r="17" pathLength={1} />
            <circle className="fill" cx="20" cy="20" r="17" pathLength={1} />
          </svg>
          <span>{days}</span>
        </button>
      </header>
      <section
        className={`hero${storyCard ? " story hero-cta" : ""}`}
        aria-label="Today"
        onClick={(e) => {
          // the whole card is the button (App Store Today cards); inner buttons keep their own action
          if (storyCard && heroAction && !(e.target as HTMLElement).closest("button, a")) heroAction();
        }}
      >
        {glass && <div className="story-eyebrow">{total > 0 ? "Daily review" : nextLesson ? "Continue learning" : "All caught up"}</div>}
        <div className="muted hero-meta">
          <span className="hero-weekday">{weekday}</span>
          {days > 0 && <span>{days}-day streak</span>}
          {doneToday > 0 && <span>{doneToday} done</span>}
        </div>
        {total > 0 ? (
          <>
            <div className="big-number">
              <b>
                <RollingNumber value={shown} />
              </b>
              <span>{total === 1 ? "card for today" : "cards for today"}</span>
            </div>
            <div className="breakdown">
              {all.reviewCount} due · {all.learnCount} learning · {all.newCount} new · about {minutes} min
            </div>
            <button className={`primary big${storyCard ? "" : " hero-cta"}`} autoFocus onClick={heroAction!}>
              Start session →
            </button>
          </>
        ) : (
          <>
            <div className="big-number">
              <b>0</b>
              <span>cards left today</span>
            </div>
            <div className="breakdown">
              {nextLearn ? `Next learning card in ${formatIvlSecs(Math.max(0, (nextLearn - Date.now()) / 1000), false)}.` : "You're done for today."}
            </div>
            {nextLesson ? (
              <button className={`primary big${storyCard ? "" : " hero-cta"}`} onClick={heroAction!}>
                Continue course →
              </button>
            ) : (
              <button className="big" onClick={() => go({ name: "add" })}>
                Add cards
              </button>
            )}
          </>
        )}
      </section>

      <section>
        <div className="section-label">Decks</div>
        <table className="decklist">
          <tbody>{rows}</tbody>
        </table>
        <div className="row deck-actions">
          <button className="ghost" onClick={createDeck}>
            + New deck
          </button>
          <button className="ghost" onClick={() => go({ name: "filtered" })}>
            + Filtered deck
          </button>
          <button className="ghost" onClick={() => go({ name: "import" })}>
            Import
          </button>
        </div>
      </section>

      {courseRows.length > 0 && (
        <section className="shelf" aria-label="Courses">
          <div className="shelf-head">
            <h2>Courses</h2>
            <a onClick={() => go({ name: "courses" })}>See All</a>
          </div>
          <ul className="app-rows">
            {courseRows.map((r) => (
              <li key={r.course.id} className="app-row">
                <Monogram name={r.course.title} text={r.course.targetLang.slice(0, 2)} size="lg" />
                <a className="app-text" onClick={() => go({ name: "course", id: r.course.id })}>
                  <span className="app-title">{r.course.title}</span>
                  <span className="app-sub">
                    Next: {r.lesson.title} · {r.done}/{r.total}
                  </span>
                </a>
                <button className="get" onClick={() => go({ name: "lesson", courseId: r.course.id, lessonId: r.lesson.id })} aria-label={`${r.done ? "Resume" : "Start"} ${r.course.title}`}>
                  {r.done ? "Resume" : "Start"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
