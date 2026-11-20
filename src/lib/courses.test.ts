import { describe, expect, it } from "vitest";
import { Col } from "./col";
import { checkAnswer, emptyProgress, generateExercises, isUnlocked, SAMPLE_COURSE, streak, validateCourse } from "./courses";
import { emptyCollection } from "./stock";

describe("courses", () => {
  it("checks answers leniently", () => {
    expect(checkAnswer("  Je suis un homme. ", ["Je suis un homme"])).toBe("correct");
    expect(checkAnswer("je suis un homme!", ["Je suis un homme"])).toBe("correct");
    expect(checkAnswer("un garcon", ["un garçon"])).toBe("accent");
    expect(checkAnswer("un chien", ["un garçon"])).toBe("wrong");
    expect(checkAnswer("", ["x"])).toBe("wrong");
  });

  it("generates exercises from vocab", () => {
    const vocab = SAMPLE_COURSE.units[0].lessons[0].vocab!;
    const ex = generateExercises(vocab);
    expect(ex.filter((e) => e.type === "choice").length).toBe(vocab.length * 2);
    expect(ex.some((e) => e.type === "match")).toBe(true);
    for (const e of ex) if (e.type === "choice") expect(e.choices).toContain(e.answer);
  });

  it("unlocks lessons in order and tracks streaks", () => {
    const p = emptyProgress();
    expect(isUnlocked(SAMPLE_COURSE, p, "u1l1")).toBe(true);
    expect(isUnlocked(SAMPLE_COURSE, p, "u1l2")).toBe(false);
    p.lessons["sample-fr"] = { u1l1: { best: 1, times: 1, last: 0 } };
    expect(isUnlocked(SAMPLE_COURSE, p, "u1l2")).toBe(true);
    expect(streak([8, 9, 10], 10)).toBe(3);
    expect(streak([8, 9], 10)).toBe(2);
    expect(streak([7, 8], 10)).toBe(0);
  });

  it("validates course json", () => {
    expect(validateCourse(SAMPLE_COURSE)).toBeNull();
    expect(validateCourse({ id: "x", title: "y", units: [{ id: "u", lessons: [{ id: "l", title: "L" }] }] })).toMatch(/vocab or exercises/);
  });

  it("records progress and adds vocab to a deck", () => {
    const col = new Col(emptyCollection());
    const xp = col.completeLesson("sample-fr", "u1l1", 1);
    expect(xp).toBe(20);
    expect(col.d.courseProgress.days.length).toBe(1);
    const vocab = SAMPLE_COURSE.units[0].lessons[0].vocab!;
    expect(col.addVocabToDeck("French", vocab, "course::fr")).toBe(4);
    expect(col.addVocabToDeck("French", vocab, "course::fr")).toBe(0);
    expect(Object.keys(col.d.cards).length).toBe(8); // reversed cards
    expect(col.deckByName("Courses::French")).toBeTruthy();
  });
});
