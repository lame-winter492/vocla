import { askConfirm, showMessage } from "./dialog";
import { store, useCol } from "../lib/store";
import { useNav } from "./nav";
import { currentDesign } from "./App";

export function Prefs() {
  const col = useCol();
  const { toast, go } = useNav();
  const p = col.d.prefs;
  const set = (fn: () => void) => store.update("Preferences", fn);

  return (
    <div className="page narrow">
      <h2>Preferences</h2>
      <fieldset>
        <legend>Scheduling</legend>
        <label>
          Next day starts at{" "}
          <input type="number" min={0} max={23} value={p.rolloverHour} onChange={(e) => set(() => (p.rolloverHour = Number(e.target.value)))} /> hours past
          midnight
        </label>
        <label>
          Learn ahead limit{" "}
          <input type="number" min={0} value={p.learnAheadMins} onChange={(e) => set(() => (p.learnAheadMins = Number(e.target.value)))} /> mins
        </label>
      </fieldset>
      <fieldset>
        <legend>Appearance</legend>
        <label>
          <input type="radio" name="design" checked={currentDesign(p.design) === "focus"} onChange={() => set(() => (p.design = "focus"))} /> Focus: dark,
          one big next step
        </label>
        <label>
          <input type="radio" name="design" checked={currentDesign(p.design) === "glass"} onChange={() => set(() => (p.design = "glass"))} /> Liquid
          Glass: like a built-in iOS app, follows light/dark mode
        </label>
      </fieldset>
      <fieldset>
        <legend>Learning</legend>
        <label>
          Language you&#39;re learning (for audio){" "}
          <select id="pref-lang" value={p.targetLang} onChange={(e) => set(() => (p.targetLang = e.target.value))}>
            {LANGS.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="small muted">Used by the Vocabulary note type to read words and examples aloud.</div>
        <label>
          <input type="checkbox" checked={p.haptics} onChange={(e) => set(() => (p.haptics = e.target.checked))} /> Haptic feedback on phones
        </label>
      </fieldset>
      <fieldset>
        <legend>Review</legend>
        <label>
          <input type="checkbox" checked={p.showIntervalsOnButtons} onChange={(e) => set(() => (p.showIntervalsOnButtons = e.target.checked))} /> Show
          next review time above answer buttons
        </label>
        <label>
          <input type="checkbox" checked={p.showRemaining} onChange={(e) => set(() => (p.showRemaining = e.target.checked))} /> Show remaining card count
        </label>
      </fieldset>
      <fieldset>
        <legend>Tools</legend>
        <div className="row">
          <button
            onClick={async () => {
              const msgs = store.update("Check Database", (c) => c.checkDatabase());
              await showMessage(msgs.join("\n"));
            }}
          >
            Check Database
          </button>
          <button
            onClick={async () => {
              const cids = col.emptyCards();
              if (!cids.length) return toast("No empty cards.");
              if (await askConfirm(`Delete ${cids.length} empty cards?`)) {
                store.update("Empty Cards", (c) => c.removeCards(cids));
                toast(`${cids.length} cards deleted.`);
              }
            }}
          >
            Empty Cards
          </button>
          <button onClick={() => go({ name: "export" })}>Create Backup</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>Keyboard shortcuts</legend>
        <div className="small">
          Global: <b>d</b> decks, <b>a</b> add, <b>b</b> browse, <b>t</b> stats, <b>/</b> study current deck, <b>f</b> filtered deck, <b>Ctrl+Z</b> undo.
          <br />
          Review: <b>Space/Enter</b> show answer / Good, <b>1-4</b> answer, <b>e</b> edit, <b>*</b> mark, <b>-</b> bury card, <b>=</b> bury note, <b>@</b>{" "}
          suspend card, <b>!</b> suspend note, <b>Ctrl+Del</b> delete note, <b>Ctrl+1-7</b> flag, <b>i</b> card info, <b>r</b> replay audio, <b>o</b>{" "}
          options, <b>z</b> undo, <b>Esc</b> back.
          <br />
          Editor: <b>Ctrl+Enter</b> add, <b>Ctrl+Shift+C</b> cloze (add Alt for same number), <b>Ctrl+B/I/U</b> formatting.
        </div>
      </fieldset>
      <p className="muted small">
        {Object.keys(col.d.notes).length} notes, {Object.keys(col.d.cards).length} cards, {col.d.revlog.length} review log entries. Data is stored locally in
        your browser.
      </p>
    </div>
  );
}

const LANGS: [string, string][] = [
  ["es-ES", "Spanish (Spain)"],
  ["es-MX", "Spanish (Mexico)"],
  ["fr-FR", "French"],
  ["de-DE", "German"],
  ["it-IT", "Italian"],
  ["pt-BR", "Portuguese (Brazil)"],
  ["pt-PT", "Portuguese (Portugal)"],
  ["nl-NL", "Dutch"],
  ["sv-SE", "Swedish"],
  ["pl-PL", "Polish"],
  ["ru-RU", "Russian"],
  ["uk-UA", "Ukrainian"],
  ["tr-TR", "Turkish"],
  ["ar-SA", "Arabic"],
  ["hi-IN", "Hindi"],
  ["ja-JP", "Japanese"],
  ["ko-KR", "Korean"],
  ["zh-CN", "Chinese (Mandarin)"],
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
];
