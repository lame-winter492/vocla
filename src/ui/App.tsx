import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
import { currentLook, phoneLayout, transition, type NavKind } from "./motion";
import { TAB_ICONS } from "./icons";

// ---------- navigation model (drives iOS-style transitions and the back button) ----------
type Name = Route["name"];
const SECTION: Record<Name, string> = {
  decks: "today", overview: "today", options: "today", filtered: "today", custom: "today", study: "today",
  courses: "courses", course: "courses", lesson: "courses",
  browse: "browse", add: "browse", stats: "stats",
  notetypes: "more", import: "more", export: "more", prefs: "more",
};
const DEPTH: Record<Name, number> = {
  decks: 0, courses: 0, browse: 0, stats: 0, notetypes: 0, import: 0, export: 0, prefs: 0,
  overview: 1, filtered: 1, course: 1, add: 1, options: 2, custom: 2, study: 2, lesson: 2,
};
const TITLES: Partial<Record<Name, string>> = {
  decks: "Today", courses: "Courses", browse: "Browse", add: "Add", stats: "Statistics", options: "Deck Options",
  filtered: "Filtered Deck", custom: "Custom Study", notetypes: "Note Types", import: "Import", export: "Export", prefs: "Preferences",
};

/** The tab bar minimizes while scrolling only in Liquid Glass at phone width (iOS 26 behaviour). */
function tabBarCanMinimize(): boolean {
  return document.documentElement.dataset.design === "glass" && phoneLayout();
}

function kindFor(from: Route, to: Route): NavKind {
  if (to.name === "add" && from.name !== "add") return "sheet";
  if (from.name === "add" && to.name !== "add") return "unsheet";
  if (to.name === "study" || to.name === "lesson") return "zoom";
  if (from.name === "study" || from.name === "lesson") return "unzoom";
  if (SECTION[from.name] !== SECTION[to.name] || (DEPTH[from.name] === 0 && DEPTH[to.name] === 0)) return "tab";
  return DEPTH[to.name] >= DEPTH[from.name] ? "push" : "pop";
}


