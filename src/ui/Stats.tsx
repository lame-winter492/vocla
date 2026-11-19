import { useState } from "react";
import { useCol } from "../lib/store";
import { dayNumber } from "../lib/time";
import { CardType, Queue, type ID } from "../lib/types";

function Bars({ values, labels, title }: { values: number[]; labels?: string[]; title: string }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div style={{ marginBottom: 20 }}>
      <h3>
        {title} <span className="muted small">(total {total})</span>
      </h3>
      <div className="bars">
        {values.map((v, i) => (
          <div key={i} style={{ height: `${(v / max) * 100}%` }} title={`${labels?.[i] ?? i}: ${v}`} />
        ))}
      </div>
      {labels && (
        <div className="row small muted" style={{ justifyContent: "space-between" }}>
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

export function Stats({ did: initial }: { did?: ID }) {
  const col = useCol();
  const [scope, setScope] = useState<"deck" | "all">(initial ? "deck" : "deck");
  const [period, setPeriod] = useState(30);
  const did = initial ?? col.d.prefs.currentDeck;
  const deck = col.deck(did);
  const dids = new Set(scope === "all" ? Object.keys(col.d.decks).map(Number) : col.deckAndChildren(did).map((d) => d.id));
  const cards = Object.values(col.d.cards).filter((c) => dids.has(c.did) || dids.has(c.odid));
  const cids = new Set(cards.map((c) => c.id));
  const logs = col.d.revlog.filter((r) => cids.has(r.cid) && r.ease > 0);
  const today = col.today();
  const roll = col.d.prefs.rolloverHour;

  // today
  const todayLogs = logs.filter((r) => dayNumber(r.id, roll) === today);
  const todayTime = todayLogs.reduce((s, r) => s + r.time, 0) / 1000;
  const todayAgain = todayLogs.filter((r) => r.ease === 1).length;
  const matureLogs = todayLogs.filter((r) => r.type === 1 && r.lastIvl >= 21);
  const matureCorrect = matureLogs.filter((r) => r.ease > 1).length;

  // forecast
  const forecast = new Array(period).fill(0);
  for (const c of cards) {
    if (c.queue === Queue.Review || c.queue === Queue.DayLearn) {
      const d = Math.max(0, c.due - today);
      if (d < period) forecast[d]++;
    } else if (c.queue === Queue.Learn) forecast[0]++;
  }

  // reviews per day
  const perDay = new Array(period).fill(0);
  const timePerDay = new Array(period).fill(0);
  for (const r of logs) {
    const ago = today - dayNumber(r.id, roll);
    if (ago >= 0 && ago < period) {
      perDay[period - 1 - ago]++;
      timePerDay[period - 1 - ago] += r.time / 60000;
    }
  }

  // card counts
  const counts = { new: 0, learn: 0, young: 0, mature: 0, suspended: 0, buried: 0 };
  for (const c of cards) {
    if (c.queue === Queue.Suspended) counts.suspended++;
    else if (c.queue < -1) counts.buried++;
    else if (c.type === CardType.New) counts.new++;
    else if (c.type === CardType.Learn || c.type === CardType.Relearn) counts.learn++;
    else if (c.ivl >= 21) counts.mature++;
    else counts.young++;
  }

  // intervals
  const reviewCards = cards.filter((c) => c.type === CardType.Review);
  const maxIvl = 60;
  const ivls = new Array(maxIvl + 1).fill(0);
  for (const c of reviewCards) ivls[Math.min(c.ivl, maxIvl)]++;
  const avgIvl = reviewCards.length ? reviewCards.reduce((s, c) => s + c.ivl, 0) / reviewCards.length : 0;

  // ease
  const eases = new Array(17).fill(0); // 130%..450% in 20% buckets
  for (const c of reviewCards) eases[Math.min(16, Math.max(0, Math.floor((c.factor - 1300) / 200)))]++;
  const avgEase = reviewCards.length ? reviewCards.reduce((s, c) => s + c.factor, 0) / reviewCards.length / 10 : 0;

  // answer buttons
  const buttons: Record<string, number[]> = { Learning: [0, 0, 0, 0], Young: [0, 0, 0, 0], Mature: [0, 0, 0, 0] };
  const cutoffDay = today - period;
  for (const r of logs) {
    if (dayNumber(r.id, roll) <= cutoffDay) continue;
    const k = r.type === 0 || r.type === 2 ? "Learning" : r.lastIvl >= 21 ? "Mature" : "Young";
    buttons[k][r.ease - 1]++;
  }

  // hourly breakdown
  const hours = new Array(24).fill(0);
  const hoursOk = new Array(24).fill(0);
  for (const r of logs) {
    if (dayNumber(r.id, roll) <= cutoffDay) continue;
    const h = new Date(r.id).getHours();
    hours[h]++;
    if (r.ease > 1) hoursOk[h]++;
  }

  const daysStudied = perDay.filter((x) => x > 0).length;

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Statistics</h2>
        <select value={scope} onChange={(e) => setScope(e.target.value as "deck" | "all")}>
          <option value="deck">Deck: {deck?.name}</option>
          <option value="all">Collection</option>
        </select>
        <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
          <option value={30}>1 month</option>
          <option value={365}>1 year</option>
        </select>
      </div>

      <h3>Today</h3>
      <p>
        Studied {todayLogs.length} cards in {(todayTime / 60).toFixed(1)} minutes today ({todayLogs.length ? (todayTime / todayLogs.length).toFixed(1) : 0}s/card).
        <br />
        Again count: {todayAgain} ({todayLogs.length ? (((todayLogs.length - todayAgain) / todayLogs.length) * 100).toFixed(1) : 0}% correct).
        <br />
        Learn: {todayLogs.filter((r) => r.type === 0).length}, Review: {todayLogs.filter((r) => r.type === 1).length}, Relearn:{" "}
        {todayLogs.filter((r) => r.type === 2).length}, Filtered: {todayLogs.filter((r) => r.type === 3).length}.
        <br />
        Correct answers on mature cards: {matureCorrect}/{matureLogs.length}
        {matureLogs.length ? ` (${((matureCorrect / matureLogs.length) * 100).toFixed(1)}%)` : ""}.
      </p>

      <Bars title="Future Due" values={forecast} labels={["today", `+${period - 1}d`]} />
      <p className="small muted">Due tomorrow: {forecast[1] ?? 0}. Average per day: {(forecast.reduce((a, b) => a + b, 0) / period).toFixed(1)}.</p>
      <Bars title="Reviews" values={perDay} labels={[`-${period - 1}d`, "today"]} />
      <p className="small muted">
        Days studied: {daysStudied} of {period} ({Math.round((daysStudied / period) * 100)}%). Average: {(perDay.reduce((a, b) => a + b, 0) / Math.max(1, daysStudied)).toFixed(1)} cards/day studied.
      </p>
      <Bars title="Review Time (minutes)" values={timePerDay.map((m) => Math.round(m * 10) / 10)} labels={[`-${period - 1}d`, "today"]} />

      <h3>Card Counts</h3>
      <table>
        <tbody>
          {Object.entries(counts).map(([k, v]) => (
            <tr key={k}>
              <td style={{ textTransform: "capitalize" }}>{k}</td>
              <td>{v}</td>
              <td className="muted">{cards.length ? ((v / cards.length) * 100).toFixed(1) : 0}%</td>
            </tr>
          ))}
          <tr>
            <td>
              <b>Total</b>
            </td>
            <td>{cards.length}</td>
          </tr>
        </tbody>
      </table>

      <Bars title="Review Intervals (days)" values={ivls} labels={["0", `${maxIvl}+`]} />
      <p className="small muted">Average interval: {avgIvl.toFixed(1)} days. Longest: {Math.max(0, ...reviewCards.map((c) => c.ivl))} days.</p>
      <Bars title="Card Ease" values={eases} labels={["130%", "450%+"]} />
      <p className="small muted">Average ease: {avgEase.toFixed(0)}%.</p>

      <h3>Answer Buttons</h3>
      <table>
        <thead>
          <tr>
            <th />
            <th>Again</th>
            <th>Hard</th>
            <th>Good</th>
            <th>Easy</th>
            <th>Correct</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(buttons).map(([k, v]) => {
            const t = v.reduce((a, b) => a + b, 0);
            return (
              <tr key={k}>
                <td>{k}</td>
                {v.map((x, i) => (
                  <td key={i}>{x}</td>
                ))}
                <td>{t ? (((t - v[0]) / t) * 100).toFixed(1) : 0}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Bars title="Hourly Breakdown (reviews by hour)" values={hours} labels={["0h", "23h"]} />
      <p className="small muted">
        Best hour:{" "}
        {(() => {
          let best = -1, rate = -1;
          hours.forEach((h, i) => {
            if (h >= 5 && hoursOk[i] / h > rate) {
              rate = hoursOk[i] / h;
              best = i;
            }
          });
          return best >= 0 ? `${best}:00 (${(rate * 100).toFixed(0)}% correct)` : "not enough data";
        })()}
      </p>
    </div>
  );
}
