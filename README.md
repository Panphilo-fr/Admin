# Panphilo · Admin

Page d'administration commune à Atout et Tribu (Cloudflare Pages). Trois pages :
- **Limites** : où tu en es sur les offres gratuites (Supabase, Cloudflare).
- **Tribu** : chiffres de Tribu (tribus, comptes, stockage). Jamais le contenu des familles.
- **Atout** : éditeur du catalogue de jeux (Cloudflare KV `CATALOG`, historique `history/v<n>`).

## Déploiement
Cloudflare Pages, dépôt connecté, **commande de build : aucune**, **dossier de sortie : `public`**.
La liaison KV `CATALOG` est déclarée dans `wrangler.toml`.

## Secrets (Cloudflare Pages, Réglages, Variables et secrets, en « Secret »)
| Nom | Rôle |
|---|---|
| `ADMIN_KEY` | Clé d'accès à la page (longue, tirée au hasard). |
| `SUPABASE_SERVICE_KEY` | Clé serveur Supabase (`secret` / `service_role`), pour la fonction `admin_stats`. |
| `CF_API_TOKEN` | Jeton Cloudflare en lecture : Account Analytics, Pages, Workers KV Storage. |

Sans `SUPABASE_SERVICE_KEY` ou `CF_API_TOKEN`, la page affiche « À brancher » pour la partie concernée et le reste fonctionne.

## Base Tribu
La fonction SQL `public.admin_stats()` (migration `admin_stats` sur Supabase) ne renvoie que des chiffres et n'est appelable qu'avec la clé serveur.

## Protection
En plus de la clé : Cloudflare Zero Trust, Access, application autoréférencée sur `admin.panphilo.fr` (accès par code envoyé à ton e-mail).
