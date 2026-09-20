// Leaderboard backend.
//
// mode "supabase" - shared board for everyone, through the Supabase REST API.
//   The publishable key is meant to live in client code: row level security on
//   the table only allows reading the board and appending a run, never editing
//   or deleting one.
// mode "local" - no network, the board lives in this browser only.
const LEADERBOARD_CONFIG = {
  mode: "supabase",
  url: "https://dnemnzxewwjlnahycihg.supabase.co",
  key: "sb_publishable_zX19o6TLHwrDH4wjdcxvWQ_ZhlJz3zL",
  table: "flappy_lesha_scores",
  view: "flappy_lesha_leaderboard",
  limit: 25,
  timeout: 9000,
};
