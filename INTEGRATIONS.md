# Integrations

External services used by the Hiring Engine and how to configure them.

---

## LinkedIn Sourcing — Apify

### What it does

When a recruiter triggers "Source Candidates" on a job, the `source-linkedin-candidates` Supabase Edge Function:

1. Builds a search query from the job title and top 3 required skills
2. Calls the Apify **harvestapi/linkedin-profile-search** actor to fetch up to 25 matching LinkedIn profiles
3. Scores each profile against the JD using Claude (1–10)
4. Routes profiles: score 7–10 → job pipeline, score 4–6 → talent pool, score <4 → discarded
5. Deduplicates on `linkedin_url` before inserting
6. Logs the run to `linkedin_sourcing_log`

### Actor

| Field | Value |
|---|---|
| Actor | `harvestapi/linkedin-profile-search` |
| Endpoint | `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/run-sync-get-dataset-items` |
| Auth | `Authorization: Bearer {APIFY_API_TOKEN}` via query param `?token=...` |
| Run mode | Synchronous (waits for results, max ~4.5 min) |

### Getting an API token

1. Create an account at [apify.com](https://apify.com)
2. Go to **Settings → Integrations → API tokens**
3. Create a new token (read+write is fine)
4. Add it to Supabase: **Project → Settings → Edge Functions → Secrets** as `APIFY_API_TOKEN`

Do **not** put the token in `.env` or commit it anywhere — it belongs only in Supabase secrets.

### Mock mode

Set `APIFY_MOCK=true` in your Supabase Edge Function secrets (or local `.env`) to skip the real Apify call and return 5 hardcoded realistic UK profiles. This lets you test the full sourcing → scoring → pipeline insertion flow without spending any credits.

To enable: add `APIFY_MOCK=true` to Supabase → Settings → Edge Functions → Secrets.
To disable: set `APIFY_MOCK=false` or remove the secret entirely.

### Cost estimate

- Apify bills per compute unit. The `harvestapi/linkedin-profile-search` actor costs roughly **$1–2 per run of 25 profiles** depending on search complexity.
- A sourcing run that finds 0 results charges near zero.
- Monitor usage at [console.apify.com/billing](https://console.apify.com/billing).

### No results?

If sourcing returns 0 profiles the frontend will show:

> "No matching profiles found. Try broadening the job requirements or adjusting the location."

It also surfaces a direct LinkedIn search URL pre-filled with the job title and location, so the recruiter can search manually without leaving the app.

Common causes:
- Location is too specific (try city instead of borough, or leave it blank for global)
- Required skills are too niche — the actor searches LinkedIn's public index which has limited coverage for some geographies
- Job title phrasing is unusual — try a simpler variant (e.g. "Product Manager" vs "Principal Group PM III")

### Errors

| Symptom | Likely cause | Fix |
|---|---|---|
| "LinkedIn sourcing is not configured" | `APIFY_API_TOKEN` missing in secrets | Add the token to Supabase Edge Function secrets |
| "LinkedIn sourcing is temporarily unavailable" | Apify returned non-200 or timed out | Check Apify status page; retry in a few minutes |
| "LinkedIn sourcing is disabled" | Toggle off in Admin → Settings → Integrations | Enable it there |
| 0 profiles, no error | Search too narrow | Broaden skills or remove location |

---

## Email — Resend

All transactional emails (interview invites, offer letters, screening updates, etc.) are sent via [Resend](https://resend.com).

- **From address**: `noreply@oneselect.co.uk` (verified sender domain)
- **Secret**: `RESEND_API_KEY` in Supabase Edge Function secrets
- All email edge functions import `FROM_EMAIL` from `_shared/email.ts` — change it there to update the from address everywhere

---

## AI — Anthropic / Claude

All AI features (CV screening, interview scoring, JD quality analysis, sourcing intent extraction) call the Anthropic API via the `call-claude` edge function.

- **Secret**: `ANTHROPIC_API_KEY` in Supabase Edge Function secrets
- Default model: `claude-sonnet-4-6` (overridable via `VITE_CLAUDE_MODEL` in frontend env)
- Never put the Anthropic key in `.env` — it would be exposed in the frontend bundle
