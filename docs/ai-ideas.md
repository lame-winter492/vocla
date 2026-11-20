# AI integration: ideas (not built yet)

The goal is to help learners a lot without making the app complicated. Everything below assumes **the user brings their own API key**. The app has no server, so the browser calls the AI provider directly.

## Ground rules

1. **One small AI module, many small features.** Put a single file `src/lib/ai.ts` with roughly `ask(task, input) → result`. Every feature is a short prompt plus a JSON schema on top of it. UI code never builds prompts.
2. **AI is optional.** With no key set, AI buttons are hidden and nothing else changes.
3. **The AI suggests and the user decides.** Generated cards, edits and courses always show up as a preview with Accept, Edit and Discard. AI never writes to the collection silently. Changes go through `store.update(...)`, so undo works.
4. **Context comes from data we already have:** the current card's fields, the note type, the deck name, the course's languages, and the card's review history (lapses, ease). No embeddings, vector database or chat history storage are needed for v1.
5. **Structured output for anything the app will parse.** Use JSON schemas for card suggestions, exercise lists and grading verdicts. Plain streamed text is only for free-form explanations.

## Feature ideas, by value and effort

### Tier 1: cheap to build, high value
- **"Explain this card" in the reviewer** (a button after showing the answer).
  - Explains meaning, nuance, an example sentence, a mnemonic, and common confusions.
  - It's a streamed answer in a side panel. Follow-up questions in the same panel make it a mini chat scoped to that card.
- **"Why was I wrong?" for type-in answers.**
  - We already compute the diff. The AI says whether the mistake is a typo, a wrong gender or conjugation, a near-synonym, or plain wrong.
  - For near-synonyms it can suggest adding the answer as an accepted variant.
  - Courses benefit the most here, because answer checking there is strict string matching.
- **Generate cards from a word list or text.**
  - The user pastes a word list, a paragraph or song lyrics. The AI returns `[{word, translation, example, notes}]` against a schema.
  - The user ticks which ones to add. Duplicates are flagged with the existing `findDupes`.
- **Fill missing fields.** Select notes in the browser and fill the "Example" or "Notes" field for all of them. This is a batch job with a preview of the changes before saving.

### Tier 2: more work, still simple
- **Leech helper.** When a card becomes a leech (we already detect this), offer to rewrite it, split it into easier cards, or add a mnemonic.
- **AI-graded free answers in courses.**
  - A `translate` exercise whose answer doesn't match any listed `answers` can be sent to the AI with the prompt, the expected answers and the user's answer.
  - The AI returns a verdict (correct, almost, wrong) plus a short reason.
  - This removes the need to list every possible translation when writing courses.
- **Course and lesson generator.**
  - From a topic plus a level (e.g. "A2 Spanish, food"), generate a lesson as JSON in the format of `docs/course-format.md`.
  - Run it through `validateCourse`, preview it, then import it. The course format we already have doubles as the schema.
- **Daily summary and study coach.**
  - From stats (retention, forecast, leeches), produce two or three sentences of advice and suggest a filtered deck, e.g. "rebuild your 12 leeches as a custom session".
  - The AI only proposes a search. The app builds the deck.

### Tier 3: later, if wanted
- Conversation practice in the target language, using the user's known words. Words are "known" when the card interval is 21 days or more.
- Pronunciation feedback (speech to text, then compare).
- Images for cards (needs media support first).

## Settings needed

- Preferences gets an **AI** section:
  - provider (start with one)
  - API key
  - model (preset, with an advanced override)
  - a "test connection" button
  - a monthly spend note
- Store the key in the browser only (IndexedDB). Never put it in exports or backups. Tell the user plainly that it is stored locally, unencrypted, on this device.
- Collect usage per feature locally (token counts from responses) so users can see what costs what.

## Provider notes (as of Nov 2026, Anthropic API)

- **Calling from the browser.**
  - Requests from a web page need the header `anthropic-dangerous-direct-browser-access: true`.
  - The official TypeScript SDK `@anthropic-ai/sdk` sets it with `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`.
  - The "dangerous" part is about exposing *your own* key in a public site. With a key the user typed in themselves, that is acceptable. Never ship a built-in key.
- **Models and pricing (per million input/output tokens).** The user picks one; a sensible default is the cheap model.

  | Model | Input | Output | Use for |
  |---|---|---|---|
  | `claude-haiku-5-5` | $0.10 | $0.50 | Cheapest. Fine for explanations, grading answers and filling fields. |
  | `claude-sonnet-5-5` | $2 | $10 | Mid-tier. Better for generating courses or cards from long texts. |
  | `claude-opus-5-5` | $4 | $20 | Most capable Opus. For heavy generation, if the user wants it. |

  Ballpark: explaining one card is roughly 1–2k tokens, which comes to a fraction of a cent on the cheap model.
- **Structured outputs.**
  - Ask for JSON that matches a schema (`output_config.format`, or `client.messages.parse()` with a Zod schema in the SDK).
  - This is right for card suggestions, grading verdicts and generated lessons, with no fragile text parsing.
- **Streaming.** Use streaming for explanation and chat text so it appears as it's written, and use the SDK's `finalMessage()` when we only need the end result.
- **Prompt caching.**
  - Put the stable part first: system prompt, course or deck context, then the per-card part last.
  - Mark the stable prefix with `cache_control`.
  - Batch jobs like "fill 200 notes" reuse that prefix, so repeated requests are much cheaper.
  - Very short prompts won't cache, which is fine.
- **Refusals and errors.**
  - Check `stop_reason` before reading the answer.
  - Map the common errors to plain messages:
    - 401: bad key
    - 429: slow down
    - network errors: offline
- **Keep it swappable.** If we ever add other providers, only `ai.ts` changes, because the rest of the app sees `ask(task, input)`.

## Suggested first step

Build Tier 1's "Explain this card" plus the AI settings section. That exercises the whole pipeline: key storage, browser call, streaming and a side panel. Every later feature is then mostly a new prompt and schema.
