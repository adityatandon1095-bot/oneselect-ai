-- Allow anyone to read active jobs (public job board)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'jobs' and policyname = 'public_read_active_jobs'
  ) then
    create policy "public_read_active_jobs"
      on public.jobs for select
      to anon
      using (status = 'active');
  end if;
end $$;

-- Allow anyone to submit a job application (source = 'applied')
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'candidates' and policyname = 'public_insert_applied_candidates'
  ) then
    create policy "public_insert_applied_candidates"
      on public.candidates for insert
      to anon
      with check (source = 'applied');
  end if;
end $$;
