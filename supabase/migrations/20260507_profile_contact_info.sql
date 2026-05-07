-- Add personal contact fields to profiles for all user roles
alter table public.profiles
  add column if not exists phone     text default null,
  add column if not exists job_title text default null;
