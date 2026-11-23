// POST /api/admin/stats : { part: "tribu" | "limites" }, en-tête Authorization: Bearer <ADMIN_KEY>.
// Ne renvoie que des chiffres et des états : jamais le contenu des tribus.
import { json, sameKey } from "../../_lib/catalog.js";

const CF_ACCOUNT = "b867e70ad3b0b12842ad3dead0d17844";
const KV_NAMESPACE = "1a108dd2dc614360ba1604b04c042341";
const SUPABASE_URL = "https://gwhokpsdmyeisvvsaybh.supabase.co";
const PAGES_PROJECTS = ["atout", "tribu"];

// Plafonds des offres gratuites (valeurs documentées par Cloudflare et Supabase).
const LIMITS = {
  supabase: { base: 500 * 1024 * 1024, photos: 1024 * 1024 * 1024 },
  cloudflare: { fonctions: 100000, kvLectures: 100000, kvEcritures: 1000, kvSuppressions: 1000, kvOctets: 1024 * 1024 * 1024, builds: 500 },
};

const safe = async fn => { try { return await fn(); } catch (e) { return { erreur: String(e?.message ?? e).slice(0, 200) }; } };

async function tribuStats(env) {
  if (!env.SUPABASE_SERVICE_KEY) return { erreur: "non_configure", manque: "SUPABASE_SERVICE_KEY" };
  const r = await fetch(`${env.SUPABASE_URL || SUPABASE_URL}/rest/v1/rpc/admin_stats`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) throw new Error("Supabase a répondu " + r.status);
  return await r.json();
}

async function cfApi(env, path) {
  const r = await fetch("https://api.cloudflare.com/client/v4" + path, { headers: { Authorization: "Bearer " + env.CF_API_TOKEN } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(`Cloudflare ${r.status} ${d.errors?.[0]?.message ?? ""}`.trim());
  return d;
}

async function cfGraphql(env, query, variables) {
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.CF_API_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.errors?.length) throw new Error(`Cloudflare GraphQL ${r.status} ${d.errors?.[0]?.message ?? ""}`.trim());
  return d.data?.viewer?.accounts?.[0] ?? {};
}

async function cloudflareStats(env) {
  if (!env.CF_API_TOKEN) return { erreur: "non_configure", manque: "CF_API_TOKEN" };
  const now = new Date();
  const jour = now.toISOString().slice(0, 10);
  const debutMois = jour.slice(0, 8) + "01";
  const debutJour = jour + "T00:00:00Z";
  const accountTag = env.CF_ACCOUNT_ID || CF_ACCOUNT;

  const fonctions = await safe(async () => {
    const a = await cfGraphql(env,
      `query($tag:string!,$s:Time,$e:Time){viewer{accounts(filter:{accountTag:$tag}){pagesFunctionsInvocationsAdaptiveGroups(filter:{datetime_geq:$s,datetime_leq:$e},limit:100){sum{requests}}}}}`,
      { tag: accountTag, s: debutJour, e: now.toISOString() });
    return { aujourdhui: (a.pagesFunctionsInvocationsAdaptiveGroups ?? []).reduce((t, x) => t + (x.sum?.requests ?? 0), 0) };
  });

  const kv = await safe(async () => {
    const ops = await cfGraphql(env,
      `query($tag:string!,$d:Date){viewer{accounts(filter:{accountTag:$tag}){kvOperationsAdaptiveGroups(filter:{namespaceId:"${KV_NAMESPACE}",date_geq:$d,date_leq:$d},limit:100){sum{requests} dimensions{actionType}}}}}`,
      { tag: accountTag, d: jour });
    const par = {};
    for (const x of ops.kvOperationsAdaptiveGroups ?? []) par[x.dimensions.actionType] = (par[x.dimensions.actionType] ?? 0) + (x.sum?.requests ?? 0);
    const st = await cfGraphql(env,
      `query($tag:string!,$d:Date){viewer{accounts(filter:{accountTag:$tag}){kvStorageAdaptiveGroups(filter:{namespaceId:"${KV_NAMESPACE}",date_geq:$d,date_leq:$d},limit:10){max{byteCount keyCount}}}}}`,
      { tag: accountTag, d: jour });
    const m = st.kvStorageAdaptiveGroups?.[0]?.max ?? {};
    return { lectures: par.read ?? 0, ecritures: par.write ?? 0, suppressions: par.delete ?? 0, octets: m.byteCount ?? 0, cles: m.keyCount ?? 0 };
  });

  const builds = await safe(async () => {
    const out = {};
    for (const p of PAGES_PROJECTS) {
      let n = 0;
      for (let page = 1; page <= 10; page++) {
        // Cloudflare refuse certaines tailles de page : on essaie sans, puis avec 25.
        let d;
        try { d = await cfApi(env, `/accounts/${accountTag}/pages/projects/${p}/deployments?page=${page}`); }
        catch { d = await cfApi(env, `/accounts/${accountTag}/pages/projects/${p}/deployments?page=${page}&per_page=25`); }
        const items = d.result ?? [];
        n += items.filter(x => String(x.created_on ?? "").slice(0, 10) >= debutMois).length;
        if (!items.length || String(items[items.length - 1]?.created_on ?? "").slice(0, 10) < debutMois) break;
      }
      out[p] = n;
    }
    return out;
  });

  return { fonctions, kv, builds };
}

export async function onRequestPost({ request, env }) {
  const key = env.ADMIN_KEY || "";
  const auth = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!key) return json({ error: "La clé d'administration n'est pas configurée sur Cloudflare." }, 503);
  if (!sameKey(auth, key)) return json({ error: "Clé incorrecte." }, 401);
  let body = {}; try { body = await request.json(); } catch { /* corps vide */ }

  if (body.part === "tribu") return json({ ok: true, tribu: await safe(() => tribuStats(env)) });
  if (body.part === "limites") {
    const [tribu, cloudflare] = await Promise.all([safe(() => tribuStats(env)), safe(() => cloudflareStats(env))]);
    return json({ ok: true, limites: LIMITS, tribu, cloudflare });
  }
  return json({ error: "Partie inconnue." }, 400);
}
