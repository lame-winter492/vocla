import { describe, expect, it } from "vitest";
import { Col } from "./col";
import { answerCard, fuzzBounds } from "./scheduler";
import { searchCards } from "./search";
import { defaultDeckConfig, emptyCollection } from "./stock";
import { render, renderCloze, templateNonEmpty } from "./template";
import { CardType, Queue, type Card } from "./types";

function freshCol() {
  return new Col(emptyCollection());
}
function nt(col: Col, name: string) {
  return col.notetypes().find((n) => n.name === name)!;
}
function addBasic(col: Col, front: string, back: string, type = "Basic", did = 1, tags: string[] = []) {
  const n = col.newNote(nt(col, type));
  n.fields[0] = front;
  n.fields[1] = back;
  n.tags = tags;
  col.addNote(n, did);
  return n;
}

describe("templates", () => {
  it("renders fields, conditionals and FrontSide", () => {
    const ctx = { fields: { Front: "hi", Back: "" }, tags: [], deck: "D", notetype: "B", cardName: "C", flag: 0, ord: 0, question: true };
    expect(render("{{Front}}{{#Back}}X{{/Back}}{{^Back}}Y{{/Back}}", ctx)).toBe("hiY");
    expect(render("{{FrontSide}}|{{Front}}", { ...ctx, question: false, frontSide: "Q" })).toBe("Q|hi");
  });
  it("cloze", () => {
    expect(renderCloze("{{c1::a}} {{c2::b::hint}}", 1, true)).toContain("[hint]");
    expect(renderCloze("{{c1::a}} {{c2::b::hint}}", 1, true)).toMatch(/^a /);
    expect(renderCloze("{{c1::a}} {{c2::b}}", 0, false)).toBe('<span class="cloze">a</span> b');
  });
  it("card generation rule", () => {
    expect(templateNonEmpty("{{#Add Reverse}}{{Back}}{{/Add Reverse}}", { Back: "x", "Add Reverse": "" })).toBe(false);
    expect(templateNonEmpty("{{#Add Reverse}}{{Back}}{{/Add Reverse}}", { Back: "x", "Add Reverse": "y" })).toBe(true);
  });
});

describe("notes", () => {
  it("generates cards per note type", () => {
    const col = freshCol();
    addBasic(col, "a", "b", "Basic (and reversed card)");
    expect(Object.keys(col.d.cards).length).toBe(2);
    const n = col.newNote(nt(col, "Cloze"));
    n.fields[0] = "{{c1::x}} {{c2::y}} {{c2::z}}";
    expect(col.addNote(n, 1)).toBe(2);
  });
  it("optional reverse adds card on edit", () => {
    const col = freshCol();
    const n = addBasic(col, "a", "b", "Basic (optional reversed card)");
    expect(col.cardsOfNote(n.id).length).toBe(1);
    n.fields[2] = "y";
    col.updateNote(n);
    expect(col.cardsOfNote(n.id).length).toBe(2);
  });
});

