// Day boundaries follow Anki: a new "day" begins at the rollover hour (default 4am local).

export function dayNumber(ms: number, rolloverHour: number): number {
  const d = new Date(ms - rolloverHour * 3600_000);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400_000);
}

/** Epoch ms at which the given day number begins (local time, at rollover). */
export function dayStart(day: number, rolloverHour: number): number {
  const d = new Date(day * 86400_000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), rolloverHour).getTime();
}

export function formatIvlSecs(secs: number, short = true): string {
  const abs = Math.abs(secs);
  const fmt = (n: number, unit: string, longUnit: string) => {
    const v = n >= 10 || Number.isInteger(n) ? Math.round(n).toString() : n.toFixed(1);
    return short ? `${v}${unit}` : `${v} ${longUnit}${v === "1" ? "" : "s"}`;
  };
  if (abs < 60) return fmt(abs, "s", "second");
  if (abs < 3600) return fmt(Math.round(abs / 60), "m", "minute");
  if (abs < 86400) return fmt(Math.round((abs / 3600) * 10) / 10, "h", "hour");
  const days = abs / 86400;
  if (days < 30) return fmt(Math.round(days * 10) / 10, "d", "day");
  if (days < 365) return fmt(Math.round((days / 30) * 10) / 10, "mo", "month");
  return fmt(Math.round((days / 365) * 10) / 10, "y", "year");
}

export function formatDays(days: number, short = true): string {
  return formatIvlSecs(days * 86400, short);
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
