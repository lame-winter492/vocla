// Global collection store: persistence, undo/redo and change notifications.
// Shared by the web app (IndexedDB) and the native app (a file, see mobile/src/storage.ts).
import { useSyncExternalStore } from "react";
import { Col } from "./col";
import { CLOZE_CSS, DEFAULT_CSS, emptyCollection, LEGACY_CLOZE_CSS, LEGACY_DEFAULT_CSS, stockNoteType } from "./stock";
import type { Collection } from "./types";

const DB_NAME = "vocla";
const STORE = "kv";
const KEY = "collection";
const UNDO_LIMIT = 30;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Where the collection is kept. The web app uses IndexedDB; the native app sets its own with setStorage(). */
export interface StorageBackend {
  get(): Promise<Collection | undefined>;
  set(data: Collection): Promise<void>;
}
let backend: StorageBackend = { get: () => idbGet<Collection>(KEY), set: (d) => idbSet(KEY, d) };
export function setStorage(b: StorageBackend): void {
  backend = b;
}

interface UndoEntry {
  label: string;
  snapshot: Collection;
}

class Store {
  col: Col = new Col(emptyCollection());
  version = 0;
  loaded = false;
  private listeners = new Set<() => void>();
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  async load(): Promise<void> {
    try {
      const data = await backend.get();
      if (data) this.col = new Col(migrate(data));
    } catch (e) {
      console.error("Failed to load collection", e);
    }
    this.loaded = true;
    this.emit();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Perform an undoable mutation. */
  update<T>(label: string, fn: (col: Col) => T): T {
    const snapshot = structuredClone(this.col.d);
    let result: T;
    try {
      result = fn(this.col);
    } catch (e) {
      this.col = new Col(snapshot);
      this.emit();
      throw e;
    }
    this.undoStack.push({ label, snapshot });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.col.d.mod = Date.now();
    this.changed();
    return result;
  }

  /** Mutation without an undo entry (e.g. UI prefs). */
  mutate<T>(fn: (col: Col) => T): T {
    const r = fn(this.col);
    this.changed();
    return r;
  }

  undoLabel(): string | null {
    return this.undoStack.length ? this.undoStack[this.undoStack.length - 1].label : null;
  }
  redoLabel(): string | null {
    return this.redoStack.length ? this.redoStack[this.redoStack.length - 1].label : null;
  }
  undo(): string | null {
    const e = this.undoStack.pop();
    if (!e) return null;
    this.redoStack.push({ label: e.label, snapshot: structuredClone(this.col.d) });
    this.col = new Col(e.snapshot);
    this.changed();
    return e.label;
  }
  redo(): string | null {
    const e = this.redoStack.pop();
    if (!e) return null;
    this.undoStack.push({ label: e.label, snapshot: structuredClone(this.col.d) });
    this.col = new Col(e.snapshot);
    this.changed();
    return e.label;
  }

  /** Replace the whole collection (import backup). */
  replace(data: Collection): void {
    this.undoStack.push({ label: "Import", snapshot: structuredClone(this.col.d) });
    this.redoStack = [];
    this.col = new Col(migrate(data));
    this.changed();
  }

  private changed() {
    this.emit();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 300);
  }

  async save(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      await backend.set(this.col.d);
    } catch (e) {
      console.error("Failed to save collection", e);
    }
  }
}

function migrate(data: Collection): Collection {
  const base = emptyCollection();
  data.prefs = { ...base.prefs, ...data.prefs };
  data.savedSearches = data.savedSearches ?? {};
  data.courses = data.courses ?? base.courses;
  data.courseProgress = data.courseProgress ?? base.courseProgress;
  data.revlog = data.revlog ?? [];
  if (!data.dconf[1]) data.dconf[1] = base.dconf[1];
  if (!Object.values(data.notetypes).some((n) => n.name === "Vocabulary")) {
    const v = stockNoteType("vocabulary");
    data.notetypes[v.id] = v;
  }
  for (const conf of Object.values(data.dconf)) if (!conf.fsrs) conf.fsrs = { enabled: true, desiredRetention: 0.9 };
  for (const nt of Object.values(data.notetypes)) {
    if (nt.css.trim() === LEGACY_DEFAULT_CSS.trim()) nt.css = DEFAULT_CSS;
    else if (nt.css.trim() === LEGACY_CLOZE_CSS.trim()) nt.css = CLOZE_CSS;
  }
  if (!data.decks[1]) data.decks[1] = base.decks[1];
  return data;
}

export const store = new Store();

// browsers: save when the page goes away (React Native has a window object but no DOM events)
if (typeof document !== "undefined" && typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => void store.save());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void store.save();
  });
}

/** Re-render whenever the collection changes; returns the current Col. */
export function useCol(): Col {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store.col;
}
