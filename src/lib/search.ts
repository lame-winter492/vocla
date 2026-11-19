// Anki-compatible search syntax (subset):
//   dog cat        both words        dog or cat     either        -dog   not
//   "a phrase"     (a or b) c        front:dog      field search  d_g / d*g wildcards
//   deck:name deck:current deck:filtered  tag:x tag:none  note:Basic  card:1 card:Name
//   is:new is:learn is:review is:due is:suspended is:buried is:new-ish
//   flag:0..7  added:N  rated:N[:ease]  edited:N introduced:N
//   prop:ivl>=10 prop:due=1 prop:ease<2.5 prop:lapses>3 prop:reps>10 prop:pos<100
//   nid:123  cid:1,2  re:regex  nc:text (accent-insensitive)
import type { Col } from "./col";
import { stripHtml } from "./template";
import { dayStart } from "./time";
import { CardType, Queue, type Card, type ID, type Note, type NoteType } from "./types";

type Expr =
  | { op: "and"; items: Expr[] }
  | { op: "or"; items: Expr[] }
  | { op: "not"; item: Expr }
  | { op: "term"; text: string };

function tokenize(q: string): string[] {
  const toks: string[] = [];
  let i = 0;
  while (i < q.length) {
    const ch = q[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      toks.push(ch);
      i++;
      continue;
    }
    let tok = "";
    let inQuote = false;
    while (i < q.length) {
      const c = q[i];
      if (c === "\\" && i + 1 < q.length) {
        tok += c + q[i + 1];
        i += 2;
        continue;
      }
      if (c === '"') {
        inQuote = !inQuote;
        i++;
        continue;
      }
      if (!inQuote && (/\s/.test(c) || c === "(" || c === ")")) break;
      tok += c;
      i++;
    }
    toks.push(tok);
  }
  return toks;
}

function parse(q: string): Expr {
  const toks = tokenize(q);
  let pos = 0;
  const parseOr = (): Expr => {
    const items = [parseAnd()];
    while (pos < toks.length && toks[pos].toLowerCase() === "or") {
      pos++;
      items.push(parseAnd());
    }
    return items.length === 1 ? items[0] : { op: "or", items };
  };
  const parseAnd = (): Expr => {
    const items: Expr[] = [];
    while (pos < toks.length && toks[pos] !== ")" && toks[pos].toLowerCase() !== "or") {
      if (toks[pos].toLowerCase() === "and") {
        pos++;
        continue;
      }
      items.push(parseUnary());
    }
    return items.length === 1 ? items[0] : { op: "and", items };
  };
  const parseUnary = (): Expr => {
    const t = toks[pos];
    if (t === "-") {
      pos++;
      return { op: "not", item: parseUnary() };
    }
    if (t === "(") {
      pos++;
      const e = parseOr();
      if (toks[pos] === ")") pos++;
      return e;
    }
    pos++;
    if (t.startsWith("-") && t.length > 1) return { op: "not", item: { op: "term", text: t.slice(1) } };
    return { op: "term", text: t };
  };
  const e = toks.length ? parseOr() : { op: "and" as const, items: [] };
  return e;
}

/** Convert Anki glob (* any, _ single char, \* literal) to regex source. */
function globToRe(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      out += s[i + 1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i++;
    } else if (c === "*") out += ".*";
    else if (c === "_") out += ".";
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return out;
}

function removeAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

interface Row {
  card: Card;
  note: Note;
  nt: NoteType;
  plain: string[]; // stripped fields
}

type Pred = (r: Row) => boolean;

function cmp(a: number, op: string, b: number): boolean {
  switch (op) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
  }
  return false;
}

