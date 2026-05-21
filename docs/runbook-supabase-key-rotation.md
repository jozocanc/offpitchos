# Runbook — Supabase API Key Rotation (OffPitchOS)

Last validated: 2026-05-21. Follow top to bottom; do not skip the verification.

## Facts you need

- Supabase project ref: `czeceqpgfmmeizowhjwj`
- API Keys page: https://supabase.com/dashboard/project/czeceqpgfmmeizowhjwj/settings/api-keys
- JWT Keys page: Supabase → Settings → JWT Keys
- Vercel project: `jozocancs-projects/app-next`
- Vercel env vars: https://vercel.com/jozocancs-projects/app-next/settings/environment-variables
- Local env file: `app-next/.env.local`
- Deploy: `vercel --prod --yes` from the **repo root**

The app runs on the **new** key system. Env var names are legacy-sounding but hold new-format values:

| Env var | Holds |
|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | an `sb_publishable_...` key |
| `SUPABASE_SERVICE_ROLE_KEY` | an `sb_secret_...` key |

## Scenario A — Routine secret-key rotation (~5 min)

Do this if the secret key is ever exposed, or as periodic hygiene. New-format secret keys are disposable.

1. **Create** — Supabase API Keys page → "Secret keys" → "+ New secret key" → name it → create → copy.
2. **Vercel** — env vars page → edit `SUPABASE_SERVICE_ROLE_KEY` (Production) → paste new value → save.
3. **Local** — edit `app-next/.env.local`, replace the value after `SUPABASE_SERVICE_ROLE_KEY=`.
4. **Deploy** — from repo root: `vercel --prod --yes`
5. **Verify** — run the Verification block below.
6. **Delete old key** — once verified, Supabase → Secret keys → delete the previous secret key.

The publishable key rarely needs rotating (it's non-sensitive by design). If needed, same steps with `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Scenario B — A legacy `eyJ...` key leaked (the 2026-05-12 incident)

Legacy `eyJ...` keys CANNOT be rotated directly. Migrate to the new system, then kill the legacy keys:

1. Create new publishable + secret keys; update Vercel + `.env.local`; deploy (Scenario A steps 1–4 for both).
2. Verify the app runs on the new keys.
3. Supabase → API Keys → "Legacy anon, service_role API keys" tab → "Disable JWT-based API keys" (type `disable`). Blocks the legacy key in the `apikey` header.
4. Supabase → JWT Keys → "JWT Signing Keys" tab → "Previously used keys" → "Legacy HS256 (Shared Secret)" row → ⋮ → "Revoke key". **This is the step that actually kills the leaked JWT** — it stays valid as a bearer token until the signing secret is revoked.
5. Verify.

After the 2026-05-21 migration this is already done — Scenario B should not recur.

## Verification

Health:
```
curl -s -o /dev/null -w "home %{http_code}\n" https://offpitchos.com/
curl -s -o /dev/null -w "dash %{http_code}\n" https://offpitchos.com/dashboard   # expect 307
```

Confirm a leaked / old key is DEAD (must reject, not return rows):
```
OLD='<paste the leaked key>'
PUB=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' app-next/.env.local | cut -d= -f2)
curl -s -H "apikey: $PUB" -H "Authorization: Bearer $OLD" \
  "https://czeceqpgfmmeizowhjwj.supabase.co/rest/v1/profiles?select=id"
# DEAD  = {"code":"PGRST301","message":"No suitable key..."} or HTTP 401
# ALIVE = a JSON array of rows  <-- still leaking, NOT done
```

Confirm the new secret key WORKS:
```
KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' app-next/.env.local | cut -d= -f2)
curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "https://czeceqpgfmmeizowhjwj.supabase.co/rest/v1/"
# 200 = good
```

## Gotchas (learned the hard way, 2026-05-21)

- **Never paste a secret key into a chat / AI transcript.** That is what caused the incident. Keys go Supabase → Vercel UI / local file directly — never through a conversation.
- **Do not let an AI `Read` the whole `app-next/.env.local`** — it dumps every secret into the transcript. Grep a single line, or just the prefix.
- Vendor UI moves: there is no longer a "Generate new JWT secret" button. Key management is split across the "API Keys" page and the "JWT Keys" page.
- Env vars set via `vercel env add` (CLI) become "Sensitive" and pull back empty (`""`). You cannot verify their value with `vercel env pull` — verify by app behavior instead.
- Disabling legacy keys ≠ killing them. A leaked JWT stays usable as a bearer token until the legacy HS256 signing secret is **revoked**.
- `supabase-js` / `@supabase/ssr` accept new-format keys with zero code changes — only env values change, not variable names or code.
