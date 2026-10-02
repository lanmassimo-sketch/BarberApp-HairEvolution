// POST /api/auth  { role: "client" | "owner" | "dev", pin }  ->  { token, role, exp }
// I PIN stanno solo nelle variabili segrete di Cloudflare: CLIENT_PIN, OWNER_PIN, DEV_PIN.
import { json, signToken, safeEqual, limited, bump } from "../_lib/common.js";

export async function onRequestPost({ request, env }) {
  const kv = env.HAIREVOLUTION_KV;
  if (!env.AUTH_SECRET || !kv) return json({ error: "Configurazione del server incompleta" }, 500);
  if (await limited(kv, request, "auth", 10)) return json({ error: "Troppi tentativi. Riprova tra 15 minuti." }, 429);

  const { role, pin } = await request.json().catch(() => ({}));
  // Clienti: accesso senza scadenza pratica (10 anni), si invalida cambiando AUTH_SECRET.
  // Titolare e Sviluppatore: il PIN va inserito a ogni accesso; il token vale al massimo 12 ore.
  const FOREVER = 10 * 365 * 86400;
  const rules = { client: [env.CLIENT_PIN, FOREVER], owner: [env.OWNER_PIN, 12 * 3600], dev: [env.DEV_PIN, 12 * 3600] };
  const rule = rules[role];
  if (!rule || !rule[0] || !pin || !safeEqual(pin, rule[0])) {
    await bump(kv, request, "auth", 900);
    return json({ error: "Codice errato" }, 401);
  }
  const { token, exp } = await signToken(env, role, rule[1]);
  return json({ token, role, exp });
}