function compileTerm(col: Col, text: string, currentDeck: ID): Pred {
  const today = col.today();
  // start of the day N-1 days ago
  const dayCutoff = (days: number) => dayStart(today - (days - 1), col.d.prefs.rolloverHour);
  const colon = text.indexOf(":");
  const key = colon > 0 ? text.slice(0, colon).toLowerCase() : "";
  const val = colon > 0 ? text.slice(colon + 1) : text;

  switch (key) {
    case "deck": {
      if (val === "*") return () => true;
      if (val.toLowerCase() === "current") {
        const ids = new Set(col.deckAndChildren(currentDeck).map((d) => d.id));
        return (r) => ids.has(r.card.did) || ids.has(r.card.odid);
      }
      if (val.toLowerCase() === "filtered") return (r) => r.card.odid !== 0;
      const re = new RegExp(`^${globToRe(val)}(::.*)?$`, "i");
      const ids = new Set(Object.values(col.d.decks).filter((d) => re.test(d.name)).map((d) => d.id));
      return (r) => ids.has(r.card.did) || ids.has(r.card.odid);
    }
    case "tag": {
      if (val.toLowerCase() === "none") return (r) => r.note.tags.length === 0;
      const re = new RegExp(`^${globToRe(val)}(::.*)?$`, "i");
      return (r) => r.note.tags.some((t) => re.test(t));
    }
    case "note": {
      const re = new RegExp(`^${globToRe(val)}$`, "i");
      return (r) => re.test(r.nt.name);
    }
    case "card": {
      if (/^\d+$/.test(val)) {
        const ord = parseInt(val, 10) - 1;
        return (r) => r.card.ord === ord;
      }
      const re = new RegExp(`^${globToRe(val)}$`, "i");
      return (r) => re.test(col.cardTemplateName(r.card));
    }
    case "is": {
      switch (val.toLowerCase()) {
        case "new":
          return (r) => r.card.type === CardType.New;
        case "learn":
          return (r) => r.card.type === CardType.Learn || r.card.type === CardType.Relearn;
        case "review":
          return (r) => r.card.type === CardType.Review || r.card.type === CardType.Relearn;
        case "due":
          return (r) =>
            ((r.card.queue === Queue.Review || r.card.queue === Queue.DayLearn) && r.card.due <= today) ||
            (r.card.queue === Queue.Learn && r.card.due <= col.now());
        case "suspended":
          return (r) => r.card.queue === Queue.Suspended;
        case "buried":
          return (r) => r.card.queue === Queue.SchedBuried || r.card.queue === Queue.UserBuried;
        case "buried-sibling":
          return (r) => r.card.queue === Queue.SchedBuried;
        case "buried-manually":
          return (r) => r.card.queue === Queue.UserBuried;
        case "marked":
          return (r) => r.note.tags.some((t) => t.toLowerCase() === "marked");
        case "leech":
          return (r) => r.note.tags.some((t) => t.toLowerCase() === "leech");
      }
      return () => false;
    }
    case "flag": {
      const n = parseInt(val, 10);
      return (r) => r.card.flags === n;
    }
    case "added": {
      const cutoff = dayCutoff(parseInt(val, 10) || 1);
      return (r) => r.card.id >= cutoff;
    }
    case "edited": {
      const cutoff = dayCutoff(parseInt(val, 10) || 1);
      return (r) => r.note.mod >= cutoff;
    }
    case "rated":
    case "introduced": {
      const [d, e] = val.split(":");
      const cutoff = dayCutoff(Math.min(parseInt(d, 10) || 1, 365));
      const ease = e ? parseInt(e, 10) : 0;
      const set = new Set<ID>();
      if (key === "rated") {
        for (const r of col.d.revlog) if (r.id >= cutoff && r.ease > 0 && (!ease || r.ease === ease)) set.add(r.cid);
      } else {
        const first = new Map<ID, number>();
        for (const r of col.d.revlog) if (r.ease > 0 && !first.has(r.cid)) first.set(r.cid, r.id);
        for (const [cid, t] of first) if (t >= cutoff) set.add(cid);
      }
      return (r) => set.has(r.card.id);
    }
    case "prop": {
      const m = val.match(/^(\w+)(<=|>=|!=|=|<|>)(-?[\d.]+)$/);
      if (!m) return () => false;
      const [, prop, op, numS] = m;
      const num = parseFloat(numS);
      switch (prop.toLowerCase()) {
        case "ivl":
          return (r) => r.card.type === CardType.Review && cmp(r.card.ivl, op, num);
        case "due":
          return (r) => (r.card.queue === Queue.Review || r.card.queue === Queue.DayLearn) && cmp(r.card.due - today, op, num);
        case "ease":
          return (r) => r.card.factor > 0 && cmp(r.card.factor / 1000, op, num);
        case "lapses":
          return (r) => cmp(r.card.lapses, op, num);
        case "reps":
          return (r) => cmp(r.card.reps, op, num);
        case "pos":
          return (r) => r.card.type === CardType.New && cmp(r.card.due, op, num);
      }
      return () => false;
    }
    case "nid": {
      const ids = new Set(val.split(",").map(Number));
      return (r) => ids.has(r.note.id);
    }
    case "cid": {
      const ids = new Set(val.split(",").map(Number));
      return (r) => ids.has(r.card.id);
    }
    case "re": {
      const re = new RegExp(val, "i");
      return (r) => r.plain.some((f) => re.test(f)) || r.note.fields.some((f) => re.test(f));
    }
    case "nc": {
      const needle = removeAccents(val).toLowerCase();
      const re = new RegExp(globToRe(needle), "i");
      return (r) => r.plain.some((f) => re.test(removeAccents(f)));
    }
    case "dupe": {
      const [ntidS, ...rest] = val.split(",");
      const target = stripHtml(rest.join(",")).trim().toLowerCase();
      const ntid = Number(ntidS);
      return (r) => r.note.ntid === ntid && (r.plain[0] ?? "").trim().toLowerCase() === target;
    }
  }

  // field search: "front:dog"
  if (key) {
    const fieldRe = new RegExp(`^${globToRe(key)}$`, "i");
    const valRe = new RegExp(`^${globToRe(val)}$`, "is");
    return (r) => r.nt.fields.some((f, i) => fieldRe.test(f.name) && valRe.test(r.plain[i] ?? ""));
  }

  // plain text
  if (!val) return () => true;
  const re = new RegExp(globToRe(val), "i");
  return (r) => r.plain.some((f) => re.test(f)) || re.test(r.plain.join(" "));
}

