// Leaderboard storage. Scores, ranks and finds live on the server only - a run
// counts once the server has it. The one thing kept in this browser is the
// player's name, so nobody has to type it again on every visit.
const Scores = (function () {
  const cfg = typeof LEADERBOARD_CONFIG === "object" ? LEADERBOARD_CONFIG : { mode: "local" };
  const SCORES_TABLE = cfg.table || "flappy_lesha_scores";
  const BOARD_VIEW = cfg.view || "flappy_lesha_leaderboard";
  const FINDS_TABLE = "flappy_lesha_finds";
  const NAME_KEY = "flappyLesha.player";
  const MAX_NAME = 12;

  const online = cfg.mode === "supabase" && !!cfg.url && !!cfg.key;
  const state = { source: online ? "cloud" : "off", lastError: null };

  function cleanName(name) {
    return String(name || "").trim().slice(0, MAX_NAME);
  }

  function request(path, options, attempt) {
    const opts = options || {};
    const tries = attempt || 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeout || 9000);
    return fetch(cfg.url + "/rest/v1/" + path, {
      method: opts.method || "GET",
      headers: Object.assign({
        apikey: cfg.key,
        Authorization: "Bearer " + cfg.key,
        "Content-Type": "application/json",
      }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    }).then((res) => {
      clearTimeout(timer);
      if (!res.ok) throw new Error("http " + res.status);
      state.lastError = null;
      return res;
    }, (err) => {
      clearTimeout(timer);
      // mobile networks drop the first request often enough to be worth a retry
      if (tries < 2) return request(path, options, tries + 1);
      state.lastError = String(err && err.message ? err.message : err);
      throw err;
    });
  }

  return {
    online: online,
    state: state,
    MAX_NAME: MAX_NAME,
    cleanName: cleanName,

    // The player's name is the only thing this browser remembers.
    getName() {
      try { return cleanName(localStorage.getItem(NAME_KEY) || ""); } catch (e) { return ""; }
    },
    setName(name) {
      const clean = cleanName(name);
      try { localStorage.setItem(NAME_KEY, clean); } catch (e) { /* private mode */ }
      return clean;
    },

    // Store a finished run. Resolves with whether the server took it.
    submit(player, score) {
      const name = cleanName(player);
      const value = Math.max(0, Math.min(10000, Math.round(score)));
      if (!online || !name) return Promise.resolve(false);
      return request(SCORES_TABLE, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: { player: name, score: value },
      }).then(() => true).catch(() => false);
    },

    // The player's own best, straight from the server. null means the server
    // could not be reached - that is different from an honest zero.
    best(player) {
      const name = cleanName(player);
      if (!online || !name) return Promise.resolve(0);
      const query = SCORES_TABLE + "?select=score&player=ilike." +
        encodeURIComponent(name) + "&order=score.desc&limit=1";
      return request(query)
        .then((res) => res.json())
        .then((rows) => (rows.length ? rows[0].score : 0))
        .catch(() => null);
    },

    // Top rows, best run per player.
    top(limit) {
      const n = limit || cfg.limit || 25;
      if (!online) return Promise.resolve({ rows: [], source: "off" });
      const query = BOARD_VIEW + "?select=player,score,created_at&order=score.desc,created_at.asc&limit=" + n;
      return request(query)
        .then((res) => res.json())
        .then((rows) => ({ rows: rows, source: "cloud" }))
        .catch(() => ({ rows: [], source: "offline" }));
    },

    // How many players are strictly better than this score, plus one.
    rank(score) {
      const value = Math.max(0, Math.round(score));
      if (!online) return Promise.resolve(null);
      return request(BOARD_VIEW + "?select=player&score=gt." + value, {
        headers: { Prefer: "count=exact", Range: "0-0" },
      }).then((res) => {
        const range = res.headers.get("content-range") || "";
        const total = Number(range.split("/")[1]);
        return (isFinite(total) ? total : 0) + 1;
      }).catch(() => null);
    },

    // ------------------------------------------------- collection of photos
    finds(player) {
      const name = cleanName(player);
      if (!online || !name) return Promise.resolve([]);
      const query = FINDS_TABLE + "?select=photo&player_key=eq." + encodeURIComponent(name.toUpperCase());
      return request(query)
        .then((res) => res.json())
        .then((rows) => rows.map((r) => r.photo))
        .catch(() => null);          // null means "could not ask", not "none"
    },

    // Record a find. Repeats are ignored by the unique index on the table.
    addFind(player, photo) {
      const name = cleanName(player);
      if (!online || !name || !photo) return Promise.resolve(false);
      return request(FINDS_TABLE, {
        method: "POST",
        headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
        body: { player: name, photo: String(photo).slice(0, 16) },
      }).then(() => true).catch(() => false);
    },
  };
})();
