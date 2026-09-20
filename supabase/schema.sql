-- Leaderboard used by the game. Already applied to the project referenced in
-- src/config.js; kept here so the board can be recreated anywhere.
--
-- Anonymous visitors may read the board and append their own runs. They can
-- never update or delete a row, and the checks keep the data sane.

create table if not exists public.flappy_lesha_scores (
  id uuid primary key default gen_random_uuid(),
  player text not null,
  score integer not null,
  created_at timestamptz not null default now(),
  constraint flappy_lesha_scores_player_len
    check (char_length(btrim(player)) between 1 and 12),
  constraint flappy_lesha_scores_score_range
    check (score >= 0 and score <= 10000)
);

create index if not exists flappy_lesha_scores_score_idx
  on public.flappy_lesha_scores (score desc, created_at asc);

alter table public.flappy_lesha_scores enable row level security;

drop policy if exists flappy_lesha_scores_read on public.flappy_lesha_scores;
create policy flappy_lesha_scores_read
  on public.flappy_lesha_scores
  for select
  to anon, authenticated
  using (true);

drop policy if exists flappy_lesha_scores_append on public.flappy_lesha_scores;
create policy flappy_lesha_scores_append
  on public.flappy_lesha_scores
  for insert
  to anon, authenticated
  with check (
    score between 0 and 10000
    and char_length(btrim(player)) between 1 and 12
  );

-- One row per player: their best run.
create or replace view public.flappy_lesha_leaderboard
with (security_invoker = on) as
select distinct on (upper(btrim(player)))
       btrim(player) as player,
       score,
       created_at
from public.flappy_lesha_scores
order by upper(btrim(player)), score desc, created_at asc;

grant select on public.flappy_lesha_leaderboard to anon, authenticated;
