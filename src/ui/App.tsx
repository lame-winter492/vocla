import { useCallback, useEffect, useRef, useState } from "react";
import { store, useCol } from "../lib/store";
import { AddNote } from "./AddNote";
import { Browser } from "./Browser";
import { CustomStudy } from "./CustomStudy";
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

export function App() {
  useCol();
  const [route, setRoute] = useState<Route>({ name: "decks" });
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2500);
  }, []);
  const go = useCallback((r: Route) => setRoute(r), []);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      if (route.name === "study") return; // reviewer handles its own keys
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

  const tab = (label: string, r: Route, names: Route["name"][]) => (
    <button className={names.includes(route.name) ? "active" : ""} onClick={() => setRoute(r)}>
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
  }

  return (
    <Nav.Provider value={{ go, toast, route }}>
      <div className="topbar">
        {tab("Decks", { name: "decks" }, ["decks", "overview", "study", "options", "filtered", "custom"])}
        {tab("Add", { name: "add" }, ["add"])}
        {tab("Browse", { name: "browse" }, ["browse"])}
        {tab("Stats", { name: "stats" }, ["stats"])}
        {tab("Note Types", { name: "notetypes" }, ["notetypes"])}
        <span className="spacer" />
        {tab("Import", { name: "import" }, ["import"])}
        {tab("Export", { name: "export" }, ["export"])}
        {tab("Preferences", { name: "prefs" }, ["prefs"])}
        <button
          title="Undo (Ctrl+Z)"
          disabled={!store.undoLabel()}
          onClick={() => {
            const l = store.undo();
            if (l) toast(`Undo: ${l}`);
          }}
        >
          Undo
        </button>
      </div>
      {page}
      {msg && <div className="toast">{msg}</div>}
    </Nav.Provider>
  );
}
