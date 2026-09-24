// Funzione Cloudflare Pages per HairEvolution BarberApp.
// Traccia quando un cliente della rubrica è stato invitato l'ultima volta
// (data dell'ultimo click su "Invita"), usando Cloudflare KV.
//
// Endpoint: /api/invited
//   GET -> restituisce il registro degli inviti
//   PUT -> aggiorna il registro
//
// Richiede lo stesso binding KV usato da bookings.js: HAIREVOLUTION_KV

const KV_KEY = "invited";

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function onRequest(context){
  const { request, env } = context;
  const headers = { "Content-Type": "application/json", ...corsHeaders() };

  if(request.method === "OPTIONS"){
    return new Response(null, { status: 204, headers });
  }

  const kv = env.HAIREVOLUTION_KV;
  if(!kv){
    return new Response(JSON.stringify({ error: "KV namespace non collegato. Controlla il binding HAIREVOLUTION_KV." }), { status: 500, headers });
  }

  try {
    if(request.method === "GET"){
      const data = await kv.get(KV_KEY, { type: "json" });
      return new Response(JSON.stringify({ invited: data || {} }), { status: 200, headers });
    }

    if(request.method === "PUT"){
      const body = await request.json();
      const invited = body && body.invited ? body.invited : {};
      await kv.put(KV_KEY, JSON.stringify(invited));
      return new Response(JSON.stringify({ invited }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "Metodo non supportato" }), { status: 405, headers });

  } catch(err){
    return new Response(JSON.stringify({ error: "Errore interno", details: String(err) }), { status: 500, headers });
  }
}
