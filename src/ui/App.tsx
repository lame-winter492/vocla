import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { store, useCol } from "../lib/store";
import { AddNote } from "./AddNote";
import { Browser } from "./Browser";
import { Courses, CourseView, LessonPlayer } from "./Courses";
import { CustomStudy } from "./CustomStudy";
import { DialogHost, modalOpen } from "./dialog";
import { DeckList } from "./DeckList";
import { DeckOptions } from "./DeckOptions";
import { ExportPage, ImportPage } from "./ImportExport";
import { FilteredDeck } from "./FilteredDeck";
import { Nav, type Route } from "./nav";
import { NoteTypes } from "./NoteTypes";
import { Overview } from "./Overview";
import { Prefs } from "./Prefs";
import { Stats } from "./Stats";
import { Study } from "./Study";

/** Which design to show: the saved preference, else a page-level default (the iOS preview sets one), else Focus. */
export function currentDesign(pref?: "focus" | "glass"): "focus" | "glass" {
  return pref ?? ((window as unknown as { __voclaDefaultDesign?: "focus" | "glass" }).__voclaDefaultDesign ?? "focus");
}

export function App() {
  const col = useCol();
  document.documentElement.dataset.design = currentDesign(col.d.prefs.design);

  // Liquid Glass: the tab bar shrinks while scrolling down and comes back when scrolling up (iOS 26)
  useEffect(() => {
    let last = 0;
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | Document;
      const top = t instanceof Document ? window.scrollY : t.scrollTop;
      const root = document.documentElement;
      if (top > 80 && top - last > 4) root.classList.add("tabs-min");
      else if (top - last < -4 || top <= 80) root.classList.remove("tabs-min");
      last = top;
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);
  const [route, setRoute] = useState<Route>({ name: "decks" });
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2500);
  }, []);
  const go = useCallback((r: Route) => setRoute(r), []);

  // a new screen starts at the top with the tab bar expanded
  useEffect(() => {
    document.documentElement.classList.remove("tabs-min");
    document.querySelector(".main")?.scrollTo({ top: 0 });
  }, [route]);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      if (modalOpen() || route.name === "study" || route.name === "lesson") return; // these screens handle their own keys
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        const l = e.shiftKey ? store.redo() : store.undo();
        toast(l ? `${e.shiftKey ? "Redo" : "Undo"}: ${l}` : "Nothing to undo");
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "d") setRoute({ name: "decks" });
      else if (k === "a") setRoute({ name: "add" });
      else if (k === "b") setRoute({ name: "browse" });
      else if (k === "t") setRoute({ name: "stats" });
      else if (k === "/" && route.name === "decks") setRoute({ name: "study", did: store.col.d.prefs.currentDeck });
      else if (k === "f" && route.name === "decks") setRoute({ name: "filtered" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route, toast]);

  const [more, setMore] = useState(false);
  const railItem = (label: string, icon: ReactNode, r: Route, names: Route["name"][]) => (
    <button
      className={`rail-item${names.includes(route.name) ? " on" : ""}`}
      aria-current={names.includes(route.name) ? "page" : undefined}
      onClick={() => {
        setMore(false);
        setRoute(r);
      }}
    >
      {icon}
      {label}
    </button>
  );

  let page;
  switch (route.name) {
    case "decks":
      page = <DeckList />;
      break;
    case "overview":
      page = <Overview did={route.did} />;
      break;
    case "study":
      page = <Study did={route.did} />;
      break;
    case "add":
      page = <AddNote did={route.did} />;
      break;
    case "browse":
      page = <Browser initialQuery={route.query} />;
      break;
    case "stats":
      page = <Stats did={route.did} />;
      break;
    case "notetypes":
      page = <NoteTypes />;
      break;
    case "options":
      page = <DeckOptions did={route.did} />;
      break;
    case "filtered":
      page = <FilteredDeck did={route.did} search={route.search} search2={route.search2} resched={route.resched} />;
      break;
    case "custom":
      page = <CustomStudy did={route.did} />;
      break;
    case "import":
      page = <ImportPage />;
      break;
    case "export":
      page = <ExportPage did={route.did} />;
      break;
    case "prefs":
      page = <Prefs />;
      break;
    case "courses":
      page = <Courses />;
      break;
    case "course":
      page = <CourseView id={route.id} />;
      break;
    case "lesson":
      page = <LessonPlayer key={route.lessonId} courseId={route.courseId} lessonId={route.lessonId} />;
      break;
  }

  // study and lessons take the whole screen, on desktop and phone alike
  const focus = route.name === "study" || route.name === "lesson";
  const moreNames: Route["name"][] = ["notetypes", "import", "export", "prefs"];

  return (
    <Nav.Provider value={{ go, toast, route }}>
      {focus ? (
        <main className="main focus">{page}</main>
      ) : (
        <div className="shell">
          <nav
            className="rail"
            aria-label="Sections"
            onClickCapture={(e) => {
              // tapping the minimized tab bar expands it first (iOS 26)
              const root = document.documentElement;
              if (root.classList.contains("tabs-min")) {
                root.classList.remove("tabs-min");
                e.stopPropagation();
                e.preventDefault();
              }
            }}
          >
            <div className="logo" aria-hidden="true" />
            {railItem("Today", ICONS.today, { name: "decks" }, ["decks", "overview", "options", "filtered", "custom"])}
            {railItem("Courses", ICONS.courses, { name: "courses" }, ["courses", "course"])}
            {railItem("Browse", ICONS.browse, { name: "browse" }, ["browse", "add"])}
            {railItem("Stats", ICONS.stats, { name: "stats" }, ["stats"])}
            <div className="rail-spacer" />
            <div className="rail-more">
              <button
                className={`rail-item${moreNames.includes(route.name) || more ? " on" : ""}`}
                aria-expanded={more}
                onClick={() => setMore(!more)}
              >
                {ICONS.more}
                More
              </button>
              {more && (
                <div className="menu" onMouseLeave={() => setMore(false)}>
                  {(
                    [
                      ["Note types", { name: "notetypes" }],
                      ["Import", { name: "import" }],
                      ["Export", { name: "export" }],
                      ["Preferences", { name: "prefs" }],
                    ] as [string, Route][]
                  ).map(([l, r]) => (
                    <button
                      key={l}
                      onClick={() => {
                        setMore(false);
                        setRoute(r);
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>
          <div className="main">
            <header className="topbar">
              <div className="logo" aria-hidden="true" />
              <button className="searchbtn" aria-label="Search cards" onClick={() => setRoute({ name: "browse" })}>
                {ICONS.search}
                <span className="label">Search cards</span>
                <span className="kbd">B</span>
              </button>
              <button
                className="icon"
                aria-label="Undo"
                title={store.undoLabel() ? `Undo ${store.undoLabel()} (Ctrl+Z)` : "Nothing to undo"}
                disabled={!store.undoLabel()}
                onClick={() => {
                  const l = store.undo();
                  if (l) toast(`Undo: ${l}`);
                }}
              >
                {ICONS.undo}
              </button>
              <button onClick={() => setRoute({ name: "add" })} aria-label="Add card">
                + Add
              </button>
            </header>
            {page}
          </div>
        </div>
      )}
      {msg && (
        <div className={`toast${focus ? " top" : ""}`} role="status">
          {msg}
        </div>
      )}
      <DialogHost />
    </Nav.Provider>
  );
}

const svg = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const ICONS = {
  today: svg(
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>,
  ),
  courses: svg(<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM8 7h6" />),
  browse: svg(
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </>,
  ),
  stats: svg(<path d="M5 20V10M12 20V4M19 20v-7" />),
  more: svg(
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>,
  ),
  search: svg(
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </>,
  ),
  undo: svg(<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />),
};
