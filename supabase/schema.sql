-- PL Predictor — full schema, run once in the Supabase SQL editor.
-- Safe to re-run: drops and recreates functions/policies, but NOT tables (guarded by IF NOT EXISTS).

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
  stake int not null check (stake in (10, 20, 30, 40, 50)),
  gameweek int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists predictions_gameweek_idx on public.predictions (gameweek);
create index if not exists predictions_match_idx on public.predictions (match_id);

create table if not exists public.tournament_predictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pl_winner text,
  bottom_team text,
  top_scorer text,
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_results (
  id int primary key default 1 check (id = 1),
  pl_winner text,
  bottom_team text,
  top_scorer text,
  top_scorer_goals int,
  updated_at timestamptz not null default now()
);

create table if not exists public.points_adjustments (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id bigint references public.matches(id) on delete set null,
  points int not null,
  note text,
  created_at timestamptz not null default now()
);

-- A user's opt-in declaration ("I am playing this Gameweek") for a given
-- gameweek. Presence of a row = opted in. Users not opted in to a
-- gameweek are excluded from that gameweek's results view and leaderboard
-- contribution (see get_leaderboard() and the app's ResultsTab).
create table if not exists public.gameweek_entries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  gameweek int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, gameweek)
);

create index if not exists gameweek_entries_gameweek_idx on public.gameweek_entries (gameweek);

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

-- Pre-season picks lock 1 hour before the very first match of the season.
create or replace function public.preseason_locked()
returns boolean
language sql
stable
set search_path = public
as $$
  select now() >= ((select min(kickoff) from public.matches) - interval '1 hour');
$$;

-- =========================================================
-- LEADERBOARD RPC
-- Running total = match points (+/-) + pre-season bonus + manual adjustments.
-- Computed live on every call, so entering a result immediately updates it.
-- =========================================================

create or replace function public.get_leaderboard()
returns table (user_id uuid, username text, total_points numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.username,
    (coalesce(mp.pts, 0) + coalesce(pp.pts, 0) + coalesce(ap.pts, 0)) as total_points
  from public.profiles p
  left join (
    select
      pr.user_id,
      sum(
        case
          when pr.home_score = r.home_score and pr.away_score = r.away_score then pr.stake
          when sign(pr.home_score - pr.away_score) = sign(r.home_score - r.away_score) then pr.stake / 2.0
          else -pr.stake
        end
      ) as pts
    from public.predictions pr
    join public.results r on r.match_id = pr.match_id
    join public.gameweek_entries ge on ge.user_id = pr.user_id and ge.gameweek = pr.gameweek
    group by pr.user_id
  ) mp on mp.user_id = p.id
  left join (
    select
      tp.user_id,
      (
        coalesce(case when tr.pl_winner is not null and tp.pl_winner = tr.pl_winner then 50 else 0 end, 0)
        + coalesce(case when tr.bottom_team is not null and tp.bottom_team = tr.bottom_team then 50 else 0 end, 0)
        + coalesce(case when tr.top_scorer is not null and tp.top_scorer = tr.top_scorer then 50 + coalesce(tr.top_scorer_goals, 0) else 0 end, 0)
      ) as pts
    from public.tournament_predictions tp
    left join public.tournament_results tr on tr.id = 1
  ) pp on pp.user_id = p.id
  left join (
    select user_id, sum(points) as pts from public.points_adjustments group by user_id
  ) ap on ap.user_id = p.id
  order by total_points desc nulls last, p.username asc;
$$;

grant execute on function public.get_leaderboard() to authenticated;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.results enable row level security;
alter table public.predictions enable row level security;
alter table public.tournament_predictions enable row level security;
alter table public.tournament_results enable row level security;
alter table public.points_adjustments enable row level security;
alter table public.gameweek_entries enable row level security;

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

-- tournament_predictions: same shape, locked by kickoff of the season.
drop policy if exists "tournament_predictions_select" on public.tournament_predictions;
create policy "tournament_predictions_select" on public.tournament_predictions
  for select to authenticated
  using (user_id = auth.uid() or public.preseason_locked() or public.is_admin());

drop policy if exists "tournament_predictions_insert" on public.tournament_predictions;
create policy "tournament_predictions_insert" on public.tournament_predictions
  for insert to authenticated
  with check (user_id = auth.uid() and not public.preseason_locked());

drop policy if exists "tournament_predictions_update" on public.tournament_predictions;
create policy "tournament_predictions_update" on public.tournament_predictions
  for update to authenticated
  using (user_id = auth.uid() and not public.preseason_locked());

-- tournament_results: readable by everyone signed in, writable only by admins.
drop policy if exists "tournament_results_select" on public.tournament_results;
create policy "tournament_results_select" on public.tournament_results
  for select to authenticated using (true);

drop policy if exists "tournament_results_write" on public.tournament_results;
create policy "tournament_results_write" on public.tournament_results
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- points_adjustments: a user can see their own adjustments, admins see + manage all.
drop policy if exists "points_adjustments_select" on public.points_adjustments;
create policy "points_adjustments_select" on public.points_adjustments
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "points_adjustments_write" on public.points_adjustments;
create policy "points_adjustments_write" on public.points_adjustments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- gameweek_entries: everyone signed in can read entries (needed so
-- Previous Results / the leaderboard RPC can exclude non-opted-in users,
-- and so admins can see opt-in counts); a user manages their own opt-in
-- while that gameweek is still open, admins can manage anyone's.
drop policy if exists "gameweek_entries_select" on public.gameweek_entries;
create policy "gameweek_entries_select" on public.gameweek_entries
  for select to authenticated using (true);

drop policy if exists "gameweek_entries_insert" on public.gameweek_entries;
create policy "gameweek_entries_insert" on public.gameweek_entries
  for insert to authenticated
  with check ((user_id = auth.uid() and not public.gameweek_locked(gameweek)) or public.is_admin());

drop policy if exists "gameweek_entries_delete" on public.gameweek_entries;
create policy "gameweek_entries_delete" on public.gameweek_entries
  for delete to authenticated
  using ((user_id = auth.uid() and not public.gameweek_locked(gameweek)) or public.is_admin());