function compile(col: Col, e: Expr, currentDeck: ID): Pred {
  switch (e.op) {
    case "and": {
      const ps = e.items.map((i) => compile(col, i, currentDeck));
      return (r) => ps.every((p) => p(r));
    }
    case "or": {
      const ps = e.items.map((i) => compile(col, i, currentDeck));
      return (r) => ps.some((p) => p(r));
    }
    case "not": {
      const p = compile(col, e.item, currentDeck);
      return (r) => !p(r);
    }
    case "term":
      try {
        return compileTerm(col, e.text, currentDeck);
      } catch {
        return () => false;
      }
  }
}

export function searchCards(col: Col, query: string): ID[] {
  const pred = compile(col, parse(query), col.d.prefs.currentDeck);
  const plainCache = new Map<ID, string[]>();
  const out: ID[] = [];
  for (const card of Object.values(col.d.cards)) {
    const note = col.d.notes[card.nid];
    if (!note) continue;
    const nt = col.d.notetypes[note.ntid];
    if (!nt) continue;
    let plain = plainCache.get(note.id);
    if (!plain) {
      plain = note.fields.map(stripHtml);
      plainCache.set(note.id, plain);
    }
    if (pred({ card, note, nt, plain })) out.push(card.id);
  }
  return out;
}

export function searchNotes(col: Col, query: string): ID[] {
  const seen = new Set<ID>();
  const out: ID[] = [];
  for (const cid of searchCards(col, query)) {
    const nid = col.d.cards[cid].nid;
    if (!seen.has(nid)) {
      seen.add(nid);
      out.push(nid);
    }
  }
  return out;
}
