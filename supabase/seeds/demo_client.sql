-- Demo client seed — run in Supabase SQL Editor
-- Creates a live, populated demo account for sales demos.
-- Login: demo@oneselect.ai / OneSelectDemo2026

DO $$
DECLARE
  demo_user_id  uuid := '00000000-0000-0000-0000-000000000001';
  demo_job_id   uuid := '00000000-0000-0000-0000-000000000010';
BEGIN

-- ── Auth user ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  raw_app_meta_data, is_super_admin
) VALUES (
  demo_user_id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo@oneselect.ai',
  crypt('OneSelectDemo2026', gen_salt('bf')),
  now(),
  '{"role":"client","company_name":"Demo Corp"}'::jsonb,
  now(), now(),
  '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  false
) ON CONFLICT (id) DO UPDATE SET
  encrypted_password = crypt('OneSelectDemo2026', gen_salt('bf')),
  email_confirmed_at = now();

-- ── Auth identity ──────────────────────────────────────────────────────────
INSERT INTO auth.identities (
  id, user_id, provider, identity_data, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  gen_random_uuid(), demo_user_id, 'email',
  json_build_object('sub', demo_user_id::text, 'email', 'demo@oneselect.ai'),
  'demo@oneselect.ai',
  now(), now(), now()
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- ── Profile ────────────────────────────────────────────────────────────────
INSERT INTO profiles (
  id, email, user_role, company_name, full_name,
  subscription_status, first_login, trial_ends_at, created_at
) VALUES (
  demo_user_id, 'demo@oneselect.ai', 'client', 'Demo Corp', 'Demo User',
  'active', false, now() + interval '90 days', now()
) ON CONFLICT (id) DO UPDATE SET
  subscription_status = 'active',
  trial_ends_at       = now() + interval '90 days',
  first_login         = false;

-- ── Job posting ────────────────────────────────────────────────────────────
INSERT INTO jobs (
  id, recruiter_id, title, description, experience_years,
  required_skills, preferred_skills,
  tech_weight, comm_weight,
  status, created_at
) VALUES (
  demo_job_id, demo_user_id,
  'Senior Software Engineer',
  E'We are looking for a Senior Software Engineer to join our growing engineering team.\n\nAbout the Role\nYou will design and build scalable backend services, collaborate closely with product and design, and mentor junior engineers.\n\nKey Responsibilities\n- Architect and deliver backend services in Python/Node.js\n- Own full delivery cycles from design to deployment\n- Collaborate with frontend engineers on API design\n- Participate in code reviews and technical design sessions\n\nRequired Qualifications\n- 5+ years of professional software engineering experience\n- Strong Python or Node.js skills\n- Experience with PostgreSQL or similar RDBMS\n- Familiarity with AWS or GCP\n\nPreferred Qualifications\n- Experience with microservices and event-driven architecture\n- Prior work in a fast-paced startup environment',
  5,
  ARRAY['Python', 'Node.js', 'PostgreSQL', 'AWS', 'REST APIs'],
  ARRAY['Docker', 'Kubernetes', 'Redis', 'GraphQL'],
  65, 35,
  'active', now() - interval '5 days'
) ON CONFLICT (id) DO NOTHING;

-- ── Candidate 1: Strong Hire (interview done) ──────────────────────────────
INSERT INTO candidates (
  job_id, full_name, email, candidate_role, total_years,
  skills, summary,
  match_score, match_pass, match_reason,
  scores, video_urls,
  created_at
) VALUES (
  demo_job_id,
  'Aisha Patel', 'aisha.patel@example.com', 'Senior Software Engineer', 6,
  ARRAY['Python', 'FastAPI', 'PostgreSQL', 'AWS', 'Docker'],
  '6 years building distributed systems at fintech scale. Led migration of monolith to microservices serving 2M+ users.',
  88, true,
  'Strong technical match. 6 years Python + PostgreSQL experience. Led a major migration project demonstrating seniority. AWS certified.',
  '{
    "overallScore": 91,
    "recommendation": "Strong Hire",
    "technicalAbility": 94,
    "communication": 88,
    "roleFit": 92,
    "problemSolving": 90,
    "experienceRelevance": 93,
    "insight": "Aisha demonstrated exceptional depth in distributed systems and spoke confidently about leading cross-functional engineering initiatives. Her answers on system design were the strongest of all candidates reviewed.",
    "strengths": ["Deep Python and PostgreSQL expertise", "Proven leadership on large-scale migrations", "Strong communication and stakeholder management"],
    "flags": [],
    "bestAnswer": "When asked about handling cascading failures in a microservices system, Aisha described a circuit breaker pattern she implemented at her previous role that reduced P99 latency by 40% during peak load."
  }'::jsonb,
  '[{"q":"Tell me about a complex system you designed from scratch.","url":null},{"q":"How do you approach performance bottlenecks in a PostgreSQL database?","url":null}]'::jsonb,
  now() - interval '4 days'
) ON CONFLICT DO NOTHING;

