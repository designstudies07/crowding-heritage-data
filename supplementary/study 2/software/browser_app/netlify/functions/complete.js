exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: { "Content-Type": "application/json", Allow: "POST" }, body: JSON.stringify({ error: "Yalnızca POST desteklenir." }) };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { statusCode: 503, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: "Supabase ortam değişkenleri tanımlı değil." }) };
  try {
    if (Buffer.byteLength(event.body || "", "utf8") > 2_500_000) return { statusCode: 413, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: "Oturum verisi izin verilen boyutu aşıyor." }) };
    const { session } = JSON.parse(event.body || "{}");
    if (!session || typeof session !== "object" || !session.participant_id) return { statusCode: 400, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: "Geçerli session verisi gerekli." }) };
    const response = await fetch(`${url}/rest/v1/rpc/submit_study2_session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_session: session })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || `Supabase ${response.status}`);
    return { statusCode: 200, headers: {"Content-Type":"application/json","Cache-Control":"no-store"}, body: JSON.stringify({ ok: true, result: data }) };
  } catch (error) {
    return { statusCode: 500, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: String(error.message || error) }) };
  }
};