export function App() {
  const col = useCol();
  // one design (iOS), in two materials: Liquid Glass or Frosted
  document.documentElement.dataset.design = "glass";
  document.documentElement.dataset.look = currentLook(col.d.prefs.look);
  document.documentElement.classList.toggle("solid-glass", !!col.d.prefs.reduceTransparency);

  // Liquid Glass: the tab bar shrinks while scrolling down and comes back when scrolling up (iOS 26)
  useEffect(() => {
    let last = 0;
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | Document;
      const top = t instanceof Document ? window.scrollY : t.scrollTop;
      const root = document.documentElement;
      // only the floating Liquid Glass tab bar on phones minimizes; elsewhere it would just swallow a click
      if (top > 80 && top - last > 4 && tabBarCanMinimize()) root.classList.add("tabs-min");
      else if (top - last < -4 || top <= 80 || !tabBarCanMinimize()) root.classList.remove("tabs-min");
      // scroll edge effect under the top bar, and the large title collapsing into the bar
      root.classList.toggle("scrolled", top > 4);
      root.classList.toggle("title-collapsed", top > 52);
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
  // every navigation goes through here so it gets the right iOS transition
  const routeRef = useRef(route);
  routeRef.current = route;
  const beforeAdd = useRef<Route>({ name: "decks" });
  const go = useCallback((r: Route) => {
    const from = routeRef.current;
    if (r.name === "add" && from.name !== "add") beforeAdd.current = from;
    transition(kindFor(from, r), () => setRoute(r));
  }, []);

  // a new screen starts at the top with the tab bar expanded (layout effect: before the transition's snapshot)
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("tabs-min", "scrolled", "title-collapsed");
    document.querySelector(".main")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
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
      if (k === "d") go({ name: "decks" });
      else if (k === "a") go({ name: "add" });
      else if (k === "b") go({ name: "browse" });
      else if (k === "t") go({ name: "stats" });
      else if (k === "/" && route.name === "decks") go({ name: "study", did: store.col.d.prefs.currentDeck });
      else if (k === "f" && route.name === "decks") go({ name: "filtered" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route, toast, go]);

  const [more, setMore] = useState(false);
  // a sheet (Add) belongs to the tab it was opened from, so the tab bar doesn't move under it
  const sectionOf = (r: Route) => SECTION[r.name === "add" ? beforeAdd.current.name : r.name];
  const railItem = (label: string, icon: ReactNode, r: Route, section: string) => (
    <button
      className={`rail-item${sectionOf(route) === section ? " on" : ""}`}
      aria-current={sectionOf(route) === section ? "page" : undefined}
      onClick={() => {
        setMore(false);
        go(r);
      }}
    >
      {icon}
      <span className="rail-label">{label}</span>
    </button>
  );

  // the selection "droplet": one glass pill that slides between tabs instead of each tab lighting up
  const railRef = useRef<HTMLElement>(null);
  const dropRef = useRef<HTMLSpanElement>(null);
  const placeDroplet = useCallback((animate: boolean) => {
    const rail = railRef.current;
    const drop = dropRef.current;
    if (!rail || !drop) return;
    // while minimized only the current tab shows; measure again once the bar is back to full size
    if (document.documentElement.classList.contains("tabs-min")) return;
    const on = rail.querySelector<HTMLElement>(".rail-item.on");
    if (!on) {
      drop.style.opacity = "0";
      return;
    }
    const r = rail.getBoundingClientRect();
    const b = on.getBoundingClientRect();
    if (!animate) drop.style.transition = "none";
    drop.style.opacity = "1";
    drop.style.width = `${b.width}px`;
    drop.style.height = `${b.height}px`;
    drop.style.transform = `translate(${b.left - r.left - rail.clientLeft}px, ${b.top - r.top - rail.clientTop}px)`;
    if (!animate) {
      void drop.offsetWidth;
      drop.style.transition = "";
    } else {
      drop.classList.remove("gel");
      void drop.offsetWidth;
      drop.classList.add("gel");
    }
  }, []);
  const lastSection = useRef<string | null>(null);
  useLayoutEffect(() => {
    const sec = sectionOf(route) + (more ? "+more" : "");
    placeDroplet(lastSection.current !== null && lastSection.current !== sec);
    lastSection.current = sec;
  });
  // follow the tab bar's size: window resizes, and the bar growing back after being minimized (every frame of it)
  const railShown = route.name !== "study" && route.name !== "lesson";
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => placeDroplet(false));
    ro.observe(rail);
    return () => ro.disconnect();
  }, [placeDroplet, railShown]);

  // iOS back button for screens deeper than a tab's root
  const backTo: Route | null = (() => {
    switch (route.name) {
      case "overview":
      case "filtered":
        return { name: "decks" };
      case "options":
      case "custom":
        return { name: "overview", did: route.did };
      case "course":
        return { name: "courses" };
      case "add":
        return beforeAdd.current;
      default:
        return null;
    }
  })();
  const titleFor = (r: Route): string => {
    if (r.name === "overview") return col.deck(r.did)?.name.split("::").pop() ?? "Deck";
    if (r.name === "course") return col.d.courses[r.id]?.title ?? "Course";
    return TITLES[r.name] ?? "";
  };

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

  return (
    <Nav.Provider value={{ go, toast, route }}>
      {focus ? (
        <main className="main focus">{page}</main>
      ) : (
        <div className="shell">
          <nav
            ref={railRef}
            className="rail has-droplet"
            aria-label="Sections"
            onClickCapture={(e) => {
              // tapping the minimized tab bar expands it first (iOS 26)
              const root = document.documentElement;
              if (root.classList.contains("tabs-min") && tabBarCanMinimize()) {
                root.classList.remove("tabs-min");
                e.stopPropagation();
                e.preventDefault();
              }
            }}
          >
            <span ref={dropRef} className="rail-droplet" aria-hidden="true" />
            <div className="logo" aria-hidden="true" />
            {railItem("Today", ICONS.today, { name: "decks" }, "today")}
            {railItem("Courses", ICONS.courses, { name: "courses" }, "courses")}
            {railItem("Browse", ICONS.browse, { name: "browse" }, "browse")}
            {railItem("Stats", ICONS.stats, { name: "stats" }, "stats")}
            <div className="rail-spacer" />
            <div className="rail-more">
              <button
                className={`rail-item${sectionOf(route) === "more" || more ? " on" : ""}`}
                aria-expanded={more}
                onClick={() => setMore(!more)}
              >
                {ICONS.more}
                <span className="rail-label">More</span>
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
                        go(r);
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
              {backTo && (
                <button className="backbtn" onClick={() => go(backTo)} aria-label={`Back to ${titleFor(backTo)}`}>
                  {ICONS.back}
                  <span className="back-label">{titleFor(backTo)}</span>
                </button>
              )}
              <div className="topbar-title" aria-hidden="true">
                {titleFor(route)}
              </div>
              {/* Liquid Glass groups related toolbar buttons on one shared capsule */}
              <div className="toolbar-group">
                <button className="searchbtn" aria-label="Search cards" onClick={() => go({ name: "browse" })}>
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
                <button className="addbtn" onClick={() => go({ name: "add" })} aria-label="Add card">
                  {ICONS.plus}
                  <span className="add-label">Add</span>
                </button>
              </div>
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

const ICONS = TAB_ICONS;
