# Vocla

A vocabulary app with Anki's feature set. It runs in the browser and stores data locally in IndexedDB. The UI is deliberately plain for now.

```sh
npm install
npm run dev      # start dev server
npm test         # unit tests (scheduler, templates, search, queues)
npm run build    # typecheck + production build
npm run ios      # build, sync into the iOS project and open Xcode (macOS)
```

**iOS app:** a native Capacitor wrapper of the same app lives in `ios/`. It has real haptics, the share sheet for exports and fully offline fonts. See [docs/ios-app.md](docs/ios-app.md) for how to build and run it on an iPhone.

## Features (Anki parity)

- **Decks**: nested decks using `Parent::Child`, with New/Learn/Due counts. You can collapse, rename, delete, add a description and unbury. Each deck has an overview screen.
- **Filtered decks**: build a deck from a search, with up to 2 filters, a limit and an order. You can turn rescheduling on, or turn it off to use preview mode with Again/Hard/Good delays. Rebuild and Empty work as in Anki.
- **Custom study**: raise today's new or review limit, review forgotten cards, review ahead, preview new cards, or study by state or tag.
- **Scheduler**: SM-2 that follows Anki's v3 scheduler.
  - Learning and relearning steps, including the special Hard delay.
  - Graduating and easy intervals, ease changes and the easy bonus.
  - Hard interval, interval modifier and maximum interval.
  - Lapse multiplier and minimum interval.
  - Interval fuzz, interday learning and day rollover (4am by default).
  - Learn-ahead limit and early reviews in filtered decks.
  - Leech detection: tag it, or tag and suspend it.
  - Daily limits per deck, also capped by parent decks.
  - Order options: mix new cards with reviews, or show them before or after.
  - Burying of new and review siblings.
- **Deck option presets**: shared between decks. You can add, clone, rename and remove presets, or save one to all subdecks.
- **Note types**: Basic, Basic (and reversed), Basic (optional reversed), Basic (type in answer) and Cloze. You can create your own and edit fields (add, rename, delete, reorder, set the sort field). You can also edit card templates (front, back and CSS with a live preview) and add or remove card types.
- **Template syntax**:
  - Fields and `{{FrontSide}}`.
  - Conditionals: `{{#F}}`, `{{^F}}`.
  - Filters: `text:`, `hint:`, `type:`, `cloze:`, `type:cloze:`, `furigana`/`kana`/`kanji`.
  - Speech: `{{tts en_US:F}}` uses browser speech synthesis.
  - Special fields: `{{Tags}}`, `{{Deck}}`, `{{Subdeck}}`, `{{Card}}`, `{{Type}}`, `{{CardFlag}}`.
  - Scripts inside templates run.
- **Reviewer**:
  - Show the answer, then rate with Again/Hard/Good/Easy. Each button shows the next interval.
  - Type-in answers are compared character by character.
  - Counts show which queue the current card comes from.
  - Edit the card, mark it, flag it (1–7), bury or suspend the card or note, delete the note, see card info, replay TTS, and undo.
  - Optional answer timer. Anki's keyboard shortcuts work.
- **Add**: choose note type and deck, warn on duplicates, keep tags between notes, cloze shortcut (Ctrl+Shift+C), add with Ctrl+Enter.
- **Browser**:
  - Search uses Anki syntax: `deck:`, `tag:`, `note:`, `card:`, `is:new/learn/review/due/suspended/buried`, `flag:`, `added:`, `rated:`, `edited:`, `introduced:`, `prop:ivl>=10`, `field:value`, `re:`, `nc:`, `nid:`, `cid:`. It supports `or`, `-` and `()`, quotes, and the `*`/`_` wildcards.
  - Switch between card and note views, sort by column, select multiple rows, and edit notes inline. A sidebar lists decks, note types, tags, flags, states and saved searches.
  - Bulk actions: change deck, set due date, forget, reposition, suspend, bury, flag, mark, add or remove tags, find & replace, change note type, card info, preview, delete.
- **Stats**:
  - Today's summary.
  - Charts of future due, reviews and review time.
  - Card counts, the interval and ease distributions, answer buttons and an hourly breakdown.
- **Import/Export**:
  - Plain-text CSV/TSV, using Anki's `#separator:`, `#html:`, `#tags column:`, `#deck:` and `#notetype:` headers. You choose the field mapping and how duplicates are handled.
  - Deck packages with or without scheduling.
  - Full collection backup and restore.
- **Courses** (Duolingo-style): courses → units → lessons, unlocked in order. There are 5 exercise types: multiple choice, translate (typed or word bank), match pairs, listen & type (TTS), and fill in the blank. Mistakes come back at the end of the lesson. You get XP, a streak and best accuracy, and a lesson's words can go to a deck for spaced repetition. Courses are imported as JSON; the format is in [docs/course-format.md](docs/course-format.md).
- **Tools**: undo/redo with Ctrl+Z / Ctrl+Shift+Z, Check Database, Empty Cards, and preferences for day rollover, learn-ahead and display.

Not done yet: importing Anki `.apkg` files, sync, the FSRS scheduler, and media files (images can be added as `<img src="https://...">`).

AI ideas (not implemented yet): [docs/ai-ideas.md](docs/ai-ideas.md).

## Layout

- `src/lib`: framework-free core (`col.ts` collection ops and queues, `scheduler.ts`, `template.ts`, `search.ts`, `importexport.ts`, `store.ts` persistence and undo).
- `src/ui`: React screens.
