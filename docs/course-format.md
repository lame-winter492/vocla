# Course format

Courses are JSON files. In the app, go to **Courses → Import course** to load one. A file can hold one course object or an array of courses. If you import a course whose `id` already exists, it replaces the old one, and your progress is kept.

```jsonc
{
  "id": "fr-en",                 // unique, stable (progress is stored per id)
  "title": "French for English speakers",
  "sourceLang": "en",            // learner's language
  "targetLang": "fr-FR",         // language being learned; also used for text-to-speech
  "description": "optional",
  "units": [
    {
      "id": "u1",
      "title": "Basics 1",
      "description": "optional",
      "lessons": [
        {
          "id": "u1-l1",         // unique across the whole course
          "title": "Greetings",
          "tips": "<p>optional HTML shown via the Tips button</p>",

          // Option A: just give vocab and exercises are generated automatically
          "vocab": [
            { "word": "bonjour", "translation": "hello", "note": "optional" }
          ],

          // Option B: hand-write exercises (vocab is still used for "add to deck")
          "exercises": [ /* see below */ ]
        }
      ]
    }
  ]
}
```

Lessons unlock one at a time, in order across all units.

## Exercise types

| type | fields | what the learner does |
|---|---|---|
| `choice` | `prompt`, `choices[]`, `answer` (index or string), `speak?` | picks one option (keys 1–9 also work) |
| `translate` | `prompt`, `answers[]`, `wordBank?[]`, `speak?` | types the translation, or taps words when `wordBank` is given |
| `match` | `pairs: [[target, source], ...]` | taps matching pairs |
| `listen` | `text`, `answers?[]` | hears `text` read aloud, then types it |
| `fill` | `sentence` (with `___`), `answers[]`, `choices?[]`, `translation?` | fills in the blank, by typing or by picking a choice |

`speak: true` reads the prompt aloud in `targetLang`.

### Answer checking

- Answers are checked leniently. Case, punctuation and extra spaces are ignored. `’` counts as `'`.
- An answer that is right apart from its accents is accepted, with a note to watch the accents.
- List every accepted variant in `answers`. The first one is shown as the correct answer.

### Generated exercises

When a lesson has only `vocab`, the app generates these exercises:
- multiple choice from target to source for each word
- one matching board
- multiple choice from source to target for each word
- 3 listening exercises
- 3 translations to type

Wrong options are drawn from the vocab of the whole course.

### Lesson flow

- A wrong answer sends the exercise back to the end of the lesson, like Duolingo does.
- At the end, the learner sees XP and first-try accuracy, and can add the lesson's words to the deck `Courses::<course title>` as two-way flashcards. From then on, Anki-style spaced repetition schedules them.
