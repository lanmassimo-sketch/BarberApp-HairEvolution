// Funzione Cloudflare Pages per HairEvolution BarberApp.
// Gestisce i contatti aggiunti manualmente dal titolare alla rubrica
// clienti (quelli che non hanno ancora mai prenotato), usando Cloudflare KV.
//
// Endpoint: /api/contacts
//   GET  -> restituisce i contatti manuali
//   POST -> aggiunge un contatto
//   PUT  -> sovrascrive l'intera lista (usato per eliminare)
//
// Richiede lo stesso binding KV usato da bookings.js: HAIREVOLUTION_KV
// (Settings > Functions > KV namespace bindings).

import { getRole, isOwner } from "../_lib/common.js";

const KV_KEY = "contacts";

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin": "https://barberapp-hairevolution.pages.dev",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function readContacts(kv){
  const data = await kv.get(KV_KEY, { type: "json" });
  return Array.isArray(data) ? data : [];
}

async function writeContacts(kv, contacts){
  await kv.put(KV_KEY, JSON.stringify(contacts));
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
  if(!isOwner(role)){
    return new Response(JSON.stringify({ error: "Accesso riservato al titolare" }), { status: 403, headers });
  }

  const kv = env.HAIREVOLUTION_KV;
  if(!kv){
    return new Response(JSON.stringify({ error: "KV namespace non collegato. Controlla il binding HAIREVOLUTION_KV nelle impostazioni del progetto." }), { status: 500, headers });
  }

  try {
    if(request.method === "GET"){
      const contacts = await readContacts(kv);
      return new Response(JSON.stringify({ contacts }), { status: 200, headers });
    }

    if(request.method === "POST"){
      const input = await request.json();
      if(!input || typeof input.name !== "string" || typeof input.phone !== "string"){
        return new Response(JSON.stringify({ error: "Nome e telefono richiesti" }), { status: 400, headers });
      }
      const cname = String((input && input.name) ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
      const cphone = String((input && input.phone) ?? "").trim();
      const cdigits = cphone.replace(/\D/g, "");
      if(cname.length < 2 || cname.length > 60 || !/^[0-9+()\-.\s]{6,25}$/.test(cphone) || cdigits.length < 6 || cdigits.length > 15){
        return new Response(JSON.stringify({ error: "Nome e telefono richiesti (nome 2-60 caratteri, telefono valido)" }), { status: 400, headers });
      }
      const contacts = await readContacts(kv);
      const contact = {
        id: "ct_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        name: cname,
        phone: cphone,
        marketing: input.marketing === true, // il titolare attesta il consenso del cliente
      };
      contacts.push(contact);
      await writeContacts(kv, contacts);
      return new Response(JSON.stringify({ contact, contacts }), { status: 201, headers });
    }

    if(request.method === "PUT"){
      const body = await request.json();
      const contacts = Array.isArray(body.contacts) ? body.contacts : [];
      await writeContacts(kv, contacts);
      return new Response(JSON.stringify({ contacts }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "Metodo non supportato" }), { status: 405, headers });

  } catch(err){
    return new Response(JSON.stringify({ error: "Errore interno", details: String(err) }), { status: 500, headers });
  }
}
