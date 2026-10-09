// Jours fériés du Québec — MÊME liste que le serveur (commission-tracker/services/opener/holidays.js).
// Sert au raccourci « Demain » de la planification : un jour férié n'est pas un jour de route.

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return utc(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
}
const nthMonday = (y: number, m: number, n: number) => { const f = utc(y, m, 1); return addDays(f, ((8 - f.getUTCDay()) % 7) + 7 * (n - 1)); };

const cache = new Map<number, Set<string>>();
function holidaysOf(y: number) {
  let s = cache.get(y);
  if (s) return s;
  const e = easter(y), may25 = utc(y, 5, 25);
  s = new Set([
    ymd(utc(y, 1, 1)), ymd(addDays(e, -2)), ymd(addDays(e, 1)),
    ymd(addDays(may25, -(((may25.getUTCDay() + 6) % 7) || 7))),
    ymd(utc(y, 6, 24)), ymd(utc(y, 7, 1)), ymd(nthMonday(y, 9, 1)), ymd(nthMonday(y, 10, 2)),
    ymd(utc(y, 12, 25)), ymd(utc(y, 12, 26)),
  ]);
  cache.set(y, s);
  return s;
}
export const isHoliday = (date: string) => holidaysOf(Number(date.slice(0, 4))).has(date.slice(0, 10));
