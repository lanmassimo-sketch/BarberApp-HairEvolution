// Funzione Cloudflare Pages per HairEvolution BarberApp.
// Gestisce le prenotazioni usando Cloudflare KV come database semplice,
// così sono condivise tra tutti i dispositivi (non più solo nel browser
// di chi ha prenotato).
//
// Endpoint: /api/bookings
//   GET  -> restituisce tutte le prenotazioni
//   POST -> aggiunge una nuova prenotazione
//   PUT  -> non più usato: le modifiche del titolare passano da /api/bookingops
//
// Richiede un binding KV chiamato HAIREVOLUTION_KV nelle impostazioni
// del progetto Cloudflare Pages (Settings > Functions > KV namespace bindings).

import { getRole, isOwner, phoneKey } from "../_lib/common.js";
import { validateBooking, overlaps, todayRome } from "../_lib/shop.js";

const KV_KEY = "bookings";

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin": "https://barberapp-hairevolution.pages.dev",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// Per i clienti: solo gli slot occupati da oggi in poi, senza nomi né telefoni.
const busyOnly = (list) => { const today = todayRome(); return list.filter((b) => b.status !== "cancelled" && b.date >= today).map((b) => ({ id: "x", date: b.date, time: b.time, serviceId: b.serviceId, seenByOwner: true })); };

async function readBookings(kv){
  const data = await kv.get(KV_KEY, { type: "json" });
  return Array.isArray(data) ? data : [];
}

async function writeBookings(kv, bookings){
  await kv.put(KV_KEY, JSON.stringify(bookings));
}

export async function onRequest(context){
  const { request, env } = context;
  const headers = { "Content-Type": "application/json", ...corsHeaders() };

  if(request.method === "OPTIONS"){
    return new Response(null, { status: 204, headers });
  }

  // Richiede un token di accesso valido (Authorization: Bearer ...), ottenuto da /api/auth.
  const role = await getRole(request, env);
  if(!role){
    return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 401, headers });
  }

  const kv = env.HAIREVOLUTION_KV;
  if(!kv){
    return new Response(JSON.stringify({ error: "KV namespace non collegato. Controlla il binding HAIREVOLUTION_KV nelle impostazioni del progetto." }), { status: 500, headers });
  }

  try {
    if(request.method === "GET"){
      const bookings = await readBookings(kv);
      return new Response(JSON.stringify({ bookings: isOwner(role) ? bookings : busyOnly(bookings) }), { status: 200, headers });
    }

    if(request.method === "POST"){
      const input = await request.json().catch(() => null);
      const v = validateBooking(input);
      if(v.error){
        return new Response(JSON.stringify({ error: v.error }), { status: 400, headers });
      }
      const booking = {
        id: "bk_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        ...v.value,
        seenByOwner: false,
        createdAt: new Date().toISOString(),
      };
      // Rilegge, controlla la sovrapposizione, salva e verifica che la prenotazione sia rimasta
      // (se un'altra richiesta ha scritto nello stesso istante, riprova).
      for(let attempt = 0; attempt < 4; attempt++){
        const bookings = await readBookings(kv);
        // Già presente (scritta da un tentativo precedente o inviata due volte dallo stesso cliente): esito positivo.
        const already = bookings.find((x) => x.id === booking.id || (x.status !== "cancelled" && x.date === booking.date && x.time === booking.time && x.serviceId === booking.serviceId && phoneKey(x.phone) === phoneKey(booking.phone)));
        if(already){
          return new Response(JSON.stringify({ booking: already, bookings: isOwner(role) ? bookings : busyOnly(bookings) }), { status: 201, headers });
        }
        if(overlaps(bookings, booking.date, v.start, v.dur, booking.id)){
          return new Response(JSON.stringify({ error: "Questo orario è appena stato prenotato da un altro cliente. Scegline un altro." }), { status: 409, headers });
        }
        bookings.push(booking);
        await writeBookings(kv, bookings);
        const check = await readBookings(kv);
        if(check.some((x) => x.id === booking.id)){
          return new Response(JSON.stringify({ booking, bookings: isOwner(role) ? check : busyOnly(check) }), { status: 201, headers });
        }
        await new Promise((r) => setTimeout(r, 30 + Math.random() * 120));
      }
      return new Response(JSON.stringify({ error: "Server occupato, riprova tra un istante." }), { status: 503, headers });
    }

    if(request.method === "PUT"){
      return new Response(JSON.stringify({ error: "Metodo non più supportato: usa /api/bookingops" }), { status: 405, headers });
    }

    return new Response(JSON.stringify({ error: "Metodo non supportato" }), { status: 405, headers });

  } catch(err){
    return new Response(JSON.stringify({ error: "Errore interno", details: String(err) }), { status: 500, headers });
  }
}
