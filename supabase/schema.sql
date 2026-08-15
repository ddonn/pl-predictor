-- PL Predictor — full schema, run once in the Supabase SQL editor.
-- Safe to re-run: drops and recreates functions/policies, but NOT tables (guarded by IF NOT EXISTS).

-- =========================================================
-- REMOVED FEATURES
-- Pre-Season Picks and the gameweek opt-in requirement were removed;
-- drop their tables/functions so re-running this file on an existing
-- database cleans them up too. Every registered user now automatically
-- competes in every gameweek.
-- =========================================================

drop table if exists public.tournament_predictions cascade;
drop table if exists public.tournament_results cascade;
drop function if exists public.preseason_locked();
drop table if exists public.gameweek_entries cascade;
drop function if exists public.opted_in(int) cascade;

-- =========================================================
-- TABLES
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id bigint generated always as identity primary key,
  home text not null,
  away text not null,
  kickoff timestamptz not null,
  gameweek int not null,
  stadium text
);

create index if not exists matches_gameweek_idx on public.matches (gameweek);

create table if not exists public.results (
  match_id bigint primary key references public.matches(id) on delete cascade,
  home_score int not null,
  away_score int not null,
  entered_at timestamptz not null default now()
);

create table if not exists public.predictions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id bigint not null references public.matches(id) on delete cascade,
  home_score int not null check (home_score >= 0),
  away_score int not null check (away_score >= 0),
  -- Per-match cap (max 50). The aggregate weekly cap (100, across all of a
  -- user's matches in a gameweek) is enforced by the
  -- enforce_weekly_stake_budget() trigger below, since a plain check
  -- constraint can't see other rows.
  stake int not null check (stake in (10, 20, 30, 40, 50)),
  gameweek int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists predictions_gameweek_idx on public.predictions (gameweek);
create index if not exists predictions_match_idx on public.predictions (match_id);

create table if not exists public.points_adjustments (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id bigint references public.matches(id) on delete set null,
  points int not null,
  note text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- NEW-USER TRIGGER
-- Reads username / is_admin out of the signUp() metadata payload
-- and creates the profile row automatically — works regardless of
-- whether email confirmation is required.
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- HELPER FUNCTIONS (security definer — safe to use inside RLS
-- policies without causing recursive-policy errors)
-- =========================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- A gameweek locks 1 hour before the earliest kickoff in it.
create or replace function public.gameweek_locked(gw int)
returns boolean
language sql
stable
set search_path = public
as $$
  select now() >= ((select min(kickoff) from public.matches where gameweek = gw) - interval '1 hour');
$$;

-- =========================================================
-- WEEKLY STAKE BUDGET
-- A user may stake at most 100 points total across all matches in a single
-- gameweek (spread across as many fixtures as they like); each individual
-- match is still capped at 50 by the `predictions.stake` check constraint.
-- A plain check constraint can't see other rows, so this is enforced with
-- a trigger that sums the user's other stakes for the gameweek.
-- =========================================================

create or replace function public.enforce_weekly_stake_budget()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  other_total int;
begin
  select coalesce(sum(stake), 0) into other_total
  from public.predictions
  where user_id = new.user_id
    and gameweek = new.gameweek
    and id is distinct from new.id;

  if other_total + new.stake > 100 then
    raise exception 'Weekly stake budget exceeded: % already staked + % > 100', other_total, new.stake;
  end if;

  return new;
end;
$$;

drop trigger if exists predictions_weekly_budget on public.predictions;
create trigger predictions_weekly_budget
  before insert or update on public.predictions
  for each row execute procedure public.enforce_weekly_stake_budget();

-- =========================================================
-- LEADERBOARD RPC
-- Overall (gw is null) = match points (+/-) across every gameweek, plus
-- manual adjustments. Weekly (gw given) = just that gameweek's match
-- points, ranging -100..100 since that's the weekly stake budget — this
-- is what decides that week's prize. Computed live on every call, so
-- entering a result immediately updates it.
--
-- get_leaderboard() used to take no arguments; a default parameter
-- creates a new overload rather than replacing that zero-arg signature,
-- which would otherwise make bare calls ambiguous, so drop it explicitly.
-- =========================================================

drop function if exists public.get_leaderboard();

create or replace function public.get_leaderboard(gw int default null)
returns table (user_id uuid, username text, total_points numeric)
language sql
stable
security definer
set search_path = public
as $$
  with match_pts as (
    select
      pr.user_id,
      pr.gameweek,
      case
        when pr.home_score = r.home_score and pr.away_score = r.away_score then pr.stake
        when sign(pr.home_score - pr.away_score) = sign(r.home_score - r.away_score) then pr.stake / 2.0
        else -pr.stake
      end as pts
    from public.predictions pr
    join public.results r on r.match_id = pr.match_id
  )
  select
    p.id as user_id,
    p.username,
    case
      when gw is null then coalesce(mp.pts, 0) + coalesce(ap.pts, 0)
      else coalesce(wp.pts, 0)
    end as total_points
  from public.profiles p
  left join (
    select user_id, sum(pts) as pts from match_pts group by user_id
  ) mp on mp.user_id = p.id
  left join (
    select user_id, sum(points) as pts from public.points_adjustments group by user_id
  ) ap on ap.user_id = p.id
  left join (
    select user_id, sum(pts) as pts from match_pts where gameweek = gw group by user_id
  ) wp on wp.user_id = p.id
  order by total_points desc nulls last, p.username asc;
$$;

grant execute on function public.get_leaderboard(int) to authenticated;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.results enable row level security;
alter table public.predictions enable row level security;
alter table public.points_adjustments enable row level security;

-- profiles: anyone signed in can read usernames (needed for leaderboard /
-- shared picks); a user can edit their own row, admins can edit anyone's.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin());

-- matches: readable by everyone signed in, writable only by admins.
drop policy if exists "matches_select" on public.matches;
create policy "matches_select" on public.matches
  for select to authenticated using (true);

drop policy if exists "matches_write" on public.matches;
create policy "matches_write" on public.matches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- results: readable by everyone signed in, writable only by admins.
drop policy if exists "results_select" on public.results;
create policy "results_select" on public.results
  for select to authenticated using (true);

drop policy if exists "results_write" on public.results;
create policy "results_write" on public.results
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- predictions: you can always see + edit your own (while unlocked); anyone
-- can see everyone's once that gameweek locks.
--
-- NOTE: `gameweek` is a column on the row itself (denormalized for query
-- convenience), but it must never be trusted as-is for lock checks — a
-- client could otherwise submit match_id=<a locked match> with a fake,
-- still-open gameweek number to bypass the lockout. match_gameweek()
-- looks up the real gameweek from matches via match_id so inserts/updates
-- are validated against the truth, not the client's claim.
create or replace function public.match_gameweek(mid bigint)
returns int
language sql
stable
set search_path = public
as $$
  select gameweek from public.matches where id = mid;
$$;

drop policy if exists "predictions_select" on public.predictions;
create policy "predictions_select" on public.predictions
  for select to authenticated
  using (user_id = auth.uid() or public.gameweek_locked(gameweek) or public.is_admin());

drop policy if exists "predictions_insert" on public.predictions;
create policy "predictions_insert" on public.predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and gameweek = public.match_gameweek(match_id)
    and not public.gameweek_locked(public.match_gameweek(match_id))
  );

drop policy if exists "predictions_update" on public.predictions;
create policy "predictions_update" on public.predictions
  for update to authenticated
  using (user_id = auth.uid() and not public.gameweek_locked(public.match_gameweek(match_id)))
  with check (
    user_id = auth.uid()
    and gameweek = public.match_gameweek(match_id)
    and not public.gameweek_locked(public.match_gameweek(match_id))
  );

-- A user can drop their own pick for a match (to free up weekly budget for
-- another fixture) while that gameweek is still open.
drop policy if exists "predictions_delete" on public.predictions;
create policy "predictions_delete" on public.predictions
  for delete to authenticated
  using (user_id = auth.uid() and not public.gameweek_locked(public.match_gameweek(match_id)));

-- points_adjustments: a user can see their own adjustments, admins see + manage all.
drop policy if exists "points_adjustments_select" on public.points_adjustments;
create policy "points_adjustments_select" on public.points_adjustments
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "points_adjustments_write" on public.points_adjustments;
create policy "points_adjustments_write" on public.points_adjustments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
