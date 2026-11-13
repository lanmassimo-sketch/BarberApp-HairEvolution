// Regole del negozio usate dal server per controllare le prenotazioni.
// Devono restare uguali a quelle dell'app (listino, orari, giorni di chiusura).
export const SERVICES = { t1: 30, t2: 15, t3: 35, t4: 40, t5: 45, t6: 60, b1: 15, b2: 20, b3: 30, b4: 30, b5: 30, r1: 5, r2: 5, r3: 20, r5: 45, r6: 60 };
export const WINDOWS = [[9 * 60, 12 * 60 + 30], [15 * 60, 19 * 60]]; // [inizio, chiusura] in minuti
export const GRACE_MIN = 30;           // un servizio può finire fino a 30 minuti dopo la chiusura
export const CLOSED_WEEKDAYS = [0, 1]; // domenica e lunedì
export const MAX_DAYS_AHEAD = 60;

const rome = () => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t) => +p.find((x) => x.type === t).value;
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), mi: g("minute") };
};
// Data di oggi in ora di Roma (YYYY-MM-DD)
export const todayRome = () => { const t = rome(); return `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`; };
const dayNumber = (dateStr) => { const [y, m, d] = dateStr.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

// Pulisce e controlla i dati di una prenotazione. Ritorna { error } oppure { value }.
export function validateBooking(input) {
  if (!input || typeof input !== "object") return { error: "Dati prenotazione non validi" };
  if(["name", "phone", "date", "time", "serviceId"].some((k) => typeof input[k] !== "string")) return { error: "Dati prenotazione incompleti" };
  const name = String(input.name ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return { error: "Il nome deve avere tra 2 e 60 caratteri" };
  const phone = String(input.phone ?? "").trim();
  const digits = phone.replace(/\D/g, "");
  if (!/^[0-9+()\-.\s]{6,25}$/.test(phone) || digits.length < 6 || digits.length > 15) return { error: "Numero di telefono non valido" };
  if (!Object.hasOwn(SERVICES, input.serviceId)) return { error: "Servizio non valido" };
  const dur = SERVICES[input.serviceId];
  const date = String(input.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) return { error: "Data non valida" };
  const t = rome();
  const diffDays = dayNumber(date) - Date.UTC(t.y, t.m - 1, t.d) / 86400000;
  if (diffDays < 0 || diffDays > MAX_DAYS_AHEAD) return { error: "Data fuori dal periodo prenotabile" };
  if (CLOSED_WEEKDAYS.includes(new Date(date + "T00:00:00Z").getUTCDay())) return { error: "Il negozio è chiuso in quel giorno" };
  const time = String(input.time ?? "");
  const tm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!tm) return { error: "Orario non valido" };
  const start = +tm[1] * 60 + +tm[2];
  if (start % 15 !== 0) return { error: "Orario non valido" };
  const win = WINDOWS.find(([a, b]) => start >= a && start < b);
  if (!win || start + dur > win[1] + GRACE_MIN) return { error: "Orario fuori dall'apertura del negozio" };
  if (diffDays === 0 && start <= t.h * 60 + t.mi) return { error: "Orario già passato" };
  return { value: { date, time, serviceId: input.serviceId, name, phone, marketing: input.marketing === true }, start, dur };
}

// Stessa regola dell'app: ogni prenotazione blocca multipli di 15 minuti (minimo 15, arrotondando per difetto).
export function overlaps(existing, date, start, dur, ownId) {
  return existing.some((b) => {
    if (b.id === ownId || b.status === "cancelled" || b.date !== date) return false;
    const bm = /^(\d{2}):(\d{2})$/.exec(b.time || ""); if (!bm) return false;
    const bs = +bm[1] * 60 + +bm[2];
    const blocked = Math.max(15, Math.floor((Object.hasOwn(SERVICES, b.serviceId) ? SERVICES[b.serviceId] : 30) / 15) * 15);
    return start < bs + blocked && start + dur > bs;
  });
}
