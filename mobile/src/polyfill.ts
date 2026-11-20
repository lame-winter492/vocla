// Must be the very first import: the shared core calls structuredClone while it loads (the empty
// collection) and to snapshot the collection for undo. Hermes may not provide it; the collection is
// plain JSON, so a JSON round trip is an exact copy.
const g = globalThis as { structuredClone?: <T>(v: T) => T };
if (typeof g.structuredClone !== 'function') g.structuredClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export {};
