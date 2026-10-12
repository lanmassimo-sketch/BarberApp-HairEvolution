// POST /api/bookingops  (solo titolare/sviluppatore)
// Operazioni sulle prenotazioni applicate all'elenco AGGIORNATO del server, così
// non si sovrascrivono prenotazioni arrivate nel frattempo.
//   { op: "seen", ids: [...] }     segna come viste le prenotazioni indicate
//   { op: "delete", id }           elimina una prenotazione
//   { op: "purge", before: "YYYY-MM-DD" }  elimina quelle con data precedente
//   { op: "clear" }                elimina tutte
import { json, getRole, isOwner } from "../_lib/common.js";

const KEY = "bookings";

export async function onRequestPost({ request, env }) {
  const role = await getRole(request, env);
  if (!role) return json({ error: "Non autorizzato" }, 401);
  if (!isOwner(role)) return json({ error: "Accesso riservato al titolare" }, 403);
  const kv = env.HAIREVOLUTION_KV;
  const body = await request.json().catch(() => ({}));
  const read = async () => { const d = await kv.get(KEY, { type: "json" }); return Array.isArray(d) ? d : []; };

  const apply = (list) => {
    if (body.op === "seen") {
      const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
      return list.map((b) => (ids.has(b.id) ? { ...b, seenByOwner: true } : b));
    }
    if (body.op === "delete") return typeof body.id === "string" ? list.filter((b) => b.id !== body.id) : null;
    if (body.op === "purge") return /^\d{4}-\d{2}-\d{2}$/.test(body.before || "") ? list.filter((b) => b.date >= body.before) : null;
    if (body.op === "clear") return [];
    return null;
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const updated = apply(await read());
    if (updated === null) return json({ error: "Operazione non valida" }, 400);
    await kv.put(KEY, JSON.stringify(updated));
    const check = await read();
    // Ripete se, nel frattempo, un'altra scrittura ha annullato questa modifica
    if (JSON.stringify(check) === JSON.stringify(updated)) return json({ bookings: check });
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 120));
  }
  return json({ bookings: await read() });
}
