// POST /api/mybookings { phone } -> prenotazioni di quel numero (senza dati di altri clienti)
import { json, getRole, phoneKey, limited, bump } from "../_lib/common.js";

export async function onRequestPost({ request, env }) {
  const role = await getRole(request, env);
  if (!role) return json({ error: "Non autorizzato" }, 401);
  const kv = env.HAIREVOLUTION_KV;
  // Il limite conta solo le ricerche senza risultato (chi prova numeri a caso), non quelle riuscite.
  if (await limited(kv, request, "mine", 15)) return json({ error: "Troppe ricerche senza risultato. Riprova tra 15 minuti." }, 429);
  const { phone } = await request.json().catch(() => ({}));
  const key = phoneKey(phone);
  if (key.length < 6) return json({ bookings: [] });
  const all = (await kv.get("bookings", { type: "json" })) || [];
  const mine = all.filter((b) => b.status !== "cancelled" && phoneKey(b.phone) === key).map((b) => ({ id: b.id, date: b.date, time: b.time, serviceId: b.serviceId, name: b.name }));
  if (!mine.length) await bump(kv, request, "mine", 900);
  return json({ bookings: mine });
}
