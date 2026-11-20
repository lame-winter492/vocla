// Import / export: plain text (CSV/TSV), deck packages and full backups (JSON).
import type { Col } from "./col";
import { nativeSaveFile } from "./native";
import { newGuid, newId } from "./stock";
import { escapeHtml, stripHtml } from "./template";
import type { Card, Collection, Deck, ID, Note, NoteType } from "./types";

// ---------- text ----------

export interface TextParse {
  rows: string[][];
  delimiter: string;
  html: boolean;
  tagsColumn: number; // 1-based, 0 = none
  deck?: string;
  notetype?: string;
}

export function parseDelimited(text: string, delimiter?: string): TextParse {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const meta: Partial<TextParse> = { html: false, tagsColumn: 0 };
  let start = 0;
  for (; start < lines.length; start++) {
    const m = lines[start].match(/^#([\w ]+):(.*)$/);
    if (!m) break;
    const k = m[1].trim().toLowerCase();
    const v = m[2].trim();
    if (k === "separator") meta.delimiter = { tab: "\t", comma: ",", semicolon: ";", space: " ", pipe: "|", colon: ":" }[v.toLowerCase()] ?? v;
    else if (k === "html") meta.html = v === "true";
    else if (k === "tags column") meta.tagsColumn = parseInt(v, 10) || 0;
    else if (k === "deck") meta.deck = v;
    else if (k === "notetype") meta.notetype = v;
  }
  const body = lines.slice(start).join("\n");
  const firstLine = lines[start] ?? "";
  const delim =
    delimiter ??
    meta.delimiter ??
    (firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : firstLine.includes(",") ? "," : "\t");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inQ) {
      if (c === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"' && field === "") inQ = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      if (row.some((f) => f !== "") && !row[0].startsWith("#")) rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return { rows, delimiter: delim, html: meta.html ?? false, tagsColumn: meta.tagsColumn ?? 0, deck: meta.deck, notetype: meta.notetype };
}

export interface TextImportOpts {
  ntid: ID;
  did: ID;
  /** mapping[colIndex] = field index, -1 ignore, -2 tags */
  mapping: number[];
  html: boolean;
  dupes: "update" | "ignore" | "duplicate";
  extraTags: string[];
}

export function importRows(col: Col, rows: string[][], o: TextImportOpts): { added: number; updated: number; skipped: number } {
  const nt = col.d.notetypes[o.ntid];
  let added = 0, updated = 0, skipped = 0;
  const firstFieldIdx = new Map<string, Note>();
  for (const n of Object.values(col.d.notes)) if (n.ntid === o.ntid) firstFieldIdx.set(stripHtml(n.fields[0] ?? "").trim().toLowerCase(), n);
  for (const r of rows) {
    const fields = nt.fields.map(() => "");
    let tags: string[] = [...o.extraTags];
    r.forEach((val, ci) => {
      const m = o.mapping[ci] ?? -1;
      const v = o.html ? val : escapeHtml(val).replace(/\n/g, "<br>");
      if (m >= 0) fields[m] = v;
      else if (m === -2) tags.push(...val.split(/\s+/).filter(Boolean));
    });
    const key = stripHtml(fields[0]).trim().toLowerCase();
    if (!key) {
      skipped++;
      continue;
    }
    const existing = firstFieldIdx.get(key);
    if (existing && o.dupes !== "duplicate") {
      if (o.dupes === "update") {
        existing.fields = fields;
        existing.tags = [...new Set([...existing.tags, ...tags])];
        col.updateNote(existing);
        updated++;
      } else skipped++;
      continue;
    }
    const note = col.newNote(nt);
    note.fields = fields;
    note.tags = tags;
    if (col.addNote(note, o.did) > 0) {
      added++;
      firstFieldIdx.set(key, note);
    } else skipped++;
  }
  return { added, updated, skipped };
}

export function exportNotesText(col: Col, nids: ID[], opts: { html: boolean; tags: boolean; deckCol: boolean; ntCol: boolean }): string {
  const lines = ["#separator:tab", `#html:${opts.html}`];
  let colIdx = 1;
  const meta: string[] = [];
  if (opts.ntCol) meta.push(`#notetype column:${colIdx++}`);
  if (opts.deckCol) meta.push(`#deck column:${colIdx++}`);
  const rows: string[] = [];
  let maxFields = 0;
  for (const nid of nids) {
    const n = col.d.notes[nid];
    if (!n) continue;
    const prefix: string[] = [];
    if (opts.ntCol) prefix.push(col.d.notetypes[n.ntid]?.name ?? "");
    if (opts.deckCol) {
      const c = col.cardsOfNote(nid)[0];
      prefix.push(col.d.decks[c?.odid || c?.did]?.name ?? "");
    }
    const fields = n.fields.map((f) => (opts.html ? f : stripHtml(f)));
    maxFields = Math.max(maxFields, fields.length);
    const cells = [...prefix, ...fields].map(tsvEscape);
    if (opts.tags) cells.push(tsvEscape(n.tags.join(" ")));
    rows.push(cells.join("\t"));
  }
  if (opts.tags) meta.push(`#tags column:${colIdx + maxFields}`);
  return [...lines, ...meta, ...rows].join("\n") + "\n";
}

function tsvEscape(s: string): string {
  if (/[\t\n"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ---------- deck package (JSON) ----------

export interface DeckPackage {
  format: "vocla-deck";
  version: 1;
  decks: Deck[];
  dconf: Collection["dconf"];
  notetypes: NoteType[];
  notes: Note[];
  cards: Card[];
  revlog: Collection["revlog"];
}

export function exportDeckPackage(col: Col, did: ID | null, includeSched: boolean): DeckPackage {
  const decks = did ? col.deckAndChildren(did).filter((d) => !d.dyn) : Object.values(col.d.decks).filter((d) => !d.dyn);
  const dids = new Set(decks.map((d) => d.id));
  const cards = Object.values(col.d.cards).filter((c) => dids.has(c.odid || c.did));
  const nids = new Set(cards.map((c) => c.nid));
  const notes = [...nids].map((n) => col.d.notes[n]).filter(Boolean);
  const ntids = new Set(notes.map((n) => n.ntid));
  const confIds = new Set(decks.map((d) => d.confId));
  const outCards = cards.map((c) => {
    const cc: Card = structuredClone(c);
    if (cc.odid) {
      cc.did = cc.odid;
      cc.odid = 0;
      if (cc.odue) cc.due = cc.odue;
      cc.odue = 0;
    }
    if (!includeSched) {
      const wasNew = cc.type === 0;
      Object.assign(cc, { type: 0, queue: 0, ivl: 0, factor: 0, reps: 0, lapses: 0, step: 0, flags: 0 });
      if (!wasNew) cc.due = 0;
    }
    return cc;
  });
  const cids = new Set(cards.map((c) => c.id));
  return {
    format: "vocla-deck",
    version: 1,
    decks: structuredClone(decks),
    dconf: Object.fromEntries([...confIds].filter((id) => col.d.dconf[id]).map((id) => [id, structuredClone(col.d.dconf[id])])),
    notetypes: [...ntids].map((id) => structuredClone(col.d.notetypes[id])).filter(Boolean),
    notes: structuredClone(notes),
    cards: outCards,
    revlog: includeSched ? col.d.revlog.filter((r) => cids.has(r.cid)) : [],
  };
}

export function importDeckPackage(col: Col, pkg: DeckPackage): { notes: number; updated: number; cards: number } {
  // note types: match by id, else by name + field names; otherwise add
  const ntMap = new Map<ID, ID>();
  for (const nt of pkg.notetypes) {
    const sameId = col.d.notetypes[nt.id];
    const sig = (x: NoteType) => x.name + "|" + x.fields.map((f) => f.name).join(",") + "|" + x.templates.length;
    if (sameId && sig(sameId) === sig(nt)) ntMap.set(nt.id, nt.id);
    else {
      const match = Object.values(col.d.notetypes).find((x) => sig(x) === sig(nt));
      if (match) ntMap.set(nt.id, match.id);
      else {
        const copy = { ...structuredClone(nt), id: sameId ? newId() : nt.id };
        col.d.notetypes[copy.id] = copy;
        ntMap.set(nt.id, copy.id);
      }
    }
  }
  // configs
  const confMap = new Map<ID, ID>();
  for (const conf of Object.values(pkg.dconf ?? {})) {
    if (conf.id === 1 || col.d.dconf[conf.id]) confMap.set(conf.id, conf.id === 1 ? 1 : conf.id);
    else {
      col.d.dconf[conf.id] = structuredClone(conf);
      confMap.set(conf.id, conf.id);
    }
  }
  // decks by name
  const deckMap = new Map<ID, ID>();
  for (const d of pkg.decks.sort((a, b) => a.name.localeCompare(b.name))) {
    const existing = col.deckByName(d.name);
    if (existing) deckMap.set(d.id, existing.id);
    else {
      const nd = col.addDeck(d.name);
      nd.description = d.description;
      nd.confId = confMap.get(d.confId) ?? 1;
      deckMap.set(d.id, nd.id);
    }
  }
  // notes by guid
  const byGuid = new Map<string, Note>();
  for (const n of Object.values(col.d.notes)) byGuid.set(n.guid, n);
  const noteIdMap = new Map<ID, ID>();
  let added = 0, updated = 0, cardsAdded = 0;
  const skipNotes = new Set<ID>();
  for (const n of pkg.notes) {
    const ex = byGuid.get(n.guid);
    if (ex) {
      if (n.mod > ex.mod && ex.ntid === ntMap.get(n.ntid)) {
        ex.fields = [...n.fields];
        ex.tags = [...n.tags];
        ex.mod = n.mod;
        updated++;
      }
      skipNotes.add(n.id);
      continue;
    }
    const id = col.d.notes[n.id] ? newId() : n.id;
    noteIdMap.set(n.id, id);
    col.d.notes[id] = { ...structuredClone(n), id, ntid: ntMap.get(n.ntid) ?? n.ntid, guid: n.guid || newGuid() };
    added++;
  }
  const cardIdMap = new Map<ID, ID>();
  const posBase = col.d.nextPos;
  let maxPos = 0;
  for (const c of pkg.cards) {
    if (skipNotes.has(c.nid)) continue;
    const id = col.d.cards[c.id] ? newId() : c.id;
    cardIdMap.set(c.id, id);
    const card: Card = { ...structuredClone(c), id, nid: noteIdMap.get(c.nid) ?? c.nid, did: deckMap.get(c.did) ?? 1, odid: 0, odue: 0 };
    if (card.type === 0) {
      card.due = posBase + card.due;
      maxPos = Math.max(maxPos, card.due);
    }
    col.d.cards[id] = card;
    cardsAdded++;
  }
  col.d.nextPos = Math.max(col.d.nextPos, maxPos + 1);
  for (const r of pkg.revlog ?? []) {
    const cid = cardIdMap.get(r.cid);
    if (cid) col.d.revlog.push({ ...r, cid });
  }
  col.d.revlog.sort((a, b) => a.id - b.id);
  return { notes: added, updated, cards: cardsAdded };
}

// ---------- helpers ----------

export async function download(filename: string, data: string, type = "application/json"): Promise<void> {
  // in the iOS app, files go through the share sheet (Save to Files, AirDrop, …)
  if (await nativeSaveFile(filename, data, type)) return;
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
