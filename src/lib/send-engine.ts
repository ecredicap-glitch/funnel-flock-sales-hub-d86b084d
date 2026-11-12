// Pure anti-ban rules. Brazil (Brasília/Belém) = UTC-3, no DST.
export function brParts(d: Date) {
  const b = new Date(d.getTime() - 3 * 3600_000);
  return { hour: b.getUTCHours(), day: b.getUTCDay(), date: b.toISOString().slice(0, 10) };
}
export function inWindow(d: Date, start: number, end: number, days: number[]) {
  const p = brParts(d);
  return days.includes(p.day) && p.hour >= start && p.hour < end;
}
/** Start of the current Brazilian day, as a UTC Date. */
export function brDayStart(d: Date) {
  return new Date(`${brParts(d).date}T03:00:00.000Z`);
}
export function randBetween(min: number, max: number, rnd = Math.random) {
  return min + Math.floor(rnd() * (Math.max(max, min) - min + 1));
}
type Rules = { min_interval_s: number; max_interval_s: number; batch_size: number; batch_pause_min: number; batch_pause_max: number };
/** Seconds to wait before the next message: long pause after every batchSize sends. */
export function nextDelaySeconds(sentInBatch: number, c: Rules, rnd = Math.random) {
  if (c.batch_size > 0 && sentInBatch >= c.batch_size)
    return { seconds: randBetween(c.batch_pause_min * 60, c.batch_pause_max * 60, rnd), resetBatch: true };
  return { seconds: randBetween(c.min_interval_s, c.max_interval_s, rnd), resetBatch: false };
}
/** Auto-pause when failure rate exceeds 15% (after at least 10 attempts). */
export function shouldAutoPause(sent: number, failed: number) {
  const n = sent + failed;
  return n >= 10 && failed / n > 0.15;
}
export const MAX_ATTEMPTS = 3;
