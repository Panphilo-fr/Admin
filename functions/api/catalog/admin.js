// POST /api/catalog/admin : { action: "check" | "save" }, en-tête Authorization: Bearer <ADMIN_KEY>.
import { current, json, clean, sameKey } from "../../_lib/catalog.js";

export async function onRequestPost({ request, env }) {
  const key = env.ADMIN_KEY || "";
  const auth = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!key) return json({ error: "La clé d'administration n'est pas configurée sur Cloudflare." }, 503);
  if (!sameKey(auth, key)) return json({ error: "Clé incorrecte." }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Requête illisible." }, 400); }

  if (body.action === "check") { const c = await current(env); return json({ ok: true, version: c.version }); }

  if (body.action === "save") {
    if (!env.CATALOG) return json({ error: "Le stockage du catalogue (KV « CATALOG ») n'est pas relié au projet." }, 503);
    if (!Array.isArray(body.jeux) || body.jeux.length > 5000) return json({ error: "Liste de jeux invalide." }, 400);
    const jeux = [], seen = new Set();
    for (const raw of body.jeux) {
      const j = clean(raw);
      if (typeof j === "string") return json({ error: j }, 400);
      if (seen.has(j.id)) return json({ error: `Deux fiches ont le même identifiant : ${j.id}` }, 400);
      seen.add(j.id); jeux.push(j);
    }
    const cur = await current(env);
    if (Number(body.baseVersion) !== cur.version)
      return json({ error: "Le catalogue a été modifié ailleurs entre-temps. Recharge la page avant d'enregistrer.", version: cur.version }, 409);
    if (cur.version > 0) await env.CATALOG.put(`history/v${cur.version}`, JSON.stringify(cur));
    const next = { version: cur.version + 1, updated: new Date().toISOString(), jeux };
    await env.CATALOG.put("catalog", JSON.stringify(next));
    return json({ ok: true, version: next.version, updated: next.updated });
  }

  return json({ error: "Action inconnue." }, 400);
}