-- ── Candidate 2: Hire (interview done) ────────────────────────────────────
INSERT INTO candidates (
  job_id, full_name, email, candidate_role, total_years,
  skills, summary,
  match_score, match_pass, match_reason,
  scores, video_urls,
  created_at
) VALUES (
  demo_job_id,
  'Marcus Thompson', 'marcus.thompson@example.com', 'Backend Engineer', 5,
  ARRAY['Node.js', 'TypeScript', 'PostgreSQL', 'GCP', 'REST APIs'],
  'Full-stack engineer with 5 years in SaaS, specialising in Node.js APIs and cloud-native architecture.',
  81, true,
  'Good technical match. 5 years Node.js and TypeScript. GCP experience aligns with cloud requirements. Communication could be stronger.',
  '{
    "overallScore": 78,
    "recommendation": "Hire",
    "technicalAbility": 82,
    "communication": 71,
    "roleFit": 79,
    "problemSolving": 80,
    "experienceRelevance": 78,
    "insight": "Marcus has solid backend engineering fundamentals and delivered clear technical answers. Slightly less senior than Aisha on system design but shows strong potential.",
    "strengths": ["Solid Node.js and TypeScript skills", "Good understanding of API design principles", "Cloud-native experience on GCP"],
    "flags": ["Communication could be more structured"],
    "bestAnswer": "Described an API rate-limiting system he built using Redis sliding windows, handling 10k requests/second with sub-5ms response times."
  }'::jsonb,
  '[{"q":"Walk me through your most complex API design decision.","url":null},{"q":"How do you ensure reliability in a Node.js microservices environment?","url":null}]'::jsonb,
  now() - interval '3 days'
) ON CONFLICT DO NOTHING;

-- ── Candidate 3: Shortlisted, interview pending ────────────────────────────
INSERT INTO candidates (
  job_id, full_name, email, candidate_role, total_years,
  skills, summary,
  match_score, match_pass, match_reason,
  created_at
) VALUES (
  demo_job_id,
  'Sofia Larsson', 'sofia.larsson@example.com', 'Software Engineer', 5,
  ARRAY['Python', 'Django', 'AWS', 'PostgreSQL'],
  'Python engineer at a Series B startup. 5 years across data pipelines and web APIs.',
  76, true,
  'Solid Python and AWS alignment. 5 years relevant experience. Invited to complete video interview.',
  now() - interval '2 days'
) ON CONFLICT DO NOTHING;

-- ── Candidate 4: Screened out ──────────────────────────────────────────────
INSERT INTO candidates (
  job_id, full_name, email, candidate_role, total_years,
  skills, summary,
  match_score, match_pass, match_reason,
  created_at
) VALUES (
  demo_job_id,
  'James Okafor', 'james.okafor@example.com', 'Junior Developer', 2,
  ARRAY['JavaScript', 'React', 'Node.js'],
  'Junior full-stack developer, 2 years experience primarily on frontend.',
  42, false,
  'Insufficient backend experience for a senior role. Only 2 years total experience versus the required 5+. Strong frontend skills but does not meet minimum bar.',
  now() - interval '3 days'
) ON CONFLICT DO NOTHING;

END $$;
