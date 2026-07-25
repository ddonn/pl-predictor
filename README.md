# PL Predictor

A mobile-first Premier League 2026/27 prediction competition. Next.js (App Router) +
Supabase (Postgres + Auth), deployed on Vercel. All UI lives in `app/page.js`.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the SQL Editor, paste the entire contents of `supabase/schema.sql` and run it.
   This creates every table, the `handle_new_user` trigger, the `get_leaderboard()`
   RPC, and all Row Level Security policies.
3. In **Project Settings → API**, copy:
   - Project URL
   - `anon` public key
   - `service_role` key (keep this secret — server-side only)
4. (Optional) In **Authentication → Providers → Email**, you can turn off "Confirm
   email" for faster onboarding during testing. The app works either way — if
   confirmation is on, new users see a "check your email" message after registering.

## 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the three values from step 1:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` is only used server-side, by `app/api/admin/delete-user`
(so admins can fully delete a user's auth account), and by the seed script. It is
never sent to the browser.

## 3. Install and run locally

```
npm install
npm run dev
```

Open http://localhost:3000. Register with invite code `PL2026` for a normal player,
or `ADMIN2026` for an admin account. Both codes are hardcoded in `lib/constants.js` —
change them there if you want different ones.

## 4. Seed the 380 fixtures

Once the schema is applied and `.env.local` is set:

```
npm run seed
```

This inserts all 380 Premier League 2026/27 fixtures (`seed/fixtures-2026-27.json`)
with their kickoff times and home stadiums. Re-run with `npm run seed -- --reset` to
wipe existing matches/results/predictions and reseed from scratch.

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the same three environment variables from step 2 in the Vercel project settings
   (Production, Preview and Development).
4. Deploy.

## How scoring works

- **Match predictions**: pick a scoreline and a stake (10/20/30/40/50). Exact score =
  full stake, correct result only = half stake, wrong = stake deducted. Locks 1 hour
  before the first match of that gameweek.
- **Pre-season picks**: PL Winner, Bottom Team, Top Scorer — lock 1 hour before
  Gameweek 1's first kickoff. Auto-scored: 50pts for an exact match on any of the
  three (Top Scorer also gets +1pt per goal they actually scored, via
  `tournament_results.top_scorer_goals`).
- **Manual adjustments**: the schema's `tournament_results` table only stores the
  single actual winner/bottom-team/top-scorer (as specified), not the full final
  table. So the "20pts for top-4" and "20pts for relegated-but-not-last" near-miss
  bonuses, and the per-goal bonus for a top-scorer pick who *wasn't* the actual top
  scorer, aren't things the database can compute automatically — the admin enters
  those by hand from the **Adjust Points** tab once the final table is known. This is
  called out in the in-app Rules tab too.
- **Leaderboard**: `get_leaderboard()` is a Postgres RPC that sums match points +
  pre-season points + manual adjustments live, every time it's called — so entering a
  result or adjustment updates it immediately, no caching step required.

## Project structure

```
app/
  layout.js                       root layout, viewport/theme-color
  globals.css                     reset + responsive nav breakpoint
  page.js                         the entire UI (auth, tabs, admin panel)
  api/admin/delete-user/route.js  server route using the service role key
lib/
  supabaseClient.js                browser Supabase client
  constants.js                     invite codes, stake options, team list
supabase/
  schema.sql                       tables, RLS, triggers, leaderboard RPC
scripts/
  seed.js                          one-off fixture loader
seed/
  fixtures-2026-27.json            all 380 fixtures with kickoff times
```
