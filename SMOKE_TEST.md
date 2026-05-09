# One Select — Pre-Demo Smoke Test

Run this top to bottom before every demo. Each step tells you what to click, what you should see, and what a failure looks like.

---

## Setup

- Use a fresh incognito/private window for each role
- Have the app open at the root URL
- You will need 3 test CVs as PDFs (any real CVs work)

---

## STEP 1 — Admin creates a recruiter account

**Who:** Admin  
**Where:** `/admin/recruiters`

1. Log in as admin
2. Click **+ Invite Recruiter**
3. Enter a test email you can receive (e.g. a Gmail alias)
4. Click **Send Invite**

**Expect:**
- Modal closes, recruiter appears in the list
- Confirmation says "Welcome email sent to [email]"
- Check the inbox — email arrives with a login button (no password shown)

**Broken if:** Error message on invite, or email never arrives, or email still shows a password instead of a button

---

## STEP 2 — Recruiter logs in and creates a job posting

**Who:** Recruiter (use the invite link from Step 1)  
**Where:** `/recruiter/jobs`

1. Click the login link in the invite email
2. You are logged in automatically — check you land on `/recruiter/dashboard`
3. Navigate to **Jobs** → click **+ New Job** (or **JD Wizard**)
4. Fill in: Title = "Senior Product Manager", experience = 5 years, add 3-4 required skills
5. Save the job

**Expect:**
- Job appears in the list with status "Active"
- No error messages
- LinkedIn sourcing fires in background (no need to wait for it)

**Broken if:** 500 error on save, job doesn't appear, page crashes on load

---

## STEP 3 — Recruiter uploads 3 CVs manually

**Who:** Recruiter  
**Where:** `/recruiter/jobs` → click the job → CV upload area

1. Open the job you just created
2. Drag 3 PDF CVs into the upload area (or click to select)
3. Wait for parsing to complete (spinner per CV)

**Expect:**
- Each CV shows a green tick or "Parsed" status
- Candidate names are extracted correctly
- Candidate list shows 3 entries with roles/skills populated

**Broken if:** Files hang on parsing, names come back blank, error toast appears, page crashes

---

## STEP 4 — Recruiter runs AI screening on those CVs

**Who:** Recruiter  
**Where:** Same job view

1. Click **Run Screening** (or **Screen All**)
2. Watch the progress — each candidate gets scored in sequence

**Expect:**
- Progress bar advances
- Each candidate gets a score 0-100
- Match reason appears below each name (1-sentence explanation)
- Candidates sorted by score descending when done
- Log panel shows "✓ [Name]: [score]/100"

**Broken if:** Scoring hangs indefinitely, all scores come back 0, error in log panel, page crashes mid-run

---

## STEP 5 — Recruiter views scores and clicks through to candidate profile

**Who:** Recruiter  
**Where:** Job → screened candidate list

1. Click on the top-scoring candidate's row
2. Scroll through their profile panel

**Expect:**
- Full profile opens (name, role, skills, summary, highlights)
- Match score shown in score ring
- Match reason shown
- 👍 👎 feedback buttons appear next to the score
- Click 👍 → "✓ feedback saved" appears
- Click 👎 on a different candidate → dropdown appears with: "Score too high / Score too low / Wrong skills detected / Good candidate missed"
- Select a reason → Submit → "✓ feedback saved"

**Broken if:** Profile panel blank, score missing, feedback buttons crash, dropdown doesn't appear

---

## STEP 6 — Recruiter sends a video interview invite to top candidate

**Who:** Recruiter  
**Where:** Candidate profile or pipeline view

1. Select the top candidate
2. Click **Send Interview Invite**
3. Enter the candidate's email and confirm

**Expect:**
- Success toast/message
- Candidate status changes to "Interview Pending" or similar badge
- Audit log: action `interview_invited` should exist (check Step 11)
- (Optional: check inbox for interview invite email)

**Broken if:** Error on send, status doesn't update, page crashes

