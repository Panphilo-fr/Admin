// GET /api/catalog : catalogue public, lu par l'appli (web et Android).
import { current, json, CORS } from "../../_lib/catalog.js";
export async function onRequestGet({ env }) {
  return json(await current(env), 200, { ...CORS, "Cache-Control": "public, max-age=60" });
}
export const onRequestOptions = () => new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET" } });
