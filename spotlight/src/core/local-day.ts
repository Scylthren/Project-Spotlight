/**
 * The phone's calendar day as `YYYY-MM-DD` in local time: the key for
 * today's cached weather (Gate 3 slice 5a) and, in slice 5b, today's looks.
 */
export function localDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
