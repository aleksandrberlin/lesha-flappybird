// Headless smoke test: loads the game, lets an autopilot play it and checks
// that scoring, the cola bottles, Katy and the game-over flow all work.
//
//   npm i playwright && python3 -m http.server 8777 &
//   node tools/smoke-test.js [http://127.0.0.1:8777/index.html]
const { chromium } = require("playwright");

const URL = process.argv[2] || "http://127.0.0.1:8777/index.html";
const CHROME = process.env.CHROME_PATH || undefined;

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 620, height: 880 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const F = window.FlappyLesha;
    const L = F.layout;
    window.__stats = { maxScore: 0, katySpawned: 0, katyDodged: 0, deaths: 0, overSeen: 0 };
    let wasOver = false;
    let katyCount = 0;

    F.press();
    (function tick() {
      const g = F.game;
      const h = F.hero;
      const st = window.__stats;
      st.maxScore = Math.max(st.maxScore, g.score);

      const ks = F.katies();
      if (ks.length > katyCount) st.katySpawned += ks.length - katyCount;
      katyCount = ks.length;
      st.katyDodged += ks.filter((k) => k.scored && !k.counted && (k.counted = true)).length;

      if (g.state === F.STATE.OVER) {
        if (!wasOver) { st.deaths++; st.overSeen++; wasOver = true; }
        F.press();
      } else {
        wasOver = false;
        if (g.state === F.STATE.TITLE) F.press();
        else if (g.state === F.STATE.PLAY) {
          const next = F.obstacles()
            .filter((o) => o.x + L.COLA_W > L.HERO_X)
            .sort((a, b) => a.x - b.x)[0];
          let target = next ? next.gapTop + next.gap / 2 - L.HERO_SIZE / 2 : L.H * 0.42;
          for (const k of ks) {
            if (k.x < L.HERO_X + 120 && k.x + 32 > L.HERO_X - 40) {
              target = k.y > L.H / 2 ? Math.max(80, k.y - 76) : Math.min(L.GROUND_Y - 110, k.y + 76);
            }
          }
          if (h.y + h.vy * 3 > target) F.press();
        }
      }
      requestAnimationFrame(tick);
    })();
  });

  await page.waitForTimeout(45000);
  const stats = await page.evaluate(() => window.__stats);
  await browser.close();

  const checks = [
    ["no runtime errors", errors.length === 0, errors.join(" | ")],
    ["scored points", stats.maxScore >= 3, "max score " + stats.maxScore],
    ["katy appears", stats.katySpawned >= 1, "spawned " + stats.katySpawned],
    ["katy can be dodged", stats.katyDodged >= 1, "dodged " + stats.katyDodged],
    ["game over works", stats.overSeen >= 1, "deaths " + stats.deaths],
  ];
  let failed = 0;
  for (const [name, ok, info] of checks) {
    console.log((ok ? "PASS " : "FAIL ") + name + (info ? "  (" + info + ")" : ""));
    if (!ok) failed++;
  }
  console.log(JSON.stringify(stats));
  process.exit(failed ? 1 : 0);
})();
