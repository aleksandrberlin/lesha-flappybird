// Flappy Lesha - an 8-bit flappy clone where the hero is a face from a photo
// and the enemies are Katy Perry and giant cola bottles.
(function () {
  "use strict";

  // ---------------------------------------------------------------- constants
  const W = 320;
  const H = 480;
  const GROUND_H = 72;
  const GROUND_Y = H - GROUND_H;

  const HERO_X = 76;
  const HERO_SIZE = 32;
  const HERO_R = 12;

  const GRAVITY = 0.34;
  const FLAP_V = -5.1;
  const MAX_FALL = 8.4;

  const SPEED_BASE = 1.75;
  const SPEED_MAX = 2.95;
  const GAP_BASE = 148;
  const GAP_MIN = 112;
  const SPACING = 176;

  const COLA_SCALE = 2;
  const COLA_W = 28 * COLA_SCALE;
  const KATY_SCALE = 2;

  const BEST_KEY = "flappyLesha.best";

  const COLORS = {
    skyTop: "#5ec2f0",
    skyMid: "#8fd8f7",
    skyLow: "#bdeaff",
    sun: "#ffe066",
    sunCore: "#fff3ad",
    cloud: "#ffffff",
    cloudShade: "#d7ecff",
    mountain: "#6b7fa8",
    mountainDark: "#4f6288",
    snow: "#eef6ff",
    city: "#9a86b8",
    cityDark: "#6f5d8c",
    window: "#ffe9a8",
    water: "#3f7fd0",
    waterLight: "#6aa8ea",
    grass: "#5bc94f",
    grassDark: "#3a9a37",
    dirt: "#c9a05c",
    dirtDark: "#a87f3f",
    ink: "#1a1024",
    paper: "#fff6e0",
  };

  // ------------------------------------------------------------------- canvas
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    return { canvas: c, ctx: g };
  }

  // Turn one of the string sprites from assets-data.js into a canvas.
  function buildSprite(data, scale) {
    const s = scale || 1;
    const h = data.rows.length;
    const { canvas: c, ctx: g } = makeCanvas(data.w * s, h * s);
    for (let y = 0; y < h; y++) {
      const row = data.rows[y];
      for (let x = 0; x < data.w; x++) {
        const key = row[x];
        if (key === ".") continue;
        g.fillStyle = data.pal[key];
        g.fillRect(x * s, y * s, s, s);
      }
    }
    return c;
  }

  const katySprite = buildSprite(SPRITE_DATA.katy, KATY_SCALE);
  const katySpriteFlip = (function () {
    const { canvas: c, ctx: g } = makeCanvas(katySprite.width, katySprite.height);
    g.translate(katySprite.width, 0);
    g.scale(-1, 1);
    g.drawImage(katySprite, 0, 0);
    return c;
  })();
  const colaCap = buildSprite(SPRITE_DATA.colaCap, COLA_SCALE);
  const colaCapFlip = (function () {
    const { canvas: c, ctx: g } = makeCanvas(colaCap.width, colaCap.height);
    g.translate(0, colaCap.height);
    g.scale(1, -1);
    g.drawImage(colaCap, 0, 0);
    return c;
  })();
  const colaBody = buildSprite(SPRITE_DATA.colaBody, COLA_SCALE);

  const KATY_W = katySprite.width;
  const KATY_H = katySprite.height;
  const CAP_H = colaCap.height;

  const heroImg = new Image();
  let heroReady = false;
  heroImg.onload = () => { heroReady = true; };
  heroImg.src = HERO_PNG;

  // ------------------------------------------------------------- backgrounds
  // Deterministic pseudo random so the scenery is the same every run.
  function lcg(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const cloudLayer = (function () {
    const { canvas: c, ctx: g } = makeCanvas(W, 70);
    const rnd = lcg(7);
    for (let i = 0; i < 6; i++) {
      const cx = Math.floor(rnd() * (W - 60)) + 10;
      const cy = Math.floor(rnd() * 34) + 8;
      const w = Math.floor(rnd() * 20) + 26;
      g.fillStyle = COLORS.cloudShade;
      g.fillRect(cx, cy + 8, w, 8);
      g.fillStyle = COLORS.cloud;
      g.fillRect(cx, cy + 4, w, 8);
      g.fillRect(cx + 6, cy, w - 16, 8);
      g.fillRect(cx + w - 12, cy + 2, 10, 6);
    }
    return c;
  })();

  // Lake Geneva style ridge line: a few sines summed so the tile wraps cleanly.
  const mountainLayer = (function () {
    const { canvas: c, ctx: g } = makeCanvas(W, 130);
    for (let pass = 0; pass < 2; pass++) {
      const base = pass === 0 ? 70 : 96;
      const amp = pass === 0 ? 34 : 22;
      const color = pass === 0 ? COLORS.mountainDark : COLORS.mountain;
      for (let x = 0; x < W; x++) {
        const t = (x / W) * Math.PI * 2;
        const h = base - amp * (0.6 * Math.sin(t * 2 + pass) + 0.3 * Math.sin(t * 5 + pass * 2) +
          0.15 * Math.sin(t * 9 + pass));
        const top = Math.round(h);
        g.fillStyle = color;
        g.fillRect(x, top, 1, c.height - top);
        if (pass === 0 && top < 58) {
          g.fillStyle = COLORS.snow;
          g.fillRect(x, top, 1, Math.min(6, 58 - top));
        }
      }
    }
    return c;
  })();

  const cityLayer = (function () {
    const { canvas: c, ctx: g } = makeCanvas(W, 70);
    const rnd = lcg(21);
    let x = 0;
    while (x < W) {
      const w = 14 + Math.floor(rnd() * 16);
      const h = 18 + Math.floor(rnd() * 34);
      const y = c.height - h;
      g.fillStyle = COLORS.cityDark;
      g.fillRect(x, y, Math.min(w, W - x), h);
      g.fillStyle = COLORS.city;
      g.fillRect(x, y, Math.min(w - 2, W - x), h - 2);
      g.fillStyle = COLORS.window;
      for (let wy = y + 4; wy < c.height - 6; wy += 6) {
        for (let wx = x + 3; wx < x + w - 5; wx += 5) {
          if (rnd() > 0.45 && wx < W) g.fillRect(wx, wy, 2, 3);
        }
      }
      x += w + 2;
    }
    return c;
  })();

  const groundTile = (function () {
    const { canvas: c, ctx: g } = makeCanvas(24, GROUND_H);
    g.fillStyle = COLORS.grass;
    g.fillRect(0, 0, 24, 10);
    g.fillStyle = COLORS.grassDark;
    g.fillRect(0, 8, 24, 4);
    for (let i = 0; i < 24; i += 6) g.fillRect(i, 4, 3, 4);
    g.fillStyle = COLORS.dirt;
    g.fillRect(0, 12, 24, GROUND_H - 12);
    g.fillStyle = COLORS.dirtDark;
    for (let i = 0; i < 6; i++) {
      g.fillRect((i * 7) % 22, 18 + (i * 9) % (GROUND_H - 26), 4, 3);
    }
    g.fillRect(0, GROUND_H - 6, 24, 6);
    return c;
  })();

  function drawTiled(img, offset, y, h) {
    const w = img.width;
    let x = -(offset % w);
    if (x > 0) x -= w;
    for (; x < W; x += w) ctx.drawImage(img, Math.round(x), y, w, h === undefined ? img.height : h);
  }

  // --------------------------------------------------------------- game state
  const STATE = { TITLE: 0, PLAY: 1, DYING: 2, OVER: 3 };

  const game = {
    state: STATE.TITLE,
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    scroll: 0,
    time: 0,
    shake: 0,
    flash: 0,
    paused: false,
    overTimer: 0,
    katyTimer: 5,
    nextKatyScore: 3,
  };

  const hero = { y: H * 0.42, vy: 0, angle: 0 };
  let obstacles = [];
  let katies = [];
  let particles = [];
  let popups = [];

  function speed() {
    return Math.min(SPEED_MAX, SPEED_BASE + game.score * 0.025);
  }
  function gapSize() {
    return Math.max(GAP_MIN, GAP_BASE - game.score * 1.3);
  }

  function reset() {
    game.state = STATE.TITLE;
    game.score = 0;
    game.shake = 0;
    game.flash = 0;
    game.overTimer = 0;
    game.katyTimer = 5;
    game.nextKatyScore = 3;
    hero.y = H * 0.42;
    hero.vy = 0;
    hero.angle = 0;
    obstacles = [];
    katies = [];
    particles = [];
    popups = [];
  }

  function spawnObstacle() {
    const gap = gapSize();
    const minTop = 78;
    const maxTop = GROUND_Y - gap - 78;
    const gapTop = minTop + Math.random() * Math.max(10, maxTop - minTop);
    obstacles.push({ x: W + 20, gapTop: Math.round(gapTop), gap: Math.round(gap), scored: false });
  }

  // Where the cola bottles will be, in frames from now - used to send Katy
  // through an open corridor instead of parking her inside a gap.
  function bottleBlocksHero(frames) {
    const drift = speed() * frames;
    const xs = obstacles.map((o) => o.x);
    if (xs.length) {
      const last = Math.max.apply(null, xs);
      for (let k = 1; k <= 4; k++) xs.push(last + SPACING * k);
    }
    for (const x0 of xs) {
      const x = x0 - drift;
      if (x < HERO_X + HERO_SIZE + 46 && x + COLA_W > HERO_X - 46) return true;
    }
    return false;
  }

  function spawnKaty() {
    const spawnX = W + 30;
    const base = speed();
    let vx = base * 1.45 + 0.4;
    // Try a few approach speeds and keep the first one that meets the player
    // between two bottles, so she is always dodgeable.
    for (let i = 0; i <= 16; i++) {
      const candidate = base * 1.1 + i * 0.09;
      if (!bottleBlocksHero((spawnX - HERO_X) / candidate)) { vx = candidate; break; }
    }
    const y = 60 + Math.random() * (GROUND_Y - 190);
    katies.push({
      x: spawnX,
      baseY: y,
      y: y,
      t: Math.random() * Math.PI * 2,
      amp: 20 + Math.random() * 26,
      freq: 1.4 + Math.random() * 1.2,
      vx: vx,
      scored: false,
    });
    Sfx.katy();
  }

  function burst(x, y, count, colors, power) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random()) * (power || 2.2);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.6,
        life: 0.5 + Math.random() * 0.5,
        max: 1,
        size: Math.random() < 0.4 ? 3 : 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 0.16,
      });
    }
  }

  function popup(text, x, y, color) {
    popups.push({ text: text, x: x, y: y, life: 1, color: color || COLORS.paper });
  }

  function flap() {
    hero.vy = FLAP_V;
    Sfx.flap();
    burst(HERO_X - 8, hero.y + 10, 3, ["#ffffff", "#cfe9ff"], 1.1);
  }

  function die(cause) {
    if (game.state !== STATE.PLAY) return;
    game.state = STATE.DYING;
    game.shake = 0.45;
    game.flash = 0.8;
    hero.vy = Math.min(hero.vy, -2.4);
    if (cause === "cola") {
      Sfx.cola();
      burst(HERO_X, hero.y, 18, ["#e2243a", "#ff6070", "#ffffff"], 3);
    } else if (cause === "katy") {
      Sfx.hit();
      burst(HERO_X, hero.y, 18, ["#ff3ea5", "#ffd447", "#ffffff"], 3);
    } else {
      Sfx.hit();
      burst(HERO_X, hero.y, 14, ["#c9a05c", "#a87f3f", "#ffffff"], 2.6);
    }
  }

  function gameOver() {
    game.state = STATE.OVER;
    game.overTimer = 0;
    Sfx.die();
    if (game.score > game.best) {
      game.best = game.score;
      try { localStorage.setItem(BEST_KEY, String(game.best)); } catch (e) { /* private mode */ }
    }
  }

  // --------------------------------------------------------------- collisions
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function heroHits() {
    const cx = HERO_X + HERO_SIZE / 2;
    const cy = hero.y + HERO_SIZE / 2;
    for (const o of obstacles) {
      if (o.x > cx + HERO_R || o.x + COLA_W < cx - HERO_R) continue;
      if (circleRect(cx, cy, HERO_R, o.x, -60, COLA_W, o.gapTop + 60)) return "cola";
      const bottom = o.gapTop + o.gap;
      if (circleRect(cx, cy, HERO_R, o.x, bottom, COLA_W, GROUND_Y - bottom + 10)) return "cola";
    }
    for (const k of katies) {
      if (circleRect(cx, cy, HERO_R, k.x + 5, k.y + 6, KATY_W - 10, KATY_H - 12)) return "katy";
    }
    return null;
  }

  // ------------------------------------------------------------------- update
  function update(dt) {
    game.time += dt;
    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt);
    if (game.flash > 0) game.flash = Math.max(0, game.flash - dt * 2.4);

    if (game.state === STATE.TITLE) {
      game.scroll += speed() * 0.6;
      hero.y = H * 0.42 + Math.sin(game.time * 3) * 7;
      hero.angle = Math.sin(game.time * 3) * 0.12;
    } else if (game.state === STATE.PLAY) {
      game.scroll += speed();
      hero.vy = Math.min(MAX_FALL, hero.vy + GRAVITY);
      hero.y += hero.vy;
      hero.angle = Math.max(-0.5, Math.min(1.5, hero.vy * 0.09));

      if (hero.y < -HERO_SIZE) { hero.y = -HERO_SIZE; hero.vy = 0; }

      if (!obstacles.length || obstacles[obstacles.length - 1].x < W - SPACING) spawnObstacle();

      for (const o of obstacles) {
        o.x -= speed();
        if (!o.scored && o.x + COLA_W < HERO_X) {
          o.scored = true;
          game.score++;
          Sfx.score();
          popup("+1", HERO_X + 26, hero.y - 6, COLORS.paper);
          if (game.score >= game.nextKatyScore) {
            game.nextKatyScore = game.score + 3 + Math.floor(Math.random() * 2);
            spawnKaty();
            game.katyTimer = 7;
          }
        }
      }
      obstacles = obstacles.filter((o) => o.x + COLA_W > -10);

      game.katyTimer -= dt;
      if (game.katyTimer <= 0) {
        game.katyTimer = 7 + Math.random() * 4;
        if (katies.length < 2) spawnKaty();
      }

      for (const k of katies) {
        k.t += dt * k.freq;
        k.x -= k.vx;
        k.y = k.baseY + Math.sin(k.t) * k.amp;
        if (!k.scored && k.x + KATY_W < HERO_X) {
          k.scored = true;
          game.score++;
          Sfx.score();
          popup("dodged!", HERO_X + 30, hero.y - 12, "#ff9ad5");
          burst(HERO_X + 20, hero.y, 6, ["#ff3ea5", "#ffd447"], 1.6);
        }
      }
      katies = katies.filter((k) => k.x + KATY_W > -20);

      const hit = heroHits();
      if (hit) die(hit);
      else if (hero.y + HERO_SIZE >= GROUND_Y) { die("ground"); }
    } else if (game.state === STATE.DYING) {
      hero.vy = Math.min(MAX_FALL, hero.vy + GRAVITY);
      hero.y += hero.vy;
      hero.angle = Math.min(1.6, hero.angle + dt * 4);
      if (hero.y + HERO_SIZE >= GROUND_Y) {
        hero.y = GROUND_Y - HERO_SIZE;
        burst(HERO_X + 16, GROUND_Y, 10, [COLORS.dirt, COLORS.dirtDark], 2);
        gameOver();
      }
    } else if (game.state === STATE.OVER) {
      game.overTimer += dt;
    }

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);

    for (const t of popups) {
      t.y -= 26 * dt;
      t.life -= dt * 1.4;
    }
    popups = popups.filter((t) => t.life > 0);
  }

  // ------------------------------------------------------------------- render
  function drawBackground() {
    ctx.fillStyle = COLORS.skyTop;
    ctx.fillRect(0, 0, W, 150);
    ctx.fillStyle = COLORS.skyMid;
    ctx.fillRect(0, 150, W, 90);
    ctx.fillStyle = COLORS.skyLow;
    ctx.fillRect(0, 240, W, GROUND_Y - 240);

    // chunky pixel sun
    ctx.fillStyle = COLORS.sun;
    ctx.fillRect(246, 32, 24, 32);
    ctx.fillRect(242, 36, 32, 24);
    ctx.fillRect(238, 42, 40, 12);
    ctx.fillStyle = COLORS.sunCore;
    ctx.fillRect(250, 38, 12, 12);

    drawTiled(cloudLayer, game.scroll * 0.18, 26);
    drawTiled(mountainLayer, game.scroll * 0.3, GROUND_Y - 190);
    drawTiled(cityLayer, game.scroll * 0.46, GROUND_Y - 96);

    // lake strip in front of the city
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(0, GROUND_Y - 26, W, 26);
    ctx.fillStyle = COLORS.waterLight;
    const wobble = Math.floor(game.scroll * 0.6);
    for (let x = 0; x < W; x += 16) {
      const px = (x - wobble % 16 + W) % W;
      ctx.fillRect(px, GROUND_Y - 20 + ((x / 16) % 2) * 8, 7, 2);
    }
  }

  function drawBottle(o) {
    const x = Math.round(o.x);
    const topEnd = o.gapTop;
    const bottomStart = o.gapTop + o.gap;

    // upper bottle hangs down, cap pointing into the gap
    const upperCapY = topEnd - CAP_H;
    if (upperCapY > -CAP_H) {
      if (upperCapY > 0) ctx.drawImage(colaBody, x, 0, COLA_W, upperCapY);
      ctx.drawImage(colaCapFlip, x, upperCapY);
    }

    // lower bottle stands up
    ctx.drawImage(colaCap, x, bottomStart);
    const bodyTop = bottomStart + CAP_H;
    if (bodyTop < GROUND_Y) ctx.drawImage(colaBody, x, bodyTop, COLA_W, GROUND_Y - bodyTop);
  }

  function drawHero() {
    if (!heroReady) return;
    const cx = HERO_X + HERO_SIZE / 2;
    const cy = hero.y + HERO_SIZE / 2;
    // quantise the rotation so the sprite keeps its pixel grid
    const step = Math.PI / 12;
    const angle = Math.round(hero.angle / step) * step;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.rotate(angle);
    ctx.drawImage(heroImg, -HERO_SIZE / 2, -HERO_SIZE / 2, HERO_SIZE, HERO_SIZE);
    ctx.restore();
  }

  function drawKaty(k) {
    const x = Math.round(k.x);
    const y = Math.round(k.y);
    const bob = Math.sin(k.t * 2) > 0 ? 0 : 1;
    ctx.drawImage(katySpriteFlip, x, y + bob);
    // musical notes trailing behind her
    ctx.fillStyle = "#ffffff";
    const n = Math.floor(k.t * 2) % 3;
    for (let i = 0; i < 3; i++) {
      const nx = x + KATY_W + 6 + i * 9;
      const ny = y + 12 + Math.sin(k.t * 3 + i) * 6;
      if (i === n) continue;
      ctx.fillRect(Math.round(nx), Math.round(ny), 3, 3);
      ctx.fillRect(Math.round(nx) + 2, Math.round(ny) - 5, 2, 6);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups() {
    for (const t of popups) {
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life));
      drawText(ctx, t.text, t.x, t.y, { scale: 1, color: t.color, align: "center", outline: COLORS.ink });
    }
    ctx.globalAlpha = 1;
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#e4d5b4";
    ctx.fillRect(x, y + h - 4, w, 4);
  }

  function medalFor(score) {
    if (score >= 40) return { name: "gold", color: "#ffd447", dark: "#c99b12" };
    if (score >= 20) return { name: "silver", color: "#d8dee8", dark: "#9aa4b4" };
    if (score >= 10) return { name: "bronze", color: "#d98b45", dark: "#a4622c" };
    return null;
  }

  function drawHud() {
    if (game.state === STATE.PLAY || game.state === STATE.DYING) {
      const label = String(game.score);
      const tw = textWidth(label, 4);
      ctx.fillStyle = "rgba(26,16,36,0.32)";
      ctx.fillRect(Math.round(W / 2 - tw / 2) - 8, 32, tw + 16, 44);
      drawText(ctx, label, W / 2, 40, {
        scale: 4, color: COLORS.paper, align: "center", outline: COLORS.ink,
      });
    }
    drawText(ctx, Sfx.isMuted() ? "snd off" : "snd on", W - 6, H - 14, {
      scale: 1, color: "#ffffff", align: "right", shadow: COLORS.ink,
    });
  }

  function drawTitle() {
    drawText(ctx, "flappy", W / 2, 84, { scale: 4, color: "#ffd447", align: "center", outline: COLORS.ink });
    drawText(ctx, "lesha", W / 2, 122, { scale: 4, color: "#ff3ea5", align: "center", outline: COLORS.ink });

    panel(38, 228, W - 76, 116);
    drawText(ctx, "watch out for", W / 2, 236, { scale: 1, color: COLORS.ink, align: "center" });
    ctx.drawImage(katySprite, 72, 254);
    ctx.drawImage(colaCap, 192, 258);
    drawText(ctx, "katy", 88, 326, { scale: 1, color: COLORS.ink, align: "center" });
    drawText(ctx, "cola", 220, 326, { scale: 1, color: COLORS.ink, align: "center" });

    const blink = Math.floor(game.time * 2) % 2 === 0;
    if (blink) {
      drawText(ctx, "press space or tap", W / 2, 360, {
        scale: 1, color: COLORS.paper, align: "center", outline: COLORS.ink,
      });
    }
    drawText(ctx, "best: " + game.best, W / 2, 380, {
      scale: 1, color: COLORS.paper, align: "center", outline: COLORS.ink,
    });
  }

  function drawGameOver() {
    drawText(ctx, "game over", W / 2, 104, { scale: 3, color: "#ff5a5a", align: "center", outline: COLORS.ink });

    panel(60, 150, W - 120, 108);
    drawText(ctx, "score", 78, 162, { scale: 1, color: COLORS.ink });
    drawText(ctx, String(game.score), W - 78, 158, { scale: 2, color: COLORS.ink, align: "right" });
    drawText(ctx, "best", 78, 196, { scale: 1, color: COLORS.ink });
    drawText(ctx, String(game.best), W - 78, 192, { scale: 2, color: COLORS.ink, align: "right" });

    const medal = medalFor(game.score);
    if (medal) {
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(76, 224, 22, 22);
      ctx.fillStyle = medal.dark;
      ctx.fillRect(78, 226, 18, 18);
      ctx.fillStyle = medal.color;
      ctx.fillRect(80, 228, 14, 14);
      ctx.fillStyle = medal.dark;
      ctx.fillRect(84, 232, 6, 6);
      drawText(ctx, medal.name, 108, 232, { scale: 1, color: COLORS.ink });
    } else {
      drawText(ctx, "keep flapping!", 78, 232, { scale: 1, color: COLORS.ink });
    }

    if (game.overTimer > 0.6 && Math.floor(game.time * 2) % 2 === 0) {
      drawText(ctx, "press space to retry", W / 2, 292, {
        scale: 1, color: COLORS.paper, align: "center", outline: COLORS.ink,
      });
    }
  }

  function render() {
    ctx.save();
    if (game.shake > 0) {
      ctx.translate(Math.round((Math.random() - 0.5) * game.shake * 12),
        Math.round((Math.random() - 0.5) * game.shake * 12));
    }

    drawBackground();
    for (const o of obstacles) drawBottle(o);
    for (const k of katies) drawKaty(k);
    drawHero();
    drawParticles();
    drawTiled(groundTile, game.scroll, GROUND_Y);
    drawPopups();

    if (game.state === STATE.TITLE) drawTitle();
    if (game.state === STATE.OVER) drawGameOver();
    drawHud();

    if (game.paused) {
      ctx.fillStyle = "rgba(26,16,36,0.6)";
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, "paused", W / 2, H / 2 - 10, { scale: 3, color: COLORS.paper, align: "center", outline: COLORS.ink });
    }
    ctx.restore();

    if (game.flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + Math.min(0.8, game.flash) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  // -------------------------------------------------------------------- input
  function press() {
    Sfx.unlock();
    if (game.paused) return;
    if (game.state === STATE.TITLE) {
      game.state = STATE.PLAY;
      hero.y = H * 0.42;
      flap();
    } else if (game.state === STATE.PLAY) {
      flap();
    } else if (game.state === STATE.OVER && game.overTimer > 0.6) {
      reset();
      Sfx.swoosh();
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Enter") {
      e.preventDefault();
      press();
    } else if (e.code === "KeyM") {
      Sfx.unlock();
      Sfx.toggleMute();
    } else if (e.code === "KeyP") {
      game.paused = !game.paused;
    } else if (e.code === "KeyR") {
      reset();
    }
  });
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); press(); });
  window.addEventListener("blur", () => { if (game.state === STATE.PLAY) game.paused = true; });

  // ------------------------------------------------------------------ scaling
  function resize() {
    const availW = window.innerWidth - 16;
    const availH = window.innerHeight - 96;
    let scale = Math.min(availW / W, availH / H);
    if (scale >= 1) scale = Math.floor(scale);
    scale = Math.max(scale, 0.3);
    canvas.style.width = Math.round(W * scale) + "px";
    canvas.style.height = Math.round(H * scale) + "px";
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------------------------------------------------------- main loop
  // Small hook so the game can be driven from a script (used by the smoke test).
  window.FlappyLesha = {
    STATE: STATE,
    game: game,
    hero: hero,
    obstacles: () => obstacles,
    katies: () => katies,
    press: press,
    gapSize: gapSize,
    layout: { W: W, H: H, HERO_X: HERO_X, HERO_SIZE: HERO_SIZE, COLA_W: COLA_W, GROUND_Y: GROUND_Y },
  };

  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    if (!game.paused) {
      acc += dt;
      while (acc >= STEP) {
        update(STEP);
        acc -= STEP;
      }
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
