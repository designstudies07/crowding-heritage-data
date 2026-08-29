exports.handler = async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { statusCode: 503, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: "SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil." }) };
  try {
    const response = await fetch(`${url}/rest/v1/rpc/assign_study2_program`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: "{}"
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || `Supabase ${response.status}`);
    const row = Array.isArray(data) ? data[0] : data;
    return { statusCode: 200, headers: {"Content-Type":"application/json","Cache-Control":"no-store"}, body: JSON.stringify(row) };
  } catch (error) {
    return { statusCode: 500, headers: {"Content-Type":"application/json"}, body: JSON.stringify({ error: String(error.message || error) }) };
  }
};
