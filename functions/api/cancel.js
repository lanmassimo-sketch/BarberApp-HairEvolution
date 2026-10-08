// POST /api/cancel { id, phone } -> annulla una prenotazione se il telefono combacia
// e mancano almeno 60 minuti all'appuntamento (ora di Roma).
import { json, getRole, phoneKey, minutesUntil } from "../_lib/common.js";

const MIN_MINUTES = 60;

export async function onRequestPost({ request, env }) {
  const role = await getRole(request, env);
  if (!role) return json({ error: "Non autorizzato" }, 401);
  const kv = env.HAIREVOLUTION_KV;
  const { id, phone } = await request.json().catch(() => ({}));
  const all = (await kv.get("bookings", { type: "json" })) || [];
  const target = all.find((b) => b.id === id && b.status !== "cancelled");
  if (!target || phoneKey(target.phone) !== phoneKey(phone)) return json({ error: "Prenotazione non trovata" }, 404);
  if (minutesUntil(target.date, target.time) < MIN_MINUTES) return json({ error: "Troppo tardi per disdire" }, 409);
  // La prenotazione non viene cancellata: resta visibile al titolare come disdetta e libera lo slot.
  const updated = all.map((b) => b.id === id ? { ...b, status: "cancelled", cancelledAt: new Date().toISOString(), seenByOwner: false } : b);
  await kv.put("bookings", JSON.stringify(updated));
  return json({ booking: { date: target.date, time: target.time, serviceId: target.serviceId, name: target.name } });
}
