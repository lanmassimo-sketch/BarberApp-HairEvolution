// Utility condivise: token firmati (HMAC-SHA256), ruoli e limite tentativi.
// Richiede la variabile segreta AUTH_SECRET su Cloudflare Pages.
const enc = new TextEncoder();
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmacKey = (env) => crypto.subtle.importKey("raw", enc.encode(env.AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export async function signToken(env, role, ttlSec) {
  const exp = Date.now() + ttlSec * 1000;
  const payload = toB64(enc.encode(JSON.stringify({ role, exp })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload));
  return { token: payload + "." + toB64(sig), exp };
}

// Ritorna "client" | "owner" | "dev" oppure null se il token manca, è falso o scaduto.
export async function getRole(request, env) {
  if (!env.AUTH_SECRET) return null;
  const h = request.headers.get("Authorization") || "";
  const [payload, sig] = (h.startsWith("Bearer ") ? h.slice(7) : "").split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), fromB64(sig), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64(payload)));
    return data.exp > Date.now() ? data.role : null;
  } catch (e) { return null; }
}

export const isOwner = (role) => role === "owner" || role === "dev";

export function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

const rlKey = (request, bucket) => "rl:" + bucket + ":" + (request.headers.get("CF-Connecting-IP") || "x");
export async function limited(kv, request, bucket, max) {
  return (parseInt(await kv.get(rlKey(request, bucket)), 10) || 0) >= max;
}
export async function bump(kv, request, bucket, ttlSec) {
  const k = rlKey(request, bucket);
  const n = (parseInt(await kv.get(k), 10) || 0) + 1;
  await kv.put(k, String(n), { expirationTtl: Math.max(60, ttlSec) });
}

// Minuti mancanti all'appuntamento, in ora di Roma.
export function minutesUntil(date, time) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = (t) => +p.find((x) => x.type === t).value;
  const now = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) / 60000;
  const [y, m, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi) / 60000 - now;
}

export function phoneKey(p) {
  let d = String(p || "").replace(/[^\d]/g, "");
  if (d.startsWith("0039")) d = d.slice(4);
  else if (d.startsWith("39") && d.length > 10) d = d.slice(2);
  return d;
}
