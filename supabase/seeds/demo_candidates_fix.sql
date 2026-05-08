-- Demo candidate seed fix — run in Supabase SQL Editor
-- Resets passwords for existing demo candidates (previous seed used DO NOTHING which skipped password set).
--
-- Logins:
--   sarah.chen@demo.com      / Demo1234!
--   marcus.williams@demo.com / Demo1234!
--   priya.sharma@demo.com    / Demo1234!

DO $$
DECLARE
  cand1_id  uuid := '11111111-1111-1111-1111-111111111111';
  cand2_id  uuid := '22222222-2222-2222-2222-222222222222';
  cand3_id  uuid := '33333333-3333-3333-3333-333333333333';
  client_id uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  job1_id   uuid := 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  job2_id   uuid := 'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  job3_id   uuid := 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  pool1_id  uuid := 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  pool2_id  uuid := 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  pool3_id  uuid := 'bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
BEGIN

-- ── Auth users: upsert with DO UPDATE so passwords are always set ──────────────
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
) VALUES
  (cand1_id,
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sarah.chen@demo.com', crypt('Demo1234!', gen_salt('bf')),
   now(), now(), now(), '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Sarah Chen"}'::jsonb, false, false),

  (cand2_id,
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'marcus.williams@demo.com', crypt('Demo1234!', gen_salt('bf')),
   now(), now(), now(), '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Marcus Williams"}'::jsonb, false, false),

  (cand3_id,
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'priya.sharma@demo.com', crypt('Demo1234!', gen_salt('bf')),
   now(), now(), now(), '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Priya Sharma"}'::jsonb, false, false)
ON CONFLICT (id) DO UPDATE SET
  encrypted_password   = crypt('Demo1234!', gen_salt('bf')),
  email_confirmed_at   = now(),
  updated_at           = now();

-- ── Auth identities ────────────────────────────────────────────────────────────
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES
  ('sarah.chen@demo.com',      cand1_id,
   jsonb_build_object('sub', cand1_id::text,  'email', 'sarah.chen@demo.com'),
   'email', now(), now(), now()),
  ('marcus.williams@demo.com', cand2_id,
   jsonb_build_object('sub', cand2_id::text,  'email', 'marcus.williams@demo.com'),
   'email', now(), now(), now()),
  ('priya.sharma@demo.com',    cand3_id,
   jsonb_build_object('sub', cand3_id::text,  'email', 'priya.sharma@demo.com'),
   'email', now(), now(), now())
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ── Profiles ───────────────────────────────────────────────────────────────────
INSERT INTO public.profiles (id, user_role, email, full_name, first_login, plan)
VALUES
  (cand1_id, 'candidate', 'sarah.chen@demo.com',      'Sarah Chen',      false, 'starter'),
  (cand2_id, 'candidate', 'marcus.williams@demo.com',  'Marcus Williams', false, 'starter'),
  (cand3_id, 'candidate', 'priya.sharma@demo.com',    'Priya Sharma',    false, 'starter')
ON CONFLICT (id) DO UPDATE SET
  user_role   = 'candidate',
  first_login = false;

-- ── Demo client profile (jobs must exist for job_matches to work) ──────────────
INSERT INTO public.profiles (id, user_role, company_name, email, full_name, first_login, plan)
VALUES (client_id, 'client', 'Acme Corp', 'hiring@acmecorp.demo', 'Acme Corp Hiring', false, 'growth')
ON CONFLICT (id) DO NOTHING;

