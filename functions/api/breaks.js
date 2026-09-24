// Funzione Cloudflare Pages per HairEvolution BarberApp.
// Gestisce le pause giornaliere (mattina/pomeriggio) impostate a
// discrezione del titolare, usando Cloudflare KV.
//
// Endpoint: /api/breaks
//   GET -> restituisce le pause attuali
//   PUT -> sovrascrive le pause
//
// Richiede lo stesso binding KV usato da bookings.js: HAIREVOLUTION_KV

const KV_KEY = "breaks";

const DEFAULT_BREAKS = {
  morning: { enabled: false, start: "12:00", end: "12:15" },
  afternoon: { enabled: false, start: "17:00", end: "17:15" },
};

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
      return new Response(JSON.stringify({ breaks: data || DEFAULT_BREAKS }), { status: 200, headers });
    }

    if(request.method === "PUT"){
      const body = await request.json();
      const breaks = body && body.breaks ? body.breaks : DEFAULT_BREAKS;
      await kv.put(KV_KEY, JSON.stringify(breaks));
      return new Response(JSON.stringify({ breaks }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "Metodo non supportato" }), { status: 405, headers });

  } catch(err){
    return new Response(JSON.stringify({ error: "Errore interno", details: String(err) }), { status: 500, headers });
  }
}
