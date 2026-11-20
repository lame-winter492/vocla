import { fsrs } from "../lib/fsrs";
import { useCol } from "../lib/store";
import { formatDate, formatDays, formatIvlSecs } from "../lib/time";
import { stripHtml } from "../lib/template";
import { CardType, Queue } from "../lib/types";

const TYPE_NAMES = ["Learn", "Review", "Relearn", "Filtered", "Manual"];

export function CardInfo({ cid }: { cid: number }) {
  const col = useCol();
  const card = col.d.cards[cid];
  if (!card) return <div>Card not found.</div>;
  const note = col.d.notes[card.nid];
  const nt = col.d.notetypes[note?.ntid];
  const logs = col.d.revlog.filter((r) => r.cid === cid);
  const reviews = logs.filter((r) => r.ease > 0);
  const totalTime = reviews.reduce((s, r) => s + r.time, 0) / 1000;
  const today = col.today();

  let due = "";
  if (card.queue === Queue.New) due = `New #${card.due}`;
  else if (card.queue === Queue.Learn) due = formatDate(card.due);
  else if (card.queue === Queue.Review || card.queue === Queue.DayLearn) due = `${formatDate(Date.now() + (card.due - today) * 86400e3)}`;
  if (card.queue === Queue.Suspended) due = "(suspended)";
  if (card.queue < -1) due = "(buried)";

  const rows: [string, string | number][] = [
    ["Sort Field", stripHtml(note?.fields[nt?.sortField ?? 0] ?? "")],
    ["Added", formatDate(card.id)],
    ["First Review", reviews.length ? formatDate(reviews[0].id) : "—"],
    ["Latest Review", reviews.length ? formatDate(reviews[reviews.length - 1].id) : "—"],
    ["Due", due],
    ["Interval", card.type === CardType.Review ? formatDays(card.ivl, false) : "—"],
    ...(card.stability
      ? ([
          ["Stability", `${card.stability < 1 ? card.stability.toFixed(2) : card.stability.toFixed(1)} days`],
          ["Difficulty", `${Math.round(((card.difficulty ?? 5) - 1) / 9 * 100)}%`],
          [
            "Recall chance now",
            `${Math.round(fsrs.retrievability(card.lastReview ? (Date.now() - card.lastReview) / 86400_000 : 0, card.stability) * 100)}%`,
          ],
        ] as [string, string][])
      : ([["Ease", card.factor ? `${card.factor / 10}%` : "—"]] as [string, string][])),
    ["Reviews", card.reps],
    ["Lapses", card.lapses],
    ["Average Time", reviews.length ? `${(totalTime / reviews.length).toFixed(1)}s` : "—"],
    ["Total Time", `${totalTime.toFixed(0)}s`],
    ["Card Type", col.cardTemplateName(card)],
    ["Note Type", nt?.name ?? ""],
    ["Deck", col.deck(card.did)?.name + (card.odid ? ` (${col.deck(card.odid)?.name})` : "")],
    ["Card ID", card.id],
    ["Note ID", card.nid],
  ];

  return (
    <div>
      <h3>Card Info</h3>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="muted">{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {logs.length > 0 && (
        <>
          <h3>Review History</h3>
          <table className="small">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Rating</th>
                <th>Interval</th>
                <th>Ease</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {[...logs].reverse().map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.id).toLocaleString()}</td>
                  <td>{TYPE_NAMES[r.type]}</td>
                  <td>{r.ease || "—"}</td>
                  <td>{r.ivl < 0 ? formatIvlSecs(-r.ivl) : r.ivl ? formatDays(r.ivl) : "—"}</td>
                  <td>{r.factor ? `${r.factor / 10}%` : "—"}</td>
                  <td>{(r.time / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
