import { askText, askConfirm } from "./dialog";
import { useState } from "react";
import { store, useCol } from "../lib/store";
import type { DeckConfig, ID } from "../lib/types";
import { useNav } from "./nav";

const parseSteps = (s: string) =>
  s
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^([\d.]+)([smhd]?)$/);
      if (!m) return NaN;
      const n = parseFloat(m[1]);
      return m[2] === "s" ? n / 60 : m[2] === "h" ? n * 60 : m[2] === "d" ? n * 1440 : n;
    })
    .filter((n) => !isNaN(n) && n > 0);

const fmtSteps = (steps: number[]) =>
  steps.map((m) => (m >= 1440 && m % 1440 === 0 ? `${m / 1440}d` : m >= 60 && m % 60 === 0 ? `${m / 60}h` : m < 1 ? `${Math.round(m * 60)}s` : `${m}m`)).join(" ");

export function DeckOptions({ did }: { did: ID }) {
  const col = useCol();
  const { go, toast } = useNav();
  const deck = col.deck(did);
  const [conf, setConf] = useState<DeckConfig>(() => structuredClone(col.confFor(did)));
  const [newSteps, setNewSteps] = useState(fmtSteps(conf.new.steps));
  const [lapseSteps, setLapseSteps] = useState(fmtSteps(conf.lapse.steps));
  if (!deck) return <div className="page">Deck not found.</div>;

  const usedBy = Object.values(col.d.decks).filter((d) => d.confId === conf.id).length;

  const switchPreset = (id: ID) => {
    const c = structuredClone(col.d.dconf[id]);
    setConf(c);
    setNewSteps(fmtSteps(c.new.steps));
    setLapseSteps(fmtSteps(c.lapse.steps));
  };

  const save = (applyToChildren = false) => {
    const c = { ...conf, new: { ...conf.new, steps: parseSteps(newSteps) }, lapse: { ...conf.lapse, steps: parseSteps(lapseSteps) }, mod: Date.now() };
    store.update("Deck Options", (cc) => {
      cc.d.dconf[c.id] = c;
      cc.d.decks[did].confId = c.id;
      if (applyToChildren) for (const d of cc.deckAndChildren(did)) if (!d.dyn) d.confId = c.id;
    });
    toast("Options saved.");
    go({ name: "overview", did });
  };

  const num = (label: string, get: number, set: (v: number) => void, step = 1, hint?: string) => (
    <label>
      {label}{" "}
      <input type="number" step={step} value={get} onChange={(e) => set(Number(e.target.value))} style={{ width: 90 }} />
      {hint && <span className="muted small"> {hint}</span>}
    </label>
  );
  const upd = (fn: (c: DeckConfig) => void) =>
    setConf((c) => {
      const n = structuredClone(c);
      fn(n);
      return n;
    });

  return (
    <div className="page">
      <h2>Options for {deck.name}</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        Preset:
        <select value={conf.id} onChange={(e) => switchPreset(Number(e.target.value))}>
          {Object.values(col.d.dconf).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (used by {Object.values(col.d.decks).filter((d) => d.confId === c.id).length})
            </option>
          ))}
        </select>
        <button
          onClick={async () => {
            const name = await askText("Name for new preset:", "New preset");
            if (name) switchPreset(store.update("Add Preset", (cc) => cc.addConfig(name)).id);
          }}
        >
          Add
        </button>
        <button
          onClick={async () => {
            const name = await askText("Name for cloned preset:", conf.name + " copy");
            if (name) switchPreset(store.update("Clone Preset", (cc) => cc.addConfig(name, conf)).id);
          }}
        >
          Clone
        </button>
        <button
          onClick={async () => {
            const name = await askText("Rename preset:", conf.name);
            if (name) upd((c) => (c.name = name));
          }}
        >
          Rename
        </button>
        <button
          disabled={conf.id === 1}
          onClick={async () => {
            if (!await askConfirm(`Remove preset "${conf.name}" (used by ${usedBy} decks)?`)) return;
            store.update("Remove Preset", (cc) => cc.removeConfig(conf.id));
            switchPreset(1);
          }}
        >
          Remove
        </button>
      </div>

      <fieldset>
        <legend>Daily Limits</legend>
        {num("New cards/day", conf.new.perDay, (v) => upd((c) => (c.new.perDay = v)))}
        {num("Maximum reviews/day", conf.rev.perDay, (v) => upd((c) => (c.rev.perDay = v)))}
      </fieldset>

      <fieldset>
        <legend>New Cards</legend>
        <label>
          Learning steps <input value={newSteps} onChange={(e) => setNewSteps(e.target.value)} />
          <span className="muted small"> e.g. "1m 10m" (s, m, h, d)</span>
        </label>
        {num("Graduating interval (days)", conf.new.graduatingIvl, (v) => upd((c) => (c.new.graduatingIvl = v)))}
        {num("Easy interval (days)", conf.new.easyIvl, (v) => upd((c) => (c.new.easyIvl = v)))}
        {num("Starting ease", conf.new.initialFactor / 1000, (v) => upd((c) => (c.new.initialFactor = Math.round(v * 1000))), 0.01)}
        <label>
          Insertion order{" "}
          <select value={conf.new.order} onChange={(e) => upd((c) => (c.new.order = e.target.value as "added" | "random"))}>
            <option value="added">Sequential (oldest cards first)</option>
            <option value="random">Random</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Lapses</legend>
        <label>
          Relearning steps <input value={lapseSteps} onChange={(e) => setLapseSteps(e.target.value)} />
        </label>
        {num("New interval multiplier", conf.lapse.mult, (v) => upd((c) => (c.lapse.mult = v)), 0.05)}
        {num("Minimum interval (days)", conf.lapse.minIvl, (v) => upd((c) => (c.lapse.minIvl = v)))}
        {num("Leech threshold", conf.lapse.leechThreshold, (v) => upd((c) => (c.lapse.leechThreshold = v)))}
        <label>
          Leech action{" "}
          <select value={conf.lapse.leechAction} onChange={(e) => upd((c) => (c.lapse.leechAction = e.target.value as "suspend" | "tag"))}>
            <option value="tag">Tag Only</option>
            <option value="suspend">Suspend Card</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Display Order</legend>
        <label>
          New/review order{" "}
          <select value={conf.newMix} onChange={(e) => upd((c) => (c.newMix = e.target.value as DeckConfig["newMix"]))}>
            <option value="mix">Mix with reviews</option>
            <option value="after">Show after reviews</option>
            <option value="before">Show before reviews</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Burying</legend>
        <label>
          <input type="checkbox" checked={conf.new.bury} onChange={(e) => upd((c) => (c.new.bury = e.target.checked))} /> Bury new siblings
        </label>
        <label>
          <input type="checkbox" checked={conf.rev.bury} onChange={(e) => upd((c) => (c.rev.bury = e.target.checked))} /> Bury review siblings
        </label>
      </fieldset>

      <fieldset>
        <legend>Audio & Timer</legend>
        <label>
          <input type="checkbox" checked={conf.autoplay} onChange={(e) => upd((c) => (c.autoplay = e.target.checked))} /> Automatically play TTS
        </label>
        <label>
          <input type="checkbox" checked={conf.showTimer} onChange={(e) => upd((c) => (c.showTimer = e.target.checked))} /> Show answer timer
        </label>
        {num("Maximum answer seconds", conf.maxAnswerSecs, (v) => upd((c) => (c.maxAnswerSecs = v)))}
      </fieldset>

      <fieldset>
        <legend>Advanced</legend>
        {num("Maximum interval (days)", conf.rev.maxIvl, (v) => upd((c) => (c.rev.maxIvl = v)))}
        {num("Easy bonus", conf.rev.easyBonus, (v) => upd((c) => (c.rev.easyBonus = v)), 0.05)}
        {num("Interval modifier", conf.rev.ivlModifier, (v) => upd((c) => (c.rev.ivlModifier = v)), 0.05)}
        {num("Hard interval", conf.rev.hardFactor, (v) => upd((c) => (c.rev.hardFactor = v)), 0.05)}
      </fieldset>

      <div className="row">
        <button onClick={() => save(false)}>Save</button>
        <button onClick={() => save(true)}>Save to All Subdecks</button>
        <button onClick={() => go({ name: "overview", did })}>Cancel</button>
      </div>
    </div>
  );
}
