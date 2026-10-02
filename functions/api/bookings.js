// Funzione Cloudflare Pages per HairEvolution BarberApp.
// Gestisce le prenotazioni usando Cloudflare KV come database semplice,
// così sono condivise tra tutti i dispositivi (non più solo nel browser
// di chi ha prenotato).
//
// Endpoint: /api/bookings
//   GET  -> restituisce tutte le prenotazioni
//   POST -> aggiunge una nuova prenotazione
//   PUT  -> sovrascrive l'intera lista (usato per "azzera" e "segna come vista")
//
// Richiede un binding KV chiamato HAIREVOLUTION_KV nelle impostazioni
// del progetto Cloudflare Pages (Settings > Functions > KV namespace bindings).

import { getRole, isOwner } from "../_lib/common.js";

const KV_KEY = "bookings";

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin": "https://barberapp-hairevolution.pages.dev",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// Per i clienti: solo gli slot occupati, senza nomi né telefoni.
const busyOnly = (list) => list.map((b) => ({ id: "x", date: b.date, time: b.time, serviceId: b.serviceId, seenByOwner: true }));

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
      const newBooking = await request.json();
      if(!newBooking || !newBooking.date || !newBooking.time || !newBooking.serviceId || !newBooking.name || !newBooking.phone){
        return new Response(JSON.stringify({ error: "Dati prenotazione incompleti" }), { status: 400, headers });
      }
      const bookings = await readBookings(kv);
      const booking = {
        id: "bk_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        date: newBooking.date,
        time: newBooking.time,
        serviceId: newBooking.serviceId,
        name: newBooking.name,
        phone: newBooking.phone,
        marketing: newBooking.marketing === true, // consenso facoltativo a inviti/promozioni WhatsApp
        seenByOwner: false,
        createdAt: new Date().toISOString(),
      };
      bookings.push(booking);
      await writeBookings(kv, bookings);
      return new Response(JSON.stringify({ booking, bookings: isOwner(role) ? bookings : busyOnly(bookings) }), { status: 201, headers });
    }

    if(request.method === "PUT"){
      if(!isOwner(role)){
        return new Response(JSON.stringify({ error: "Accesso riservato al titolare" }), { status: 403, headers });
      }
      const body = await request.json();
      const bookings = Array.isArray(body.bookings) ? body.bookings : [];
      await writeBookings(kv, bookings);
      return new Response(JSON.stringify({ bookings }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "Metodo non supportato" }), { status: 405, headers });

  } catch(err){
    return new Response(JSON.stringify({ error: "Errore interno", details: String(err) }), { status: 500, headers });
  }
}
