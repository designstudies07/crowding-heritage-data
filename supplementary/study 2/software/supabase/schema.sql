-- Study 2 automatic balanced assignment schema for Supabase/PostgreSQL
create table if not exists public.study2_programs (
  program_code text primary key,
  completed_count integer not null default 0 check (completed_count >= 0),
  next_serial integer not null default 0 check (next_serial >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.study2_assignments (
  participant_id text primary key,
  program_code text not null references public.study2_programs(program_code),
  serial integer not null,
  status text not null default 'allocated' check (status in ('allocated','completed')),
  allocated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(program_code, serial)
);

create table if not exists public.study2_trials (
  participant_id text not null references public.study2_assignments(participant_id) on delete cascade,
  program_code text not null references public.study2_programs(program_code),
  trial_id text not null,
  trial_order smallint not null check (trial_order between 1 and 4),
  landmark_id text not null check (landmark_id in ('notre_dame','duomo','colosseum','cologne')),
  task_type text not null check (task_type in ('feature','visit')),
  payload jsonb not null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(participant_id, trial_id),
  unique(participant_id, trial_order)
);

create table if not exists public.study2_sessions (
  participant_id text primary key references public.study2_assignments(participant_id) on delete cascade,
  program_code text not null references public.study2_programs(program_code),
  app_version text not null,
  completion_status text not null default 'completed' check (completion_status = 'completed'),
  payload jsonb not null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study2_trials_program_idx on public.study2_trials(program_code, participant_id);
create index if not exists study2_sessions_program_idx on public.study2_sessions(program_code);

alter table public.study2_programs enable row level security;
alter table public.study2_assignments enable row level security;
alter table public.study2_trials enable row level security;
alter table public.study2_sessions enable row level security;

insert into public.study2_programs(program_code)
select code from unnest(array['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4']) code
on conflict (program_code) do nothing;

create or replace function public.assign_study2_program()
returns table(participant_id text, program_code text, main_group text, order_variant integer, serial integer, completed_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program text;
  v_serial integer;
  v_completed integer;
begin
  select p.program_code, p.completed_count
    into v_program, v_completed
  from public.study2_programs p
  where p.completed_count = (select min(p2.completed_count) from public.study2_programs p2)
  order by random()
  limit 1
  for update;

  update public.study2_programs
  set next_serial = next_serial + 1, updated_at = now()
  where study2_programs.program_code = v_program
  returning next_serial into v_serial;

  participant_id := v_program || '-' || lpad(v_serial::text, 3, '0');
  program_code := v_program;
  main_group := substring(v_program from 1 for 1);
  order_variant := substring(v_program from 2 for 1)::integer;
  serial := v_serial;
  completed_count := v_completed;

  insert into public.study2_assignments(participant_id, program_code, serial)
  values (participant_id, v_program, v_serial);

  return next;
end;
$$;

create or replace function public.record_study2_trial(p_trial jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id text;
  v_program_code text;
  v_assigned_program text;
  v_trial_id text;
  v_trial_order integer;
  v_landmark_id text;
  v_task_type text;
begin
  if p_trial is null or jsonb_typeof(p_trial) <> 'object' then
    raise exception 'Trial payload must be a JSON object';
  end if;

  v_participant_id := nullif(p_trial->>'participant_id', '');
  v_program_code := nullif(p_trial->>'program_code', '');
  v_trial_id := nullif(p_trial->>'trial_id', '');
  v_trial_order := nullif(p_trial->>'trial_order', '')::integer;
  v_landmark_id := nullif(p_trial->>'landmark_id', '');
  v_task_type := nullif(p_trial->>'task_type', '');

  if v_participant_id is null or v_program_code is null or v_trial_id is null or v_trial_order is null then
    raise exception 'Trial identifiers are incomplete';
  end if;
  if v_trial_order not between 1 and 4 then
    raise exception 'Invalid trial_order: %', v_trial_order;
  end if;
  if v_trial_id <> v_program_code || '-T' || v_trial_order::text then
    raise exception 'trial_id does not match program and order';
  end if;
  if v_landmark_id not in ('notre_dame','duomo','colosseum','cologne') then
    raise exception 'Invalid landmark_id: %', v_landmark_id;
  end if;
  if v_task_type not in ('feature','visit') then
    raise exception 'Invalid task_type: %', v_task_type;
  end if;

  select a.program_code into v_assigned_program
  from public.study2_assignments a
  where a.participant_id = v_participant_id;

  if v_assigned_program is null then
    raise exception 'Unknown participant_id: %', v_participant_id;
  end if;
  if v_assigned_program <> v_program_code then
    raise exception 'Program does not match participant assignment';
  end if;

  insert into public.study2_trials(participant_id, program_code, trial_id, trial_order, landmark_id, task_type, payload)
  values (v_participant_id, v_program_code, v_trial_id, v_trial_order, v_landmark_id, v_task_type, p_trial)
  on conflict (participant_id, trial_id) do update
  set program_code = excluded.program_code,
      trial_order = excluded.trial_order,
      landmark_id = excluded.landmark_id,
      task_type = excluded.task_type,
      payload = excluded.payload,
      updated_at = now();

  return jsonb_build_object('ok', true, 'participant_id', v_participant_id, 'trial_id', v_trial_id);
end;
$$;

create or replace function public.submit_study2_session(p_session jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id text;
  v_program_code text;
  v_assigned_program text;
  v_status text;
  v_app_version text;
  v_trials jsonb;
  v_trial jsonb;
  v_trial_count integer;
  v_completed_count integer;
  v_was_new_completion boolean := false;
begin
  if p_session is null or jsonb_typeof(p_session) <> 'object' then
    raise exception 'Session payload must be a JSON object';
  end if;

  v_participant_id := nullif(p_session->>'participant_id', '');
  v_program_code := nullif(p_session->>'program_code', '');
  v_app_version := nullif(p_session->>'app_version', '');
  v_trials := p_session->'trials';

  if v_participant_id is null or v_program_code is null or v_app_version is null then
    raise exception 'Session identifiers are incomplete';
  end if;
  if v_trials is null or jsonb_typeof(v_trials) <> 'array' or jsonb_array_length(v_trials) <> 4 then
    raise exception 'A completed session must contain exactly four trials';
  end if;
  if p_session->'final' is null or jsonb_typeof(p_session->'final') <> 'object' then
    raise exception 'Final evaluation is missing';
  end if;

  select a.program_code, a.status into v_assigned_program, v_status
  from public.study2_assignments a
  where a.participant_id = v_participant_id
  for update;

  if v_assigned_program is null then
    raise exception 'Unknown participant_id: %', v_participant_id;
  end if;
  if v_assigned_program <> v_program_code then
    raise exception 'Program does not match participant assignment';
  end if;

  for v_trial in select value from jsonb_array_elements(v_trials)
  loop
    if v_trial->>'participant_id' <> v_participant_id or v_trial->>'program_code' <> v_program_code then
      raise exception 'Trial does not belong to this session';
    end if;
    perform public.record_study2_trial(v_trial);
  end loop;

  select count(*) into v_trial_count
  from public.study2_trials t
  where t.participant_id = v_participant_id;

  if v_trial_count <> 4 then
    raise exception 'Completed session did not produce exactly four unique trials';
  end if;

  insert into public.study2_sessions(participant_id, program_code, app_version, completion_status, payload)
  values (v_participant_id, v_program_code, v_app_version, 'completed', p_session)
  on conflict (participant_id) do update
  set program_code = excluded.program_code,
      app_version = excluded.app_version,
      completion_status = 'completed',
      payload = excluded.payload,
      updated_at = now();

  if v_status <> 'completed' then
    update public.study2_assignments as a
    set status = 'completed', completed_at = now()
    where a.participant_id = v_participant_id;

    update public.study2_programs as p
    set completed_count = p.completed_count + 1, updated_at = now()
    where p.program_code = v_program_code
    returning p.completed_count into v_completed_count;

    v_was_new_completion := true;
  else
    select p.completed_count into v_completed_count
    from public.study2_programs p
    where p.program_code = v_program_code;
  end if;

  return jsonb_build_object(
    'ok', true,
    'participant_id', v_participant_id,
    'program_code', v_program_code,
    'completed_count', v_completed_count,
    'was_new_completion', v_was_new_completion
  );
end;
$$;

revoke all on function public.assign_study2_program() from public, anon, authenticated;
revoke all on function public.record_study2_trial(jsonb) from public, anon, authenticated;
revoke all on function public.submit_study2_session(jsonb) from public, anon, authenticated;

revoke all on table public.study2_programs from public, anon, authenticated;
revoke all on table public.study2_assignments from public, anon, authenticated;
revoke all on table public.study2_trials from public, anon, authenticated;
revoke all on table public.study2_sessions from public, anon, authenticated;

grant execute on function public.assign_study2_program() to service_role;
grant execute on function public.record_study2_trial(jsonb) to service_role;
grant execute on function public.submit_study2_session(jsonb) to service_role;

grant select, insert, update on table public.study2_programs to service_role;
grant select, insert, update, delete on table public.study2_assignments to service_role;
grant select, insert, update, delete on table public.study2_trials to service_role;
grant select, insert, update, delete on table public.study2_sessions to service_role;
