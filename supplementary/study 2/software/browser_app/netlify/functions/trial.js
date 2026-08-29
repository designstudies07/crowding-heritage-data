exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: { "Content-Type": "application/json", Allow: "POST" }, body: JSON.stringify({ error: "Yalnızca POST desteklenir." }) };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { statusCode: 503, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Supabase ortam değişkenleri tanımlı değil." }) };
  try {
    if (Buffer.byteLength(event.body || "", "utf8") > 300_000) return { statusCode: 413, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Deneme verisi izin verilen boyutu aşıyor." }) };
    const { trial } = JSON.parse(event.body || "{}");
    if (!trial || typeof trial !== "object" || !trial.participant_id || !trial.trial_id) return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Geçerli trial verisi gerekli." }) };
    const response = await fetch(`${url}/rest/v1/rpc/record_study2_trial`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_trial: trial })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || `Supabase ${response.status}`);
    return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify({ ok: true, result: data }) };
  } catch (error) {
    return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: String(error.message || error) }) };
  }
};
