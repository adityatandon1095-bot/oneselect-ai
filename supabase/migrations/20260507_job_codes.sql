-- Per-client job code system: each client gets a 3-letter prefix,
-- each job gets an auto-incremented code like TEV-0001, TEV-0002

alter table public.profiles
  add column if not exists client_prefix text default null;

alter table public.jobs
  add column if not exists job_code text default null;

-- ── Trigger function ──────────────────────────────────────────────────────────
create or replace function public.set_job_code()
returns trigger
language plpgsql
security definer
as $$
declare
  v_prefix  text;
  v_company text;
  v_words   text[];
  v_seq     int;
begin
  -- Look up client_prefix stored on the profile
  select client_prefix, company_name
    into v_prefix, v_company
    from public.profiles
   where id = new.recruiter_id;

  -- If no stored prefix, derive one from the company name
  if v_prefix is null or v_prefix = '' then
    -- Strip common legal suffixes
    v_company := regexp_replace(
      coalesce(v_company, 'UNK'),
      '\s+(Ltd\.?|Limited|Inc\.?|LLC|Corp\.?|PLC|GmbH|LLP)\.?\s*$', '', 'i'
    );
    v_company := trim(v_company);

    -- Insert space before each uppercase letter (splits CamelCase)
    v_words := string_to_array(
      regexp_replace(v_company, '([A-Z])', ' \1', 'g'), ' '
    );
    -- Keep only words starting with a letter
    v_words := array(select w from unnest(v_words) w where w ~ '^[a-zA-Z]');

    if array_length(v_words, 1) >= 3 then
      v_prefix := upper(left(v_words[1],1) || left(v_words[2],1) || left(v_words[3],1));
    elsif array_length(v_words, 1) = 2 then
      v_prefix := upper(left(v_words[1],1) || substring(v_words[1],2,1) || left(v_words[2],1));
    else
      v_prefix := upper(left(regexp_replace(v_company,'[^a-zA-Z]','','g'), 3));
    end if;

    v_prefix := rpad(coalesce(v_prefix,''), 3, 'X');
    v_prefix := left(v_prefix, 3);

    -- Store so future jobs for this client reuse the same prefix
    update public.profiles set client_prefix = v_prefix where id = new.recruiter_id;
  end if;

  -- Find the highest existing sequence number for this client+prefix
  select coalesce(max(
    case when job_code ~ ('^' || v_prefix || '-[0-9]+$')
      then (regexp_replace(job_code, '^[A-Z]+-', ''))::int
      else 0 end
  ), 0) + 1
    into v_seq
    from public.jobs
   where recruiter_id = new.recruiter_id;

  new.job_code := v_prefix || '-' || lpad(v_seq::text, 4, '0');
  return new;
end;
$$;

-- Drop + recreate trigger so re-running the migration is idempotent
drop trigger if exists trg_set_job_code on public.jobs;

create trigger trg_set_job_code
  before insert on public.jobs
  for each row execute function public.set_job_code();

-- Back-fill job_code for all existing jobs that don't have one
do $$
declare
  r record;
  v_prefix  text;
  v_company text;
  v_words   text[];
  v_seq     int;
begin
  for r in
    select id, recruiter_id
      from public.jobs
     where job_code is null
     order by recruiter_id, created_at
  loop
    -- Get / derive prefix
    select client_prefix, company_name
      into v_prefix, v_company
      from public.profiles
     where id = r.recruiter_id;

    if v_prefix is null or v_prefix = '' then
      v_company := regexp_replace(
        coalesce(v_company,'UNK'),
        '\s+(Ltd\.?|Limited|Inc\.?|LLC|Corp\.?|PLC|GmbH|LLP)\.?\s*$','','i');
      v_company := trim(v_company);
      v_words := string_to_array(regexp_replace(v_company,'([A-Z])',' \1','g'),' ');
      v_words := array(select w from unnest(v_words) w where w ~ '^[a-zA-Z]');
      if array_length(v_words,1) >= 3 then
        v_prefix := upper(left(v_words[1],1)||left(v_words[2],1)||left(v_words[3],1));
      elsif array_length(v_words,1) = 2 then
        v_prefix := upper(left(v_words[1],1)||substring(v_words[1],2,1)||left(v_words[2],1));
      else
        v_prefix := upper(left(regexp_replace(v_company,'[^a-zA-Z]','','g'),3));
      end if;
      v_prefix := rpad(coalesce(v_prefix,''),3,'X');
      v_prefix := left(v_prefix,3);
      update public.profiles set client_prefix = v_prefix where id = r.recruiter_id;
    end if;

    select coalesce(max(
      case when job_code ~ ('^'||v_prefix||'-[0-9]+$')
        then (regexp_replace(job_code,'^[A-Z]+-',''))::int else 0 end
    ),0) + 1
      into v_seq
      from public.jobs
     where recruiter_id = r.recruiter_id;

    update public.jobs set job_code = v_prefix||'-'||lpad(v_seq::text,4,'0')
     where id = r.id;
  end loop;
end;
$$;
