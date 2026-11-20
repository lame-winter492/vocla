// "Today": the home screen. One big number, one Start button, then the decks.
import { useState, type ReactNode } from "react";
import { ALL_DECKS, type DeckTreeNode } from "../lib/col";
import { allLessons, isUnlocked, streak } from "../lib/courses";
import { store, useCol } from "../lib/store";
import { dayNumber, formatIvlSecs } from "../lib/time";
import { askConfirm, askText } from "./dialog";
import { useNav } from "./nav";

export function DeckList() {
  const col = useCol();
  const { go, toast } = useNav();
  const tree = col.deckTree();
  const [menu, setMenu] = useState<number | null>(null);
  const roll = col.d.prefs.rolloverHour;
  const today = col.today();

  const all = col.counts(ALL_DECKS);
  const total = all.newCount + all.learnCount + all.reviewCount;

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

  // the next course lesson to continue, if any
  const nextLesson = (() => {
    for (const c of Object.values(col.d.courses)) {
      const lessons = allLessons(c);
      const done = lessons.filter((l) => col.d.courseProgress.lessons[c.id]?.[l.id]).length;
      const next = lessons.find((l) => !col.d.courseProgress.lessons[c.id]?.[l.id] && isUnlocked(c, col.d.courseProgress, l.id));
      if (next) return { course: c, lesson: next, done, total: lessons.length };
    }
    return null;
  })();

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
        <tr key={d.id}>
          <td style={{ paddingLeft: 4 + n.depth * 22 }}>
            {n.children.length > 0 ? (
              <a className="twisty" onClick={() => store.mutate(() => (d.collapsed = !d.collapsed))} aria-label={d.collapsed ? "Expand" : "Collapse"}>
                {d.collapsed ? "▸" : "▾"}
              </a>
            ) : (
              <span className="twisty" />
            )}
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
              <div className="menu" onMouseLeave={() => setMenu(null)}>
                <button onClick={() => go({ name: "overview", did: d.id })}>Open</button>
                <button
                  onClick={async () => {
                    setMenu(null);
                    const name = await askText("Rename deck:", d.name);
                    if (name)
                      try {
                        store.update("Rename Deck", (c) => c.renameDeck(d.id, name));
                      } catch (e) {
                        toast((e as Error).message);
                      }
                  }}
                >
                  Rename
                </button>
                <button onClick={() => go(d.dyn ? { name: "filtered", did: d.id } : { name: "options", did: d.id })}>Options</button>
                <button onClick={() => go({ name: "export", did: d.id })}>Export</button>
                <hr />
                <button
                  className="danger"
                  onClick={async () => {
                    setMenu(null);
                    const sub = col.deckAndChildren(d.id);
                    const ids = new Set(sub.map((x) => x.id));
                    const cards = Object.values(col.d.cards).filter((c) => ids.has(c.did)).length;
                    if (await askConfirm(`Delete "${d.name}"${sub.length > 1 ? ` and ${sub.length - 1} subdecks` : ""}${d.dyn ? "" : ` with ${cards} cards`}?`)) {
                      store.update("Delete Deck", (c) => c.removeDeck(d.id));
                      toast("Deck deleted.");
                    }
                  }}
                >
                  Delete
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
      <section className="hero" aria-label="Today">
        <div className="muted">
          {weekday}
          {days > 0 && ` · ${days}-day streak`}
          {doneToday > 0 && ` · ${doneToday} done`}
        </div>
        {total > 0 ? (
          <>
            <div className="big-number">
              <b>{total}</b>
              <span>{total === 1 ? "card for today" : "cards for today"}</span>
            </div>
            <div className="breakdown">
              {all.reviewCount} due · {all.learnCount} learning · {all.newCount} new · about {minutes} min
            </div>
            <button className="primary big" autoFocus onClick={() => go({ name: "study", did: ALL_DECKS })}>
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
              <button
                className="primary big"
                onClick={() => go({ name: "lesson", courseId: nextLesson.course.id, lessonId: nextLesson.lesson.id })}
              >
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
          {nextLesson && (
            <tbody>
              <tr>
                <td>
                  <span className="twisty" />
                  <a className="deck-name" onClick={() => go({ name: "lesson", courseId: nextLesson.course.id, lessonId: nextLesson.lesson.id })}>
                    {nextLesson.course.title}
                  </a>
                  <span className="muted"> · next: {nextLesson.lesson.title}</span>
                </td>
                <td className="num" style={{ color: "var(--accent)" }}>
                  {nextLesson.done}/{nextLesson.total}
                </td>
                <td className="num muted">course</td>
                <td />
              </tr>
            </tbody>
          )}
        </table>
        <div className="row" style={{ marginTop: 16 }}>
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
    </div>
  );
}