describe("scheduler", () => {
  const conf = defaultDeckConfig();
  const now = 1_700_000_000_000;
  const today = 20000;
  const ctx = { now, today, conf };
  const base: Card = { id: 1, nid: 1, did: 1, odid: 0, ord: 0, mod: 0, type: CardType.New, queue: Queue.New, due: 1, odue: 0, ivl: 0, factor: 0, reps: 0, lapses: 0, step: 0, flags: 0 };

  it("new card: again/good/easy", () => {
    const again = answerCard(base, 1, ctx).card;
    expect(again.type).toBe(CardType.Learn);
    expect(again.queue).toBe(Queue.Learn);
    expect(again.due - now).toBeGreaterThanOrEqual(60_000);
    const good = answerCard(base, 3, ctx).card;
    expect(good.step).toBe(1);
    expect(good.due - now).toBeGreaterThanOrEqual(600_000);
    const good2 = answerCard(good, 3, ctx).card;
    expect(good2.type).toBe(CardType.Review);
    expect(good2.ivl).toBe(1);
    const easy = answerCard(base, 4, ctx).card;
    expect(easy.type).toBe(CardType.Review);
    expect(easy.ivl).toBeGreaterThanOrEqual(3);
    expect(easy.factor).toBe(2500);
  });

  it("review intervals ordered and lapses", () => {
    const rev: Card = { ...base, type: CardType.Review, queue: Queue.Review, ivl: 10, due: today, factor: 2500, reps: 5 };
    const h = answerCard(rev, 2, ctx).card;
    const g = answerCard(rev, 3, ctx).card;
    const e = answerCard(rev, 4, ctx).card;
    expect(h.ivl).toBeGreaterThan(10);
    expect(g.ivl).toBeGreaterThan(h.ivl);
    expect(e.ivl).toBeGreaterThan(g.ivl);
    expect(h.factor).toBe(2350);
    expect(e.factor).toBe(2650);
    const a = answerCard(rev, 1, ctx);
    expect(a.card.type).toBe(CardType.Relearn);
    expect(a.card.lapses).toBe(1);
    expect(a.card.factor).toBe(2300);
    expect(a.card.ivl).toBe(1);
    const back = answerCard(a.card, 3, ctx).card;
    expect(back.type).toBe(CardType.Review);
    expect(back.due).toBe(today + 1);
  });

  it("fuzz bounds", () => {
    expect(fuzzBounds(1, 1, 100)).toEqual([1, 1]);
    const [lo, hi] = fuzzBounds(100, 1, 36500);
    expect(lo).toBeLessThan(100);
    expect(hi).toBeGreaterThan(100);
  });

  it("leech", () => {
    const rev: Card = { ...base, type: CardType.Review, queue: Queue.Review, ivl: 3, due: today, factor: 2500, lapses: 7 };
    expect(answerCard(rev, 1, ctx).leech).toBe(true);
  });
});

describe("collection queues", () => {
  it("respects new limits and answering", () => {
    const col = freshCol();
    col.d.dconf[1].new.perDay = 3;
    for (let i = 0; i < 5; i++) addBasic(col, `w${i}`, `m${i}`);
    expect(col.counts(1).newCount).toBe(3);
    const q = col.getNextCard(1)!;
    expect(q.kind).toBe("new");
    expect(q.card.due).toBe(1);
    col.answer(q.card.id, 3, 1000);
    expect(col.counts(1).newCount).toBe(2);
    expect(col.d.revlog.length).toBe(1);
  });

  it("filtered deck build/empty", () => {
    const col = freshCol();
    addBasic(col, "a", "b", "Basic", 1, ["x"]);
    addBasic(col, "c", "d", "Basic", 1, ["y"]);
    const f = col.addDeck("Filtered", true);
    f.terms = [{ search: "tag:x", limit: 10, order: "added" }];
    expect(col.rebuildFiltered(f.id)).toBe(1);
    expect(col.counts(f.id).newCount).toBe(1);
    col.emptyFiltered(f.id);
    expect(Object.values(col.d.cards).every((c) => c.did === 1 && c.odid === 0)).toBe(true);
  });
});

describe("search", () => {
  it("supports common syntax", () => {
    const col = freshCol();
    const sub = col.addDeck("Lang::French");
    addBasic(col, "chien", "dog", "Basic", sub.id, ["animal"]);
    addBasic(col, "chat", "cat", "Basic", 1, ["animal", "pet"]);
    addBasic(col, "maison", "house", "Basic", 1);
    expect(searchCards(col, "dog").length).toBe(1);
    expect(searchCards(col, "deck:Lang").length).toBe(1);
    expect(searchCards(col, "tag:animal -tag:pet").length).toBe(1);
    expect(searchCards(col, "dog or cat").length).toBe(2);
    expect(searchCards(col, "front:ch*").length).toBe(2);
    expect(searchCards(col, "back:c_t").length).toBe(1);
    expect(searchCards(col, "is:new").length).toBe(3);
    expect(searchCards(col, "tag:none").length).toBe(1);
    expect(searchCards(col, '"mai son"').length).toBe(0);
    expect(searchCards(col, "-(dog or cat)").length).toBe(1);
  });
});
