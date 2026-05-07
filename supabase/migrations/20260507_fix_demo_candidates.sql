-- Fix demo candidate auth users — safe to run multiple times
-- Run this in Supabase SQL editor if candidate logins fail

DO $$
DECLARE
  cand1_id uuid := '11111111-1111-1111-1111-111111111111';
  cand2_id uuid := '22222222-2222-2222-2222-222222222222';
  cand3_id uuid := '33333333-3333-3333-3333-333333333333';
BEGIN

-- Upsert auth users (handles both first-time and re-run)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
) VALUES
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
ON CONFLICT (id) DO UPDATE
  SET encrypted_password = crypt('Demo1234!', gen_salt('bf')),
      email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now()),
      updated_at = now();

-- Upsert identities
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  ('sarah.chen@demo.com',      cand1_id, jsonb_build_object('sub', cand1_id::text, 'email', 'sarah.chen@demo.com'),        'email', now(), now(), now()),
  ('marcus.williams@demo.com', cand2_id, jsonb_build_object('sub', cand2_id::text, 'email', 'marcus.williams@demo.com'),   'email', now(), now(), now()),
  ('priya.sharma@demo.com',    cand3_id, jsonb_build_object('sub', cand3_id::text, 'email', 'priya.sharma@demo.com'),      'email', now(), now(), now())
ON CONFLICT DO NOTHING;

-- Upsert candidate profiles
INSERT INTO public.profiles (id, user_role, email, full_name, first_login, plan)
VALUES
  (cand1_id, 'candidate', 'sarah.chen@demo.com',      'Sarah Chen',      false, 'starter'),
  (cand2_id, 'candidate', 'marcus.williams@demo.com', 'Marcus Williams', false, 'starter'),
  (cand3_id, 'candidate', 'priya.sharma@demo.com',    'Priya Sharma',    false, 'starter')
ON CONFLICT (id) DO UPDATE
  SET user_role = 'candidate', email = EXCLUDED.email, full_name = EXCLUDED.full_name;

END $$;
