-- Migration: Quiz submissions storage and retrieval
create table if not exists public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete restrict,
  group_number integer not null check (group_number between 1 and 4),
  score integer not null check (score between 0 and 100),
  total_questions integer not null check (total_questions > 0),
  correct_count integer not null check (correct_count >= 0),
  wrong_count integer not null check (wrong_count >= 0),
  time_spent_seconds integer not null check (time_spent_seconds >= 0),
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (event_id, participant_id)
);

create index if not exists idx_quiz_submissions_event on public.quiz_submissions(event_id);
create index if not exists idx_quiz_submissions_group on public.quiz_submissions(event_id, group_number);
create index if not exists idx_quiz_submissions_score on public.quiz_submissions(event_id, score desc);

alter table public.quiz_submissions enable row level security;
revoke all on public.quiz_submissions from public, anon, authenticated;
grant all on public.quiz_submissions to service_role;

-- RPC: Record a validated quiz submission
create or replace function public.submit_quiz_submission(
  p_event_slug text,
  p_participant_id uuid,
  p_group_number integer,
  p_score integer,
  p_total_questions integer,
  p_correct_count integer,
  p_wrong_count integer,
  p_time_spent_seconds integer,
  p_answers jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_submission public.quiz_submissions%rowtype;
begin
  select id into v_event_id from public.events where slug = p_event_slug;
  if not found then
    raise exception using errcode = 'P1009', message = 'EVENT_NOT_FOUND';
  end if;

  -- Ensure participant belongs to this event
  if not exists (select 1 from public.participants where id = p_participant_id and event_id = v_event_id) then
    raise exception using errcode = 'P1001', message = 'PARTICIPANT_NOT_FOUND';
  end if;

  -- Check if already submitted (one-time submission rule)
  if exists (select 1 from public.quiz_submissions where event_id = v_event_id and participant_id = p_participant_id) then
    raise exception using errcode = 'P1003', message = 'ALREADY_SUBMITTED';
  end if;

  insert into public.quiz_submissions (
    event_id, participant_id, group_number, score, total_questions,
    correct_count, wrong_count, time_spent_seconds, answers, completed_at
  ) values (
    v_event_id, p_participant_id, p_group_number, p_score, p_total_questions,
    p_correct_count, p_wrong_count, p_time_spent_seconds, p_answers, now()
  ) returning * into v_submission;

  return jsonb_build_object(
    'id', v_submission.id,
    'score', v_submission.score,
    'totalQuestions', v_submission.total_questions,
    'correctCount', v_submission.correct_count,
    'wrongCount', v_submission.wrong_count,
    'timeSpentSeconds', v_submission.time_spent_seconds,
    'completedAt', v_submission.completed_at
  );
end $$;

-- RPC: Retrieve all quiz submissions for admin monitoring
create or replace function public.get_quiz_submissions_list(p_event_slug text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with e as (select id from public.events where slug = p_event_slug),
  s as (
    select
      qs.id,
      qs.participant_id as "participantId",
      p.participant_code as "participantCode",
      p.full_name as "participantName",
      qs.group_number as "groupNumber",
      qs.score,
      qs.total_questions as "totalQuestions",
      qs.correct_count as "correctCount",
      qs.wrong_count as "wrongCount",
      qs.time_spent_seconds as "timeSpentSeconds",
      qs.completed_at as "completedAt",
      qs.created_at as "createdAt"
    from public.quiz_submissions qs
    join public.participants p on p.id = qs.participant_id
    join e on e.id = qs.event_id
    order by qs.score desc, qs.time_spent_seconds asc, qs.completed_at asc
  )
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from s;
$$;

