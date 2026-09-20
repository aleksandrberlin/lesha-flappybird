// Headless smoke test: loads the game, lets an autopilot play it and checks
// that scoring, the cola bottles, Katy and the game-over flow all work.
//
//   npm i playwright && python3 -m http.server 8777 &
//   node tools/smoke-test.js [http://127.0.0.1:8777/index.html]
const { chromium } = require("playwright");

const URL = process.argv[2] || "http://127.0.0.1:8777/index.html";
const CHROME = process.env.CHROME_PATH || undefined;
// Sandboxes that intercept TLS (corporate proxies, CI mitm) need this.
const INSECURE = !!process.env.SMOKE_INSECURE;

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const context = await browser.newContext({
    viewport: { width: 620, height: 880 },
    ignoreHTTPSErrors: INSECURE,
  });
  const page = await context.newPage();
  const errors = [];
  const netIssues = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // The game is built to survive a dead network, so a failed request is a
    // note about the environment rather than a broken game.
    if (/Failed to load resource|net::/.test(m.text())) netIssues.push(m.text());
    else errors.push("console: " + m.text());
  });

  await page.goto(URL);
  // the photos are preloaded first, then the game asks who is playing
  await page.waitForFunction(
    () => window.FlappyLesha && window.FlappyLesha.game.state !== window.FlappyLesha.STATE.LOADING,
    null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const dialogVisible = await page.isVisible("#dialog:not(.hidden)");
  if (dialogVisible) {
    await page.fill("#nameInput", "БОТ");
    await page.click(".btn--go");
    await page.waitForTimeout(300);
  }

  await page.evaluate(() => {
    const F = window.FlappyLesha;
    const L = F.layout;
    window.__stats = {
      maxScore: 0, katySpawned: 0, livesTaken: 0, maxLives: 1,
      enemyKinds: {}, deaths: 0, overSeen: 0, checkpoints: 0, newFinds: 0,
    };
    let wasOver = false;
    let wasCheckpoint = false;
    let bonusCount = 0;
    let lives = 1;

    F.press();
    (function tick() {
      const g = F.game;
      const h = F.hero;
      const st = window.__stats;
      st.maxScore = Math.max(st.maxScore, g.score);
      st.maxLives = Math.max(st.maxLives, g.lives);

      const bonuses = F.bonuses();
      if (bonuses.length > bonusCount) st.katySpawned += bonuses.length - bonusCount;
      bonusCount = bonuses.length;
      if (g.state === F.STATE.PLAY && g.lives > lives) st.livesTaken++;
      lives = g.lives;
      for (const e of F.enemies()) st.enemyKinds[e.kind] = (st.enemyKinds[e.kind] || 0) + 1;

      if (g.state === F.STATE.CHECKPOINT) {
        if (!wasCheckpoint) {
          st.checkpoints++;
          if (g.checkpointNew) st.newFinds++;
          wasCheckpoint = true;
        }
        F.press();                                  // ignored until it is dismissable
      } else if (g.state === F.STATE.OVER) {
        wasCheckpoint = false;
        if (!wasOver) { st.deaths++; st.overSeen++; wasOver = true; }
        F.press();
      } else {
        wasCheckpoint = false;
        wasOver = false;
        if (g.state === F.STATE.TITLE) F.press();
        else if (g.state === F.STATE.PLAY) {
          const next = F.obstacles()
            .filter((o) => o.x + L.COLA_W > L.HERO_X)
            .sort((a, b) => a.x - b.x)[0];
          let target = next ? next.gapTop + next.gap / 2 - L.HERO_SIZE / 2 : L.H * 0.42;
          // go for Katy, but only when no bottle is in the way right now
          const katy = bonuses[0];
          const bottleNear = next && next.x < L.HERO_X + 150;
          if (katy && katy.x < L.HERO_X + 150 && katy.x > L.HERO_X - 40 &&
              (!bottleNear || Math.abs(katy.y - target) < 70)) {
            target = katy.y;
          }
          for (const e of F.enemies()) {
            if (e.x < L.HERO_X + 110 && e.x + e.def.w > L.HERO_X - 40) {
              target = e.y > L.H / 2 ? Math.max(70, e.y - 70) : Math.min(L.GROUND_Y - 110, e.y + 70);
            }
          }
          if (h.y + h.vy * 3 > target) F.press();
        }
      }
      requestAnimationFrame(tick);
    })();
  });

  await page.waitForTimeout(60000);
  const stats = await page.evaluate(() => window.__stats);
  await page.evaluate(() => window.FlappyLesha.loadBoard(true));
  await page.waitForFunction(() => !window.FlappyLesha.game.board.loading, null, { timeout: 15000 })
    .catch(() => {});

  const board = await page.evaluate(() => ({
    rows: window.FlappyLesha.game.board.rows.length,
    source: window.FlappyLesha.game.board.source,
    player: window.FlappyLesha.game.player,
    photos: Object.keys(CHECKPOINT_IMAGES).length,
    frames: Object.values(CHECKPOINT_IMAGES).reduce((n, f) => n + f.length, 0),
    collected: window.FlappyLesha.collection().count(),
    assets: window.FlappyLesha.loading(),
  })).catch(() => ({ rows: 0, source: "?", player: "", photos: 0, frames: 0 }));

  const checks = [
    ["no runtime errors", errors.length === 0, errors.join(" | ")],
    ["player name stored", !!board.player, "name " + board.player],
    ["leaderboard loads", board.rows > 0, board.source + ", rows " + board.rows],
    ["scored points", stats.maxScore >= 3, "max score " + stats.maxScore],
    ["katy shows up", stats.katySpawned >= 1, "spawned " + stats.katySpawned],
    ["extra life can be collected", stats.livesTaken >= 1,
      "taken " + stats.livesTaken + ", max lives " + stats.maxLives],
    ["flying enemies appear", Object.keys(stats.enemyKinds).length >= 1,
      Object.keys(stats.enemyKinds).join(",") || "none"],
    ["game over works", stats.overSeen >= 1, "deaths " + stats.deaths],
    ["лёши bundled", board.photos >= 1, board.photos + " лёш(и), " + board.frames + " frame(s)"],
    ["assets preloaded before play", board.assets && board.assets.done === board.assets.total,
      board.assets ? board.assets.done + "/" + board.assets.total : "?"],
    ["checkpoint screen shows up", stats.maxScore < 10 || stats.checkpoints >= 1,
      "seen " + stats.checkpoints + " at best score " + stats.maxScore],
    ["collection picks up finds", stats.checkpoints === 0 || stats.newFinds >= 1,
      "new finds " + stats.newFinds + " of " + stats.checkpoints + " checkpoint(s)"],
  ];
  let failed = 0;
  for (const [name, ok, info] of checks) {
    console.log((ok ? "PASS " : "FAIL ") + name + (info ? "  (" + info + ")" : ""));
    if (!ok) failed++;
  }
  if (netIssues.length) {
    console.log("note: " + netIssues.length + " request(s) failed, game fell back to the local board");
  }
  console.log(JSON.stringify(stats));
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
