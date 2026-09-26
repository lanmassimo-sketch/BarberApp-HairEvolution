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

const KV_KEY = "contacts";

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
      if(!input || !input.name || !input.phone){
        return new Response(JSON.stringify({ error: "Nome e telefono richiesti" }), { status: 400, headers });
      }
      const contacts = await readContacts(kv);
      const contact = {
        id: "ct_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        name: input.name,
        phone: input.phone,
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
