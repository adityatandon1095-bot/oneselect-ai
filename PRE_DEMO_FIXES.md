# Pre-Demo Fixes

Bugs found and fixed during the 14-day pre-demo sprint. Ordered by discovery.

---

## FIX-001 — Hardcoded admin email in invite-user edge function

**File:** `supabase/functions/invite-user/index.ts`  
**Symptom:** Every recruiter/client invite fired a notification email to a hardcoded Gmail address (`aditya.tandon1095@gmail.com`). Leaked a personal email, would break in any other deployment.  
**Fix:** Replaced with `Deno.env.get('ADMIN_NOTIFICATION_EMAIL') ?? ''`. Wrapped in `if (adminEmail)` guard — no email sent if env var is absent.

---

## FIX-002 — Rate limiter fail-open in call-claude

**File:** `supabase/functions/call-claude/index.ts`  
**Symptom:** If the rate-limit RPC threw an error, `checkRateLimit()` returned `true` (allowed). Any DB error silently let all requests through, bypassing the limit entirely.  
**Fix:** Changed to return `false` on RPC error (fail-closed). Logs the error with `console.error` so it's visible in Supabase edge function logs.

---

## FIX-003 — No server-side entry point for public job applications

**Files:** `supabase/functions/public-apply/index.ts` (new), `src/pages/PublicJobs.jsx`  
**Symptom:** Public applicants inserted directly into the `candidates` table from the browser via anon RLS policy. No rate limiting, no spam protection — a bot could flood the DB.  
**Fix:** Created `public-apply` edge function with IP-based rate limiting (5 requests/hour per IP) using DB-backed `ip_rate_limits` table. Returns 429 on breach, 409 on duplicate. Frontend now calls the edge function instead of direct DB.

---

## FIX-004 — Temp password shown in plaintext in invite emails and admin UI

**Files:** `supabase/functions/invite-user/index.ts`, `src/pages/admin/AdminRecruiters.jsx`, `src/pages/admin/AdminClients.jsx`  
**Symptom:** The invite flow generated a random temp password, embedded it in the welcome email, and displayed it in the admin modal after inviting. Anyone with email access had the credential.  
**Fix:** Replaced with Supabase magic link via `auth.admin.generateLink()`. New users get type `'invite'`, re-invited existing users get type `'magiclink'`. An internal random password is generated with `crypto.randomUUID()` but never surfaced. Admin UI now shows "one-time login link sent" instead of a password field.

---

## FIX-005 — All 29 edge functions had hardcoded CORS `*`

**Files:** All `supabase/functions/*/index.ts`, new `supabase/functions/_shared/cors.ts`  
**Symptom:** Every edge function had `corsHeaders = { "Access-Control-Allow-Origin": "*" }` inline. No way to restrict CORS to the production domain without editing 29 files.  
**Fix:** Created shared `_shared/cors.ts` that reads `ALLOWED_ORIGIN` from env (defaults to `*` for dev compatibility). Bulk-replaced inline headers with `import { corsHeaders } from "../_shared/cors.ts"` across all 29 functions.

---

## FIX-006 — Trial locked everything off — unusable for prospective customers

**Files:** `src/config/trialLimits.js`, `src/hooks/usePlan.js`, `src/pages/client/ClientCandidates.jsx`, `src/pages/client/ClientPipeline.jsx`, `src/pages/client/ClientJobs.jsx`, new `src/components/TrialNudgeBanner.jsx`  
**Symptom:** Trial tier had every feature flag set to `false`. Clients on trial couldn't run AI screening, view the pipeline, see full profiles, or use chat. There was nothing to evaluate.  
**Fix:** Flipped all feature gates to `true`. Replaced hard blocks with soft usage caps (15 screenings, 20 chat msgs, 2 sourcing runs, 2 jobs, 25 visible candidates). Added `useTrialUsage()` hook that queries existing tables for real counts. Added amber nudge banner at 80% of any cap. Removed `PaidFeature` blur gates from client candidate list.

---

## FIX-007 — Reengagement email could send multiple times per day to the same candidate

**File:** `supabase/functions/talent-reengagement/index.ts`  
**Symptom:** The function checks `reengagement_sent_at IS NULL OR < 30d ago` but doesn't guard against being called multiple times on the same day (e.g., from a cron that fires twice, or manual invocation). A candidate could receive multiple emails in one day.  
**Fix:** Added per-candidate today check before send: `if (reengagement_sent_at.slice(0, 10) === todayUtc) continue`. Idempotent across multiple runs on the same day.

---

## FIX-008 — Dead `VITE_ANTHROPIC_API_KEY` in `.env` and `.env.example`

**Files:** `.env`, `.env.example`  
**Symptom:** `.env` had a real `VITE_ANTHROPIC_API_KEY` value that was never used (all Claude calls go through the `call-claude` edge function). The value was exposed in the frontend bundle and in version control.  
**Fix:** Removed the entry from `.env`. Updated `.env.example` to explain the key lives in Supabase Edge Function secrets, not here.

---

## FIX-009 — TrialNudgeBanner build error: apostrophe in single-quoted JSX string

**File:** `src/components/TrialNudgeBanner.jsx`  
**Symptom:** Build failed with `Expected ':' but found Identifier` at line 26. The string `' You've hit the limit — '` used single quotes around text containing an apostrophe, which the JS parser treated as closing the string mid-token.  
**Fix:** Changed the string to use double quotes: `" You've hit the limit — "`.

---

## Summary

| Fix | Category | Severity |
|-----|----------|----------|
| FIX-001 Hardcoded admin email | Security / Config | High |
| FIX-002 Rate limiter fail-open | Security | High |
| FIX-003 No server-side apply endpoint | Security | High |
| FIX-004 Temp password in plaintext | Security | High |
| FIX-005 Hardcoded CORS `*` | Security / Config | Medium |
| FIX-006 Trial locked everything off | Product | Critical |
| FIX-007 Reengagement idempotency | Reliability | Medium |
| FIX-008 Dead API key in env | Security | High |
| FIX-009 Build error in TrialNudgeBanner | Bug | Medium |
