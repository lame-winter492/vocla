# What the research says, and what Vocla does about it

These notes are short on purpose. Each finding is followed by what it changed in the app.

## 1. Scheduling: use a model of memory (FSRS)

- **Finding:** spacing reviews out works much better than cramming. That's one of the most robust results in memory research, and it holds for second-language vocabulary at every level of word knowledge, from recognising a word to producing it.
- **Finding:** a benchmark of spaced-repetition schedulers on hundreds of millions of reviews compared FSRS with SM-2, the algorithm Anki has used for decades. FSRS predicts recall much more accurately: log-loss ≈ 0.29 vs 0.35, and calibration error ≈ 5% vs 16%. That usually means fewer reviews for the same retention, though user reports vary.
- **In Vocla:**
  - FSRS-6 is the default scheduler, ported from the reference implementation with its published default parameters.
  - Each card tracks *stability* (days until recall drops to 90%) and *difficulty*.
  - Reviews are scheduled when predicted recall reaches your **desired retention**. The default is 90%, and you can set it in Deck options.
  - SM-2 is still available per preset.
  - Cards that SM-2 scheduled get an estimated memory state the first time FSRS sees them.
  - Card info shows stability, difficulty and the current recall chance.
  - Stats shows your true retention next to the target.

## 2. Retrieve, don't re-read, and practise both directions

- **Finding:** recalling a word from memory (testing) builds retention more than studying it again.
- **Finding:** training that makes you *produce* the word beat comprehension-only training. Productive recall (meaning → word) is the hardest level of word knowledge, and the one you need for speaking and writing.
- **In Vocla:**
  - The new default **Vocabulary** note type makes two cards per word: *Recognise* (word → meaning) and *Recall* (meaning → word).
  - Courses already mix recognition, production, listening and typing exercises, and wrong answers come back at the end of the lesson.

## 3. Don't let one card answer another

- **Finding:** when cards that give each other away (the two directions of a word, or similar words) are studied together, the second one is answered from short-term memory, not long-term memory. Similar items learned together also compete and slow learning.
- **In Vocla:** sibling burying is on by default, so a word's other direction waits until the next day.

## 4. Context, sound and meaning beat a bare word pair

- **Finding:** deliberate word-card learning works, especially with spaced retrieval, but it's strongest alongside meaning-focused input. An example sentence shows how the word is really used.
- **In Vocla:**
  - The Vocabulary note type has *Example* and *Example translation* fields, and the Add screen explains why they help.
  - The word is read aloud automatically (`{{tts auto:Word}}`) in the language set in Preferences, so you learn the pronunciation with the spelling.

## 5. Learn the most frequent words first

- **Finding:** in Nation's corpus figures, the most frequent ~2,000 word families cover close to 80% of written text. Comfortable reading needs ~95–98% coverage.
- **In Vocla:** this is a content decision, so it belongs to the course data. Order course vocabulary by frequency, from the most common words down.

## 6. Leeches: rewrite the card, don't just repeat it

- **Finding:** a card you keep failing usually has a problem with the card itself, such as no context or a confusable twin. Seeing it more often doesn't fix that.
- **In Vocla:** when a card becomes a leech, the message suggests adding an example sentence or a memory hook. It doesn't just say "leech".

## Not done yet (worth considering)

- Optimising FSRS parameters on your own review history. The defaults are a good start, and personal parameters need a few hundred reviews.
- Images on cards (dual coding) need media support first.
- A typed-answer variant of the Recall card, for spelling practice.

## Sources

- FSRS vs SM-2 benchmark: https://expertium.github.io/Benchmark.html · summary: https://www.diane.app/en/guides/fsrs-vs-sm2
- FSRS reference implementation (formulas, default parameters): https://github.com/open-spaced-repetition/py-fsrs
- Anki on FSRS: https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm
- Spacing in L2 vocabulary (receptive and productive levels): https://jyx.jyu.fi/bitstreams/2242755c-7d4b-4423-b8a3-a8b3b377e4d8/download
- Spacing vs extra study time in L2 retrieval practice: https://d.lib.msu.edu/etd/48649/FULL_TEXT/view
- Spaced retrieval meta-analysis (expanding vs uniform spacing): https://link.springer.com/10.1007/s10648-020-09572-8
- Production vs comprehension training; similarity-induced competition: https://par.nsf.gov//servlets/purl/10523494 , https://escholarship.org/content/qt85r106kk/qt85r106kk.pdf
- Nation, deliberate learning from word cards: https://www.cambridge.org/core/services/aop-cambridge-core/content/view/74EB1B4830C8A6C6A9E1490BCA444AD3
- Nation & Waring, vocabulary size and text coverage: https://lextutor.ca/research/nation_waring_97.html
