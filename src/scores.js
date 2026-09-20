// Leaderboard storage: a shared Supabase board with a local mirror underneath.
// The local copy is always written first, so the game keeps working offline and
// runs made without a connection are re-sent later.
const Scores = (function () {
  const cfg = typeof LEADERBOARD_CONFIG === "object" ? LEADERBOARD_CONFIG : { mode: "local" };
  const FINDS_TABLE = "flappy_lesha_finds";
  const LOCAL_KEY = "flappyLesha.board";
  const QUEUE_KEY = "flappyLesha.pending";
  const NAME_KEY = "flappyLesha.player";
  const MAX_NAME = 12;

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function cleanName(name) {
    return String(name || "").trim().slice(0, MAX_NAME);
  }

  // ------------------------------------------------------------------- local
  function localRows() {
    const rows = read(LOCAL_KEY, []);
    return Array.isArray(rows) ? rows : [];
  }

  function localAdd(player, score) {
    const rows = localRows();
    const key = player.toUpperCase();
    const found = rows.find((r) => String(r.player).toUpperCase() === key);
    if (found) {
      if (score > found.score) { found.score = score; found.created_at = new Date().toISOString(); }
    } else {
      rows.push({ player: player, score: score, created_at: new Date().toISOString() });
    }
    rows.sort((a, b) => b.score - a.score || String(a.created_at).localeCompare(String(b.created_at)));
    write(LOCAL_KEY, rows.slice(0, 100));
  }

  function localBest(player) {
    const key = cleanName(player).toUpperCase();
    const row = localRows().find((r) => String(r.player).toUpperCase() === key);
    return row ? row.score : 0;
  }

  // ---------------------------------------------------------------- supabase
  const online = cfg.mode === "supabase" && !!cfg.url && !!cfg.key;

  function request(path, options, attempt) {
    const opts = options || {};
    const tries = attempt || 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeout || 6000);
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
      return res;
    }, (err) => {
      clearTimeout(timer);
      if (tries < 2) return request(path, options, tries + 1);
      throw err;
    });
  }

  // ------------------------------------------------------------ pending runs
  function queueAdd(player, score) {
    const queue = read(QUEUE_KEY, []);
    queue.push({ player: player, score: score });
    write(QUEUE_KEY, queue.slice(-20));
  }

  function flushQueue() {
    if (!online) return Promise.resolve(false);
    const queue = read(QUEUE_KEY, []);
    if (!queue.length) return Promise.resolve(false);
    return request(cfg.table, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: queue.map((r) => ({ player: r.player, score: r.score })),
    }).then(() => { write(QUEUE_KEY, []); return true; })
      .catch(() => false);
  }

  // ------------------------------------------------------------------ public
  const state = { source: online ? "cloud" : "local", lastError: null };

  return {
    online: online,
    state: state,
    MAX_NAME: MAX_NAME,
    cleanName: cleanName,
    localBest: localBest,

    getName() {
      try { return cleanName(localStorage.getItem(NAME_KEY) || ""); } catch (e) { return ""; }
    },
    setName(name) {
      const clean = cleanName(name);
      try { localStorage.setItem(NAME_KEY, clean); } catch (e) { /* private mode */ }
      return clean;
    },

    // Store a finished run. Resolves once the shared board knows about it.
    submit(player, score) {
      const name = cleanName(player) || "ANON";
      const value = Math.max(0, Math.min(10000, Math.round(score)));
      localAdd(name, value);
      if (!online) return Promise.resolve({ stored: "local" });
      return flushQueue()
        .then(() => request(cfg.table, {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: { player: name, score: value },
        }))
        .then(() => { state.source = "cloud"; state.lastError = null; return { stored: "cloud" }; })
        .catch((err) => {
          state.source = "local";
          state.lastError = String(err && err.message ? err.message : err);
          queueAdd(name, value);
          return { stored: "queued" };
        });
    },

    // Top rows, best run per player. Falls back to the local mirror.
    top(limit) {
      const n = limit || cfg.limit || 25;
      if (!online) {
        return Promise.resolve({ rows: localRows().slice(0, n), source: "local" });
      }
      const query = cfg.view + "?select=player,score,created_at&order=score.desc,created_at.asc&limit=" + n;
      return request(query)
        .then((res) => res.json())
        .then((rows) => {
          state.source = "cloud";
          state.lastError = null;
          return { rows: rows, source: "cloud" };
        })
        .catch((err) => {
          state.source = "local";
          state.lastError = String(err && err.message ? err.message : err);
          return { rows: localRows().slice(0, n), source: "local" };
        });
    },

    // How many players are strictly better than this score, plus one.
    rank(score) {
      const value = Math.max(0, Math.round(score));
      if (!online) {
        const better = localRows().filter((r) => r.score > value).length;
        return Promise.resolve(better + 1);
      }
      return request(cfg.view + "?select=player&score=gt." + value, {
        headers: { Prefer: "count=exact", Range: "0-0" },
      }).then((res) => {
        const range = res.headers.get("content-range") || "";
        const total = Number(range.split("/")[1]);
        return (isFinite(total) ? total : 0) + 1;
      }).catch(() => {
        const better = localRows().filter((r) => r.score > value).length;
        return better + 1;
      });
    },

    // ------------------------------------------------- collection of photos
    // Which checkpoint photos this player has found, according to the cloud.
    finds(player) {
      const name = cleanName(player);
      if (!online || !name) return Promise.resolve([]);
      const query = FINDS_TABLE + "?select=photo&player_key=eq." + encodeURIComponent(name.toUpperCase());
      return request(query)
        .then((res) => res.json())
        .then((rows) => rows.map((r) => r.photo))
        .catch(() => []);
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

    retryPending: flushQueue,
  };
})();
