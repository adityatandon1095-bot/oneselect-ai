-- =============================================================================
-- Demo seed data: 3 candidate logins + demo client + 3 jobs + pipeline candidates
-- Candidate logins: sarah.chen@demo.com / Demo1234!
--                   marcus.williams@demo.com / Demo1234!
--                   priya.sharma@demo.com / Demo1234!
-- =============================================================================

-- ── Fixed UUIDs ──────────────────────────────────────────────────────────────
-- Demo client profile (no auth user — admin sees it via service role)
-- Demo recruiter = same as client for job assignment
-- Candidate auth users
DO $$
DECLARE
  client_id   uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  cand1_id    uuid := '11111111-1111-1111-1111-111111111111';
  cand2_id    uuid := '22222222-2222-2222-2222-222222222222';
  cand3_id    uuid := '33333333-3333-3333-3333-333333333333';
  job1_id     uuid := 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  job2_id     uuid := 'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  job3_id     uuid := 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  pool1_id    uuid := 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  pool2_id    uuid := 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  pool3_id    uuid := 'bbbb3333-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
BEGIN

-- ── Auth users (candidates + demo client) ────────────────────────────────────
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
) VALUES
  (client_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hiring@acmecorp.demo', crypt('Demo1234!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Acme Corp Hiring"}'::jsonb, false, false),

  (cand1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'sarah.chen@demo.com', crypt('Demo1234!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Sarah Chen"}'::jsonb, false, false),

  (cand2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'marcus.williams@demo.com', crypt('Demo1234!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Marcus Williams"}'::jsonb, false, false),

  (cand3_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'priya.sharma@demo.com', crypt('Demo1234!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Priya Sharma"}'::jsonb, false, false)
ON CONFLICT (id) DO NOTHING;

-- ── Auth identities ───────────────────────────────────────────────────────────
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('hiring@acmecorp.demo',     client_id, jsonb_build_object('sub', client_id::text, 'email', 'hiring@acmecorp.demo'),       'email', now(), now(), now()),
  ('sarah.chen@demo.com',      cand1_id,  jsonb_build_object('sub', cand1_id::text,  'email', 'sarah.chen@demo.com'),        'email', now(), now(), now()),
  ('marcus.williams@demo.com', cand2_id,  jsonb_build_object('sub', cand2_id::text,  'email', 'marcus.williams@demo.com'),   'email', now(), now(), now()),
  ('priya.sharma@demo.com',    cand3_id,  jsonb_build_object('sub', cand3_id::text,  'email', 'priya.sharma@demo.com'),      'email', now(), now(), now())
ON CONFLICT DO NOTHING;

-- ── Demo client profile (admin sees jobs via this client_id) ─────────────────
INSERT INTO public.profiles (id, user_role, company_name, email, full_name, first_login, plan)
VALUES (client_id, 'client', 'Acme Corp', 'hiring@acmecorp.demo', 'Acme Corp Hiring', false, 'growth')
ON CONFLICT (id) DO NOTHING;

-- ── Candidate profiles ───────────────────────────────────────────────────────
INSERT INTO public.profiles (id, user_role, email, full_name, first_login, plan)
VALUES
  (cand1_id, 'candidate', 'sarah.chen@demo.com',    'Sarah Chen',      false, 'starter'),
  (cand2_id, 'candidate', 'marcus.williams@demo.com', 'Marcus Williams', false, 'starter'),
  (cand3_id, 'candidate', 'priya.sharma@demo.com',  'Priya Sharma',    false, 'starter')
ON CONFLICT (id) DO NOTHING;

-- ── Demo jobs (recruiter_id = client profile id, as per AdminPipeline) ───────
INSERT INTO public.jobs (id, recruiter_id, title, experience_years, required_skills, preferred_skills, description, tech_weight, comm_weight, status)
VALUES
  (job1_id, client_id,
   'Senior Software Engineer', 5,
   ARRAY['React','TypeScript','Node.js','AWS','PostgreSQL'],
   ARRAY['GraphQL','Docker','Kubernetes','Redis'],
   'We are looking for a Senior Software Engineer to join our product team. You will own full-stack features from design to deployment, mentor junior engineers, and contribute to architectural decisions. Strong emphasis on code quality, testing, and performance.',
   65, 35, 'active'),

  (job2_id, client_id,
   'Product Manager', 3,
   ARRAY['Product Strategy','Agile','User Research','Data Analysis','Stakeholder Management'],
   ARRAY['SQL','Figma','A/B Testing','OKRs'],
   'We are hiring an experienced Product Manager to lead our core platform. You will define the roadmap, work closely with engineering and design, and drive outcomes through data-informed decisions. Comfortable with ambiguity and able to communicate clearly at all levels.',
   40, 60, 'active'),

  (job3_id, client_id,
   'Data Analyst', 2,
   ARRAY['Python','SQL','Tableau','Excel','Statistics'],
   ARRAY['dbt','Looker','BigQuery','Spark'],
   'Join our data team as a Data Analyst. You will build dashboards, run ad-hoc analyses, and partner with product and marketing to answer key business questions. Comfortable with large datasets and able to distil complex findings into clear recommendations.',
   60, 40, 'active')
ON CONFLICT (id) DO NOTHING;

-- ── Talent pool entries (linked to candidate auth users) ─────────────────────
INSERT INTO public.talent_pool (
  id, candidate_user_id, full_name, email, candidate_role, total_years,
  skills, education, summary, linkedin_url, github_url, availability, visibility, source
) VALUES
  (pool1_id, cand1_id,
   'Sarah Chen', 'sarah.chen@demo.com',
   'Senior Software Engineer', 6,
   ARRAY['React','TypeScript','Node.js','AWS','PostgreSQL','Docker','GraphQL'],
   'BSc Computer Science, University of Bristol',
   'Full-stack engineer with 6 years building scalable SaaS products. Led migration of monolith to microservices at previous fintech startup. Strong advocate for test-driven development and clean architecture.',
   'https://linkedin.com/in/sarah-chen-demo',
   'https://github.com/sarah-chen-demo',
   'available', 'all', 'registered'),

  (pool2_id, cand2_id,
   'Marcus Williams', 'marcus.williams@demo.com',
   'Product Manager', 4,
   ARRAY['Product Strategy','Agile','User Research','Data Analysis','Figma','SQL'],
   'MBA, London Business School',
   'Product Manager with 4 years experience in B2B SaaS. Grew core product NPS from 32 to 61 over 18 months. Passionate about customer discovery and shipping high-quality, well-measured features.',
   'https://linkedin.com/in/marcus-williams-demo',
   null,
   'available', 'all', 'registered'),

  (pool3_id, cand3_id,
   'Priya Sharma', 'priya.sharma@demo.com',
   'Data Analyst', 3,
   ARRAY['Python','SQL','Tableau','Excel','Statistics','dbt','BigQuery'],
   'MSc Data Science, UCL',
   'Data Analyst specialising in product analytics and growth. Built the self-serve analytics layer at a Series B startup. Comfortable translating complex data into executive-ready insights.',
   'https://linkedin.com/in/priya-sharma-demo',
   null,
   'available', 'all', 'registered')
ON CONFLICT (id) DO NOTHING;

-- ── Job matches (talent pool → jobs) ─────────────────────────────────────────
INSERT INTO public.job_matches (
  talent_id, job_id, match_score, match_pass, match_reason, match_rank,
  scores, live_interview_status
) VALUES
  -- Sarah Chen → Senior Software Engineer (strong match, interview done)
  (pool1_id, job1_id, 91, true,
   'Exceptional match. 6 years full-stack experience with direct overlap on React, TypeScript, Node.js, AWS and PostgreSQL. Led microservices migration — highly relevant. Strong communication and technical depth evident throughout CV.',
   'top10',
   '{"overallScore":88,"technicalScore":91,"communicationScore":84,"recommendation":"Strong Hire","transcript":[{"question":"Walk me through a complex system design challenge you have solved.","answer":"At my previous fintech startup I led the migration of a monolith to event-driven microservices on AWS. We used SQS and Lambda for async processing, which reduced our p99 latency by 60%."},{"question":"How do you approach code review in a team setting?","answer":"I treat code review as a collaborative learning exercise rather than a gate. I look for correctness first, then clarity, then performance. I always explain the why behind suggestions."},{"question":"Describe how you would debug a production memory leak.","answer":"I would start by checking memory metrics over time to confirm the trend, then profile heap snapshots in Node.js using --inspect. I have done this twice — both times it came down to unclosed event listeners."},{"question":"Tell me about a time you had to push back on a deadline.","answer":"Our CTO wanted a feature in two weeks that would have required cutting tests. I presented a risk matrix and proposed a phased rollout — he agreed. It took three weeks but shipped cleanly."},{"question":"Where do you want to be in three years?","answer":"Leading a platform team, ideally. I enjoy mentoring and architectural work. I want to grow into a staff engineer or engineering manager role depending on the company."}]}',
   null),

  -- Sarah Chen → Data Analyst (lower match, screened out)
  (pool1_id, job3_id, 34, false,
   'Background is heavily software engineering. Limited evidence of analytics, BI tooling, or statistics work. Not a strong fit for this Data Analyst role.',
   'weak', null, null),

  -- Marcus Williams → Product Manager (strong match, interview done)
  (pool2_id, job2_id, 87, true,
   'Strong match. 4 years B2B SaaS PM experience with evidence of impact (NPS improvement). Skills align well — Agile, user research, data analysis. MBA adds strategic perspective.',
   'strong',
   '{"overallScore":82,"technicalScore":72,"communicationScore":91,"recommendation":"Hire","transcript":[{"question":"How do you decide what to build next?","answer":"I combine quantitative signals — engagement data, conversion funnels — with qualitative input from customer interviews. Then I map ideas against our strategic bets and use a simple ICE score to prioritise."},{"question":"Describe a product failure and what you learned.","answer":"I launched a batch-upload feature nobody used. I had validated the idea with power users but not the broader base. Now I always test assumptions with a wider sample before committing to build."},{"question":"How do you handle a disagreement with engineering on scope?","answer":"I try to understand the underlying concern first. Usually engineers flag scope for good reasons — technical debt or underestimated complexity. I would rather renegotiate scope than ship a fragile feature."},{"question":"Tell me about a metric you moved significantly.","answer":"I reduced onboarding drop-off by 38% by breaking the setup wizard into three sessions with progress saved. It took three sprints and was the highest-impact thing I shipped that year."},{"question":"How do you communicate roadmap decisions to stakeholders?","answer":"I use a one-page roadmap doc updated monthly with the rationale for what is in and what is not. I present it quarterly and leave time for questions. Transparency reduces stakeholder friction significantly."}]}',
   null),

  -- Priya Sharma → Data Analyst (strong match, passed screening, interview pending)
  (pool3_id, job3_id, 94, true,
   'Outstanding match. MSc Data Science with 3 years direct experience in product analytics. Python, SQL, Tableau, dbt, BigQuery all present. Self-serve analytics build is directly relevant. Clear communicator from summary.',
   'top10', null, null),

  -- Priya Sharma → Product Manager (moderate match, screened out)
  (pool3_id, job2_id, 51, false,
   'Analytical skills are strong but the candidate lacks PM-specific experience — no evidence of roadmap ownership, stakeholder management, or Agile delivery. Would reconsider after 1-2 years in a hybrid PM/analyst role.',
   'moderate', null, null)
ON CONFLICT DO NOTHING;

-- ── Pipeline candidates (CV-upload flow — shown in AdminPipeline) ─────────────
-- Job 1: Senior Software Engineer — 6 candidates at various stages
INSERT INTO public.candidates (
  job_id, full_name, email, phone, candidate_role, total_years,
  skills, education, summary, source,
  match_score, match_pass, match_reason, match_rank, scores, stage
) VALUES
  -- Interviewed, top pick
  (job1_id, 'James Okafor', 'james.okafor@example.com', '+44 7900 111001',
   'Software Engineer', 7,
   ARRAY['React','TypeScript','Node.js','AWS','Kubernetes','PostgreSQL','Redis'],
   'MEng Computer Science, Imperial College London',
   'Seven years building distributed systems at a cloud infrastructure company. Moved to full-stack over the last two years. Strong opinions on observability and incident response.',
   'uploaded', 88, true,
   'Excellent fit. Deep backend experience plus solid React skills. Kubernetes and Redis exposure above requirements.',
   'top10',
   '{"overallScore":91,"technicalScore":94,"communicationScore":87,"recommendation":"Strong Hire","transcript":[{"question":"Walk me through a system design challenge.","answer":"I designed a distributed rate limiter using Redis sliding window. The tricky part was ensuring atomicity across nodes — I solved it with Lua scripts."},{"question":"How do you ensure code quality at scale?","answer":"Automated linting, PR size limits, mandatory integration tests, and quarterly architecture reviews. Culture matters more than tooling."},{"question":"Describe a production incident you handled.","answer":"A memory leak caused cascading failures on a Friday evening. I triaged in 20 minutes, deployed a fix in 40. Wrote a blameless postmortem the next day."},{"question":"How do you onboard to a new codebase?","answer":"I read the ADRs first, then trace a request end-to-end. After a week I try to fix a small bug to get a PR merged and understand the review culture."},{"question":"Where do you want to be in three years?","answer":"Staff engineer, owning a platform domain. I enjoy deep technical work and mentoring."}]}',
   'interviewed'),

  -- Interviewed, borderline
  (job1_id, 'Elena Kovacs', 'elena.kovacs@example.com', '+44 7900 111002',
   'Frontend Engineer', 4,
   ARRAY['React','TypeScript','CSS','Jest','Storybook'],
   'BSc Software Engineering, University of Edinburgh',
   'Four years focused on frontend at a design-led agency, then a SaaS startup. Strong UI instincts but limited backend and cloud exposure.',
   'uploaded', 71, true,
   'Strong React/TypeScript skills. Backend and AWS experience thinner than ideal for a senior full-stack role. Worth interviewing given frontend depth.',
   'strong',
   '{"overallScore":68,"technicalScore":62,"communicationScore":78,"recommendation":"Borderline","transcript":[{"question":"How comfortable are you with backend work?","answer":"I have done Node.js APIs but I would not call myself a backend engineer. I am keen to grow that side."},{"question":"Tell me about your most complex frontend project.","answer":"A real-time collaborative editor using CRDTs. It was technically challenging and I learned a lot about state synchronisation."},{"question":"How do you approach performance optimisation?","answer":"I start with Chrome DevTools, look at paint and layout costs, then move to bundle analysis. I cut our largest bundle by 40% with code splitting."}]}',
   'interviewed'),

  -- Passed screening, not yet interviewed
  (job1_id, 'Ravi Patel', 'ravi.patel@example.com', '+44 7900 111003',
   'Full Stack Developer', 5,
   ARRAY['React','Node.js','Python','PostgreSQL','AWS','Docker'],
   'BSc Computer Science, University of Warwick',
   'Five years across two startups, most recently as a full-stack lead. Comfortable with the whole stack from React frontends to Python microservices.',
   'uploaded', 83, true,
   'Strong all-round fit. Slightly less TypeScript experience than ideal but strong Python compensates. Good leadership signals.',
   'strong', null, 'screened'),

  -- Passed screening, not yet interviewed
  (job1_id, 'Aisha Diallo', 'aisha.diallo@example.com', '+44 7900 111004',
   'Backend Engineer', 6,
   ARRAY['Node.js','TypeScript','AWS','Kafka','PostgreSQL','Go'],
   'BSc Computer Science, University of Manchester',
   'Six years in backend engineering at scale — messaging systems, high-throughput APIs, database optimisation. Recently picked up Go.',
   'uploaded', 79, true,
   'Very strong backend profile. Less frontend but the role is 65% technical so this is acceptable. Go experience is a bonus.',
   'top10', null, 'screened'),

  -- Failed screening
  (job1_id, 'Tom Bradley', 'tom.bradley@example.com', '+44 7900 111005',
   'Junior Developer', 1,
   ARRAY['HTML','CSS','JavaScript','React'],
   'Bootcamp Graduate',
   'One year experience after completing a coding bootcamp. Built personal projects in React. Looking for first professional role.',
   'uploaded', 22, false,
   'Insufficient experience for a senior role. Skills are junior-level. Would reconsider in 3-4 years.',
   'weak', null, 'screened'),

  -- Failed screening
  (job1_id, 'Nina Hoffmann', 'nina.hoffmann@example.com', '+44 7900 111006',
   'QA Engineer', 3,
   ARRAY['Selenium','Cypress','Java','JIRA','TestRail'],
   'BSc Information Systems, University of Leeds',
   'Three years in QA. Experienced with automated testing frameworks. No software engineering or product development background.',
   'uploaded', 18, false,
   'QA background does not meet the engineering requirements. Strong tester but not the right profile for this position.',
   'weak', null, 'screened'),

-- Job 2: Product Manager — 5 candidates
  -- Interviewed, strong hire
  (job2_id, 'Sophie Laurent', 'sophie.laurent@example.com', '+44 7900 222001',
   'Senior Product Manager', 5,
   ARRAY['Product Strategy','Agile','User Research','SQL','A/B Testing','Figma','OKRs'],
   'MSc Human-Computer Interaction, UCL',
   'Five years as a PM, three of them at a scale-up growing from Series A to Series C. Shipped three platform products with measurable impact. Advocate for continuous discovery.',
   'uploaded', 93, true,
   'Exceptional candidate. Every required and preferred skill present. Measurable impact across multiple roles. Very strong culture signal.',
   'top10',
   '{"overallScore":90,"technicalScore":83,"communicationScore":96,"recommendation":"Strong Hire","transcript":[{"question":"How do you build your roadmap?","answer":"I start from company strategy, work back to bets, then populate with opportunities from customer research and data. I review quarterly and do rolling 6-week sprints."},{"question":"Tell me about a product you are proud of.","answer":"A self-serve onboarding flow that replaced a 4-hour implementation call. Reduced time-to-value from 5 days to 2 hours, which was a key sales unlock."},{"question":"How do you manage a backlog that is too large?","answer":"Ruthless prioritisation using a combination of reach, impact, confidence, and effort. I also archive anything untouched for 90 days so the backlog stays honest."},{"question":"Describe a time you had to kill a feature.","answer":"We had a reporting module that 3% of users used and cost 20% of our maintenance effort. I killed it after validating that no churning customer cited it. The team were relieved."},{"question":"How do you align engineering and design?","answer":"Weekly design reviews open to everyone, shared roadmap access, and quarterly design-engineering retrospectives. Psychological safety matters most."}]}',
   'interviewed'),

  -- Passed screening
  (job2_id, 'Daniel Kim', 'daniel.kim@example.com', '+44 7900 222002',
   'Product Manager', 3,
   ARRAY['Product Strategy','Agile','Stakeholder Management','User Research','Data Analysis'],
   'BA Economics, Durham University',
   'Three years as a PM at a B2C app and then a B2B SaaS company. Strong discovery and stakeholder skills. Less data/SQL experience.',
   'uploaded', 78, true,
   'Good all-round PM. Weaker on data analysis and SQL. Meets minimum bar. Worth interviewing to assess culture fit.',
   'moderate', null, 'screened'),

  -- Failed screening
  (job2_id, 'Laura Svensson', 'laura.svensson@example.com', '+44 7900 222003',
   'Marketing Manager', 4,
   ARRAY['Marketing Strategy','SEO','Google Analytics','Content Marketing','HubSpot'],
   'BA Marketing, University of Bristol',
   'Four years in B2B marketing. Strong demand generation background but no product management experience.',
   'uploaded', 29, false,
   'Marketing background without PM experience. Not the right fit. Skills are not transferable to this role.',
   'weak', null, 'screened'),

-- Job 3: Data Analyst — 5 candidates
  -- Interviewed, strong hire
  (job3_id, 'Omar Hassan', 'omar.hassan@example.com', '+44 7900 333001',
   'Senior Data Analyst', 4,
   ARRAY['Python','SQL','Tableau','dbt','BigQuery','Statistics','Excel'],
   'MSc Statistics, University of Oxford',
   'Four years in data analytics, most recently at a Series B fintech. Built the company data stack from scratch. Expert in dbt and BigQuery. Published internal tutorials used by 30+ colleagues.',
   'uploaded', 96, true,
   'Outstanding candidate. Exceeds requirements across all dimensions. dbt and BigQuery expertise is exactly what the team needs.',
   'top10',
   '{"overallScore":93,"technicalScore":95,"communicationScore":90,"recommendation":"Strong Hire","transcript":[{"question":"Walk me through a complex SQL query you have written.","answer":"A 14-table recursive CTE to calculate customer lifetime value with partial-period adjustments. I documented it with inline comments and a Notion explainer for the team."},{"question":"How do you ensure data quality in a pipeline?","answer":"Source freshness checks in dbt, schema tests, custom singular tests for business logic, and Slack alerts on failures. I treat data pipelines like software."},{"question":"Tell me about a dashboard that drove a decision.","answer":"A retention cohort dashboard I built revealed that a feature we thought was sticky actually had negative long-term retention. The PM used it to kill the feature in the next planning cycle."},{"question":"How do you communicate findings to non-technical stakeholders?","answer":"Lead with the so-what, not the methodology. One chart, one headline, one recommendation. The data is in the appendix for those who want it."},{"question":"Describe a time your analysis was wrong.","answer":"I attributed a revenue dip to seasonality when it was actually a payment provider issue. I now always triangulate with engineering and finance before publishing a root-cause analysis."}]}',
   'interviewed'),

  -- Passed screening
  (job3_id, 'Fatima Al-Rashidi', 'fatima.alrashidi@example.com', '+44 7900 333002',
   'Data Analyst', 2,
   ARRAY['Python','SQL','Excel','Statistics','Power BI'],
   'BSc Mathematics, University of Nottingham',
   'Two years as a data analyst in retail and logistics. Strong SQL and Python. Less experience with modern data stack tools like dbt.',
   'uploaded', 72, true,
   'Meets requirements. Python and SQL strong. dbt experience is a gap but trainable. Recommend interview.',
   'moderate', null, 'screened'),

  -- Passed screening
  (job3_id, 'Luca Marchetti', 'luca.marchetti@example.com', '+44 7900 333003',
   'Business Analyst', 3,
   ARRAY['SQL','Excel','Tableau','Process Mapping','Stakeholder Management'],
   'BSc Business Management, University of Bath',
   'Three years as a BA bridging business and technology teams. Good SQL and Tableau skills. Python experience is minimal.',
   'uploaded', 64, true,
   'Borderline. Strong Tableau and SQL but Python gap is a concern. Business analysis experience may not translate directly.',
   'moderate', null, 'screened'),

  -- Failed screening
  (job3_id, 'Chris Wade', 'chris.wade@example.com', '+44 7900 333004',
   'Excel Analyst', 1,
   ARRAY['Excel','PowerPoint','Word'],
   'BA Business Administration, Oxford Brookes University',
   'One year using Excel for reporting at an accounting firm. No programming or data tooling experience.',
   'uploaded', 15, false,
   'Insufficient technical skills. Excel-only background does not meet the requirements for a data analyst role with Python and SQL requirements.',
   'weak', null, 'screened')
ON CONFLICT DO NOTHING;

END $$;