-- ── Demo jobs (safe re-insert; skipped if already present) ────────────────────
INSERT INTO public.jobs (id, recruiter_id, title, experience_years, required_skills, preferred_skills, description, tech_weight, comm_weight, status)
VALUES
  (job1_id, client_id,
   'Senior Software Engineer', 5,
   ARRAY['React','TypeScript','Node.js','AWS','PostgreSQL'],
   ARRAY['GraphQL','Docker','Kubernetes','Redis'],
   'Senior Software Engineer role. You will own full-stack features from design to deployment, mentor junior engineers, and contribute to architectural decisions.',
   65, 35, 'active'),
  (job2_id, client_id,
   'Product Manager', 3,
   ARRAY['Product Strategy','Agile','User Research','Data Analysis','Stakeholder Management'],
   ARRAY['SQL','Figma','A/B Testing','OKRs'],
   'Product Manager role. Define the roadmap, work with engineering and design, and drive outcomes through data-informed decisions.',
   40, 60, 'active'),
  (job3_id, client_id,
   'Data Analyst', 2,
   ARRAY['Python','SQL','Tableau','Excel','Statistics'],
   ARRAY['dbt','Looker','BigQuery','Spark'],
   'Data Analyst role. Build dashboards, run analyses, and partner with product and marketing to answer key business questions.',
   60, 40, 'active')
ON CONFLICT (id) DO NOTHING;

-- ── Talent pool entries ────────────────────────────────────────────────────────
INSERT INTO public.talent_pool (
  id, candidate_user_id, full_name, email, candidate_role, total_years,
  skills, education, summary, linkedin_url, github_url, availability, visibility, source
) VALUES
  (pool1_id, cand1_id,
   'Sarah Chen', 'sarah.chen@demo.com',
   'Senior Software Engineer', 6,
   ARRAY['React','TypeScript','Node.js','AWS','PostgreSQL','Docker','GraphQL'],
   'BSc Computer Science, University of Bristol',
   'Full-stack engineer with 6 years building scalable SaaS products. Led migration of monolith to microservices at previous fintech startup.',
   'https://linkedin.com/in/sarah-chen-demo', 'https://github.com/sarah-chen-demo',
   'available', 'all', 'registered'),

  (pool2_id, cand2_id,
   'Marcus Williams', 'marcus.williams@demo.com',
   'Product Manager', 4,
   ARRAY['Product Strategy','Agile','User Research','Data Analysis','Figma','SQL'],
   'MBA, London Business School',
   'Product Manager with 4 years experience in B2B SaaS. Grew core product NPS from 32 to 61 over 18 months.',
   'https://linkedin.com/in/marcus-williams-demo', null,
   'available', 'all', 'registered'),

  (pool3_id, cand3_id,
   'Priya Sharma', 'priya.sharma@demo.com',
   'Data Analyst', 3,
   ARRAY['Python','SQL','Tableau','Excel','Statistics','dbt','BigQuery'],
   'MSc Data Science, UCL',
   'Data Analyst specialising in product analytics. Built the self-serve analytics layer at a Series B startup.',
   'https://linkedin.com/in/priya-sharma-demo', null,
   'available', 'all', 'registered')
ON CONFLICT (id) DO UPDATE SET
  candidate_user_id = EXCLUDED.candidate_user_id;

