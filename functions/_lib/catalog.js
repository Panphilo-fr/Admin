// Catalogue Atout+ (KV « CATALOG », clé « catalog ») : lecture et publication depuis la console admin.
// Stockage : Cloudflare KV (liaison « CATALOG »). Chaque publication garde la version précédente
// sous la clé history/v<n> pour pouvoir revenir en arrière.

export const CORS = { "Access-Control-Allow-Origin": "*" };
export const json = (o, status = 200, extra = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });

export async function current(env) {
  const c = env.CATALOG ? await env.CATALOG.get("catalog", "json") : null;
  return c ?? { version: 0, updated: null, jeux: [] };
}

export function sameKey(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (!x.length || x.length !== y.length) return false;
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

const STR = ["nom", "court", "sousTitre", "memo", "first", "rule", "extDe"];
const NUM = ["pmin", "pmax", "dur", "age", "target", "teamN", "annee"];
const BOOL = ["points", "rounds", "teamMode", "extension", "aVerifier"];
const ARR = ["types", "setup", "editeurs", "auteurs"];

// Ne garde que les champs connus, avec le bon type et une taille raisonnable.
export function clean(raw) {
  if (!raw || typeof raw !== "object") return "fiche illisible";
  const o = {};
  const id = String(raw.id ?? "").trim();
  if (!/^[a-z0-9-]{1,60}$/.test(id)) return `identifiant invalide (${id || "vide"})`;
  o.id = id;
  for (const k of STR) if (raw[k] != null && raw[k] !== "") o[k] = String(raw[k]).slice(0, k === "memo" ? 2000 : 200);
  for (const k of NUM) { const n = Number(raw[k]); if (raw[k] != null && raw[k] !== "" && Number.isFinite(n)) o[k] = Math.round(n); }
  { const v = Number(String(raw.prix ?? "").replace(",", ".")); if (raw.prix != null && raw.prix !== "" && Number.isFinite(v) && v > 0) o.prix = Math.round(v * 100) / 100; }
  for (const k of BOOL) o[k] = !!raw[k];
  for (const k of ARR) if (Array.isArray(raw[k])) o[k] = raw[k].map(x => String(x).slice(0, 300)).filter(Boolean).slice(0, 30);
  if (!o.nom) return `« ${id} » n'a pas de nom`;
  if (o.rule !== "low") o.rule = "high";
  return o;
}