---

## STEP 7 — Admin logs into client portal

**Who:** Admin impersonating client (or a real client account)  
**Where:** `/admin/clients`

**Option A (if you have a client account):** Log out, log back in as the client.  
**Option B (quick):** From Admin → Clients → find a client → click their email to invite yourself, or use an existing client login.

1. Log into the client portal
2. Navigate to **Jobs**

**Expect:**
- Client sees only their own jobs (not other clients' jobs)
- No "🔒 locked" banners on pipeline or candidates (trial is now fully open)
- Trial nudge banner is visible if usage is near a cap (amber banner, not a block)

**Broken if:** Client can see jobs from other clients, pipeline is still locked behind PaidFeature wall, page crashes on load

---

## STEP 8 — Client views shortlisted candidates

**Who:** Client  
**Where:** `/client/candidates`

1. Navigate to Candidates
2. Find the candidates from the job posted in Step 2

**Expect:**
- All candidates visible (not capped at 5 anymore)
- Scores visible for screened candidates
- Full name, role, skills shown — no blur/lock
- Can click a candidate to see their full profile

**Broken if:** "🔒 hidden" rows appear, profile is blurred, clicking a candidate shows a PaidFeature lock

---

## STEP 9 — Client approves one candidate

**Who:** Client  
**Where:** Candidate profile or candidates list

1. Find a candidate with status "Interview Pending" or "Passed Screening"
2. Click **Approve**
3. Optionally add a note

**Expect:**
- Candidate status updates to "Approved" or shows green badge
- Approval recorded in audit log (check Step 11)
- No page crash

**Broken if:** Approve button missing, error on approve, status doesn't update

---

## STEP 10 — Recruiter sends offer letter

**Who:** Recruiter  
**Where:** `/recruiter/jobs` → job → approved candidate

1. Log back in as recruiter
2. Open the job, find the approved candidate
3. Click **📄 Send Offer**
4. AI drafts the letter — review it, click **Send**

**Expect:**
- Letter is generated (takes 5-10 seconds)
- Letter looks professional, includes candidate name and job title
- After sending: candidate shows "Offer Sent" badge
- (Optional: check candidate's inbox for offer email)

**Broken if:** Letter generation hangs/errors, send fails, badge doesn't appear, page crashes

---

## STEP 11 — Verify audit log has entries

**Who:** Admin or Recruiter  
**Where:** Supabase dashboard → Table Editor → `audit_log`

Check that the following `action` values exist for today's test:

| Action | Expected from |
|---|---|
| `job_created` | Step 2 |
| `interview_invited` | Step 6 |
| `decision_*` or `client_approved` | Step 9 |
| `offer_sent` | Step 10 |
| `stage_move` | Any drag on Pipeline Board |

**How to check:**
1. Go to Supabase dashboard → Table Editor → `audit_log`
2. Filter by `created_at` = today
3. Confirm each action exists and has a non-null `actor_id` and `entity_id`

**Broken if:** Table is empty, actions are missing, `actor_id` is null for authenticated actions

---

## Quick Reference — What Each Role Should NOT Be Able To Do

| Role | Should NOT see |
|---|---|
| Client | Other clients' jobs or candidates |
| Recruiter | Admin billing, admin user management |
| Candidate | Any recruiter or client portal |

---

## Common Failures & Fixes

| Symptom | Likely cause |
|---|---|
| Blank page on login | Profile missing — check `profiles` table for user's ID |
| Screening scores all 0 | `ANTHROPIC_API_KEY` not set in Supabase Edge Function secrets |
| Interview invite email not arriving | `RESEND_API_KEY` not set in secrets |
| LinkedIn sourcing returns nothing | `APIFY_API_TOKEN` not set in Supabase Edge Function secrets |
| Pipeline board empty | Candidates have no `stage` value — run screening first |
| Trial still showing locks | Hard-refresh browser (Ctrl+Shift+R) to clear cached JS |