-- ── Job matches ────────────────────────────────────────────────────────────────
INSERT INTO public.job_matches (
  talent_id, job_id, match_score, match_pass, match_reason, match_rank,
  scores, live_interview_status
) VALUES
  -- Sarah Chen → Senior Software Engineer (strong match, interview completed)
  (pool1_id, job1_id, 91, true,
   'Exceptional match. 6 years full-stack with direct overlap on React, TypeScript, Node.js, AWS and PostgreSQL. Led microservices migration.',
   'top10',
   '{"overallScore":88,"technicalScore":91,"communicationScore":84,"recommendation":"Strong Hire","highlights":["Led microservices migration serving 2M+ users","AWS certified with hands-on production experience","Strong advocate for TDD with evidence of quality culture"],"redFlags":[],"skillsVerification":{"verified":["React","TypeScript","Node.js","AWS","PostgreSQL"],"questionable":["GraphQL"],"notDemonstrated":["Kubernetes"]},"candidatePersona":"Tech Lead","offerProbability":82,"transcript":[{"question":"Walk me through a complex system design challenge you have solved.","answer":"At my previous fintech startup I led the migration of a monolith to event-driven microservices on AWS. We used SQS and Lambda for async processing, which reduced our p99 latency by 60%."},{"question":"How do you approach code review in a team setting?","answer":"I treat code review as a collaborative learning exercise rather than a gate. I look for correctness first, then clarity, then performance. I always explain the why behind suggestions."},{"question":"Describe how you would debug a production memory leak.","answer":"I would start by checking memory metrics over time to confirm the trend, then profile heap snapshots in Node.js using --inspect. I have done this twice — both times it came down to unclosed event listeners."},{"question":"Tell me about a time you had to push back on a deadline.","answer":"Our CTO wanted a feature in two weeks that would have required cutting tests. I presented a risk matrix and proposed a phased rollout — he agreed. It took three weeks but shipped cleanly."},{"question":"Where do you want to be in three years?","answer":"Leading a platform team, ideally. I enjoy mentoring and architectural work. I want to grow into a staff engineer or engineering manager role."}]}',
   null),

  -- Sarah Chen → Data Analyst (screened out — wrong profile)
  (pool1_id, job3_id, 34, false,
   'Background is software engineering. Limited evidence of analytics, BI tooling, or statistics. Not a fit for this Data Analyst role.',
   'weak', null, null),

  -- Marcus Williams → Product Manager (strong match, interview completed)
  (pool2_id, job2_id, 87, true,
   'Strong match. 4 years B2B SaaS PM experience with impact evidence. Skills align — Agile, user research, data analysis.',
   'strong',
   '{"overallScore":82,"technicalScore":72,"communicationScore":91,"recommendation":"Hire","highlights":["Drove NPS from 32 to 61 over 18 months with measurable product changes","Strong communicator — answers were structured and evidence-based","Clear product instincts demonstrated in prioritisation question"],"redFlags":["SQL and data depth below par for a data-informed PM role"],"skillsVerification":{"verified":["Product Strategy","Agile","User Research","Stakeholder Management"],"questionable":["Data Analysis","SQL"],"notDemonstrated":["A/B Testing"]},"candidatePersona":"IC","offerProbability":71,"transcript":[{"question":"How do you decide what to build next?","answer":"I combine quantitative signals — engagement data, conversion funnels — with qualitative input from customer interviews. Then I map ideas against our strategic bets and use ICE scoring to prioritise."},{"question":"Describe a product failure and what you learned.","answer":"I launched a batch-upload feature nobody used. I had validated the idea with power users but not the broader base. Now I always test assumptions with a wider sample before committing."},{"question":"How do you handle a disagreement with engineering on scope?","answer":"I try to understand the underlying concern first. Usually engineers flag scope for good reasons. I would rather renegotiate scope than ship a fragile feature."},{"question":"Tell me about a metric you moved significantly.","answer":"I reduced onboarding drop-off by 38% by breaking the setup wizard into three sessions with progress saved. It took three sprints and was the highest-impact thing I shipped that year."},{"question":"How do you communicate roadmap decisions to stakeholders?","answer":"I use a one-page roadmap doc updated monthly with the rationale for what is in and what is not. Transparency reduces stakeholder friction significantly."}]}',
   null),

  -- Priya Sharma → Data Analyst (outstanding match, passed screening, interview pending)
  (pool3_id, job3_id, 94, true,
   'Outstanding match. MSc Data Science with 3 years direct experience. Python, SQL, Tableau, dbt, BigQuery all present. Self-serve analytics build is directly relevant.',
   'top10', null, null),

  -- Priya Sharma → Product Manager (screened out — wrong profile)
  (pool3_id, job2_id, 51, false,
   'Analytical skills are strong but no PM-specific experience — no evidence of roadmap ownership, stakeholder management, or Agile delivery.',
   'moderate', null, null)
ON CONFLICT DO NOTHING;

END $$;
