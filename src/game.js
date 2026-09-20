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
  const HERO_SIZE = 36;   // matches the generated sprite, so it draws 1:1
  const HERO_R = 12;

  const GRAVITY = 0.34;
  const FLAP_V = -5.1;
  const MAX_FALL = 8.4;

  // Difficulty ramp: the world speeds up, the gaps tighten and the bottles
  // start standing closer together, all reaching their limit around score 45.
  const SPEED_BASE = 1.75;
  const SPEED_MAX = 3.7;
  const SPEED_RAMP = 50;
  const GAP_BASE = 150;
  const GAP_MIN = 100;
  const GAP_RAMP = 40;
  const SPACING_BASE = 186;
  const SPACING_MIN = 156;
  const SPACING_RAMP = 34;
  const LEVEL_EVERY = 8;

  const COLA_SCALE = 2;
  const COLA_W = 28 * COLA_SCALE;
  const KATY_SCALE = 2;

  const MAX_LIVES = 3;
  const INVULN = 1.5;

  // The flying enemies. Katy is not here any more - she hands out lives.
  const ENEMIES = {
    gull:  { w: 30, h: 22, inset: 5, unlock: 2,  weight: 3, label: "чайка" },
    drone: { w: 32, h: 22, inset: 5, unlock: 12, weight: 2, label: "дрон" },
    spider: { w: 28, h: 32, inset: 6, unlock: 5, weight: 2, label: "паук" },
  };

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

  // The canvas keeps its 320x480 coordinate system, but the backing store is a
  // whole-number multiple of it. Sprites still land on exact pixel squares, and
  // the photos on the checkpoint and collection screens get real resolution
  // instead of being blown up with the rest of the pixel art.
  let backing = 0;

  function setBacking(scale) {
    const want = Math.max(1, Math.min(4, Math.round(scale)));
    if (want === backing) return;
    backing = want;
    canvas.width = W * want;
    canvas.height = H * want;
    // resizing a canvas resets its context, so the transform and the smoothing
    // flag have to be set again right here
    ctx.setTransform(want, 0, 0, want, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  setBacking(window.devicePixelRatio || 1);

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

  function flipH(src) {
    const { canvas: c, ctx: g } = makeCanvas(src.width, src.height);
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  function flipV(src) {
    const { canvas: c, ctx: g } = makeCanvas(src.width, src.height);
    g.translate(0, src.height);
    g.scale(1, -1);
    g.drawImage(src, 0, 0);
    return c;
  }

  const SP = SPRITE_DATA;
  const katySprite = buildSprite(SP.katy, KATY_SCALE);
  const katyTiny = buildSprite(SP.katy, 1);
  const gullFrames = [buildSprite(SP.gullUp, 2), buildSprite(SP.gullDown, 2)];
  const gullTiny = buildSprite(SP.gullUp, 1);
  const droneFrames = [buildSprite(SP.droneA, 2), buildSprite(SP.droneB, 2)];
  const droneTiny = buildSprite(SP.droneA, 1);
  const spiderSprite = buildSprite(SP.spider, 2);
  const spiderTiny = buildSprite(SP.spider, 1);
  const macSprite = buildSprite(SP.mac, 2);
  const macTiny = buildSprite(SP.mac, 1);
  const heartSprite = buildSprite(SP.heart, 2);
  const heartTiny = buildSprite(SP.heart, 1);
  const colaCap = buildSprite(SP.colaCap, COLA_SCALE);
  const colaCapFlip = flipV(colaCap);
  const colaBody = buildSprite(SP.colaBody, COLA_SCALE);
  const colaTiny = buildSprite(SP.colaCap, 1);

  const KATY_W = katySprite.width;
  const KATY_H = katySprite.height;
  const CAP_H = colaCap.height;

  // Checkpoint photos stay photos - they are the joke, so no pixelation.
  // A slot holds one frame, or several that loop (the walking Лёша).
  const checkpointPhotos = {};
  for (const slot in CHECKPOINT_IMAGES) {
    checkpointPhotos[slot] = CHECKPOINT_IMAGES[slot].map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
  }

  // The frame to show right now: single photos never change, loops walk on.
  function photoOf(slot) {
    const frames = checkpointPhotos[slot];
    if (!frames || !frames.length) return null;
    if (frames.length === 1) return frames[0];
    const fps = (CHECKPOINTS.fps && CHECKPOINTS.fps[slot]) || 6;
    return frames[Math.floor(game.time * fps) % frames.length];
  }

  function photoReady(slot) {
    const frames = checkpointPhotos[slot];
    return !!(frames && frames.length && frames[0].complete && frames[0].naturalWidth);
  }

  function photoName(slot) {
    return (CHECKPOINTS.names && CHECKPOINTS.names[slot]) || ("№" + slot);
  }

  // The big screens pick the largest size the name actually fits in, rather
  // than guessing from how many characters it has.
  function titleScale(text, maxWidth) {
    return textWidth(String(text).toUpperCase(), 2) <= maxWidth ? 2 : 1;
  }

  function photoTitle(slot) {
    return (CHECKPOINTS.titles && CHECKPOINTS.titles[slot]) || photoName(slot);
  }

  function drawPhoto(slot, x, y, size) {
    const frame = photoOf(slot);
    if (!frame || !frame.complete || !frame.naturalWidth) {
      ctx.fillStyle = "#e4d5b4";
      ctx.fillRect(x, y, size, size);
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(frame, x, y, size, size);
    ctx.imageSmoothingEnabled = false;
  }

  // Random, and deliberately repetitive: most checkpoints show a Лёша the
  // player already has, so the collection fills up over many runs instead of
  // handing everything over at once. Never the same one twice in a row.
  function pickCheckpointPhoto() {
    const all = Collection.all();
    if (!all.length) return null;
    const missing = Collection.missing();
    const owned = all.filter((slot) => Collection.has(slot));

    let pool;
    if (!missing.length) pool = all;                       // everything found
    else if (!owned.length) pool = missing;                // nothing found yet
    else pool = Math.random() < 0.45 ? missing : owned;

    if (pool.length > 1 && game.lastPhoto) {
      const rest = pool.filter((slot) => slot !== game.lastPhoto);
      if (rest.length) pool = rest;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function currentCheckpoint() {
    const slot = game.checkpointSlot;
    if (!slot || !checkpointPhotos[slot]) return null;
    return {
      slot: slot,
      title: photoTitle(slot),
      cheer: CHECKPOINTS.cheers[Math.floor(game.score / CHECKPOINTS.every) % CHECKPOINTS.cheers.length] || "",
      isNew: game.checkpointNew,
    };
  }

  const heroImg = new Image();
  let heroReady = false;
  heroImg.onload = () => { heroReady = true; };
  heroImg.src = HERO_PNG;

  // Nothing should load mid-run: every photo is fetched and decoded up front,
  // so a found Лёша appears the instant the checkpoint opens.
  const loading = { total: 0, done: 0, timer: 0 };

  function trackAsset(img) {
    loading.total++;
    const finish = () => { loading.done++; };
    if (img.decode) {
      img.decode().then(finish, finish);
    } else if (img.complete) {
      finish();
    } else {
      img.onload = finish;
      img.onerror = finish;
    }
  }

  trackAsset(heroImg);
  for (const slot in checkpointPhotos) {
    for (const frame of checkpointPhotos[slot]) trackAsset(frame);
  }

  function loadingProgress() {
    return loading.total ? Math.min(1, loading.done / loading.total) : 1;
  }

  function finishLoading() {
    game.state = STATE.TITLE;
    if (!game.player) askName(true);
  }

  // ------------------------------------------------------------- backgrounds
  // Deterministic pseudo random so the scenery is the same every run.
  function lcg(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Clouds are individual objects: they drift with the scenery, each at its own
  // pace, and bob a little so the sky never looks frozen.
  const clouds = [];
  const birds = [];
  let birdTimer = 3;

  function makeCloud(x) {
    return {
      x: x,
      baseY: 14 + Math.random() * 122,
      w: 22 + Math.round(Math.random() * 26),
      drift: 0.05 + Math.random() * 0.16,
      bob: Math.random() * Math.PI * 2,
      bobSpeed: 0.25 + Math.random() * 0.4,
      bobAmp: 1 + Math.random() * 2.5,
    };
  }

  function seedClouds() {
    clouds.length = 0;
    for (let i = 0; i < 7; i++) clouds.push(makeCloud(Math.random() * (W + 60) - 30));
    birds.length = 0;
    birdTimer = 2 + Math.random() * 4;
  }

  function updateSky(dt, scrollSpeed) {
    for (const c of clouds) {
      c.x -= scrollSpeed * 0.16 + c.drift;
      c.bob += dt * c.bobSpeed;
      if (c.x + c.w < -20) {
        const fresh = makeCloud(W + 10 + Math.random() * 40);
        c.x = fresh.x; c.baseY = fresh.baseY; c.w = fresh.w;
        c.drift = fresh.drift; c.bobAmp = fresh.bobAmp; c.bobSpeed = fresh.bobSpeed;
      }
    }

    birdTimer -= dt;
    if (birdTimer <= 0) {
      birdTimer = 6 + Math.random() * 9;
      const flock = 1 + Math.floor(Math.random() * 3);
      const y = 34 + Math.random() * 80;
      for (let i = 0; i < flock; i++) {
        birds.push({
          x: W + 16 + i * (12 + Math.random() * 10),
          y: y + (Math.random() - 0.5) * 14,
          speed: 0.3 + Math.random() * 0.25,
          t: Math.random() * 6,
        });
      }
    }
    for (const b of birds) {
      b.x -= scrollSpeed * 0.22 + b.speed;
      b.t += dt * 6;
      b.y += Math.sin(b.t * 0.35) * 0.12;
    }
    for (let i = birds.length - 1; i >= 0; i--) if (birds[i].x < -14) birds.splice(i, 1);
  }

  function drawCloud(c) {
    const x = Math.round(c.x);
    const y = Math.round(c.baseY + Math.sin(c.bob) * c.bobAmp);
    const w = c.w;
    ctx.fillStyle = COLORS.cloudShade;
    ctx.fillRect(x, y + 8, w, 6);
    ctx.fillStyle = COLORS.cloud;
    ctx.fillRect(x, y + 4, w, 6);
    ctx.fillRect(x + 5, y, Math.max(8, w - 14), 6);
    ctx.fillRect(x + w - 10, y + 2, 8, 4);
  }

  function drawBird(b) {
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    const up = Math.floor(b.t) % 2 === 0;
    ctx.fillStyle = "rgba(26,16,36,0.55)";
    if (up) {
      ctx.fillRect(x - 3, y - 1, 2, 2);
      ctx.fillRect(x - 1, y, 2, 2);
      ctx.fillRect(x + 1, y - 1, 2, 2);
    } else {
      ctx.fillRect(x - 3, y + 1, 2, 2);
      ctx.fillRect(x - 1, y, 2, 2);
      ctx.fillRect(x + 1, y + 1, 2, 2);
    }
  }

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
  const STATE = { LOADING: 7, TITLE: 0, PLAY: 1, DYING: 2, OVER: 3, BOARD: 4, CHECKPOINT: 5, COLLECTION: 6 };

  const game = {
    state: STATE.LOADING,
    score: 0,
    best: 0,
    scroll: 0,
    time: 0,
    shake: 0,
    flash: 0,
    paused: false,
    overTimer: 0,
    katyTimer: 7,
    enemyTimer: 5,
    lives: 1,
    invuln: 0,
    level: 1,
    lastGapTop: null,
    nextCheckpoint: CHECKPOINTS.every,
    checkpointSlot: null,
    checkpointNew: false,
    checkpointTimer: 0,
    lastPhoto: null,
    collectionPick: null,
    player: "",
    rank: null,
    sent: true,
    submitting: false,
    dialogOpen: false,
    boardFrom: STATE.TITLE,
    board: { rows: [], source: Scores.online ? "cloud" : "local", loading: false, loaded: false },
  };

  const hero = { y: H * 0.42, vy: 0, angle: 0, squash: 0 };
  let obstacles = [];
  let enemies = [];
  let bonuses = [];
  let particles = [];
  let popups = [];

  function loadBoard(force, attempt) {
    if (game.board.loading || (game.board.loaded && !force)) return;
    game.board.loading = true;
    const tries = attempt || 1;
    Scores.top().then((res) => {
      game.board.rows = res.rows || [];
      game.board.source = res.source;
      game.board.loaded = res.source === "cloud";
      game.board.loading = false;
      // nothing is mirrored locally any more, so a dropped request is worth
      // another go rather than an empty board
      if (res.source !== "cloud" && Scores.online && tries < 3) {
        setTimeout(() => loadBoard(true, tries + 1), 1500 * tries);
      }
    }).catch(() => { game.board.loading = false; });
  }

  // Pull this player's best and their finds from the server, retrying a few
  // times: there is no local copy to fall back on.
  function syncProfile(attempt) {
    if (!game.player) return;
    const tries = attempt || 1;
    Promise.all([
      Scores.best(game.player).then((best) => {
        if (best === null) return false;
        game.best = Math.max(game.best, best);
        return true;
      }),
      Collection.use(game.player).then(() => Collection.loaded()),
    ]).then(([gotBest, gotFinds]) => {
      if ((!gotBest || !gotFinds) && Scores.online && tries < 4) {
        setTimeout(() => syncProfile(tries + 1), 1500 * tries);
      }
    });
  }

  function askName(force) {
    if (game.dialogOpen) return;
    game.dialogOpen = true;
    NameDialog.open({ current: game.player, allowCancel: !force && !!game.player })
      .then((name) => {
        game.dialogOpen = false;
        if (name) {
          game.player = Scores.setName(name);
          game.best = 0;
          syncProfile();
          loadBoard(true);
          Sfx.unlock();
        }
      });
  }

  function openBoard() {
    if (game.state === STATE.BOARD) return;
    game.boardFrom = game.state === STATE.OVER ? STATE.OVER : STATE.TITLE;
    game.state = STATE.BOARD;
    loadBoard(true);
  }

  function closeBoard() {
    game.state = game.boardFrom;
    if (game.state === STATE.OVER) game.overTimer = Math.max(game.overTimer, 1);
  }

  function ramp(points) {
    return Math.min(1, game.score / points);
  }
  function speed() {
    return SPEED_BASE + (SPEED_MAX - SPEED_BASE) * ramp(SPEED_RAMP);
  }
  function gapSize() {
    return GAP_BASE - (GAP_BASE - GAP_MIN) * ramp(GAP_RAMP);
  }
  function spacing() {
    return SPACING_BASE - (SPACING_BASE - SPACING_MIN) * ramp(SPACING_RAMP);
  }

  function reset() {
    game.state = STATE.TITLE;
    game.score = 0;
    game.shake = 0;
    game.flash = 0;
    game.overTimer = 0;
    game.katyTimer = 7;
    game.enemyTimer = 5;
    game.lives = 1;
    game.invuln = 0;
    game.level = 1;
    game.lastGapTop = null;
    game.nextCheckpoint = CHECKPOINTS.every;
    game.checkpointSlot = null;
    game.checkpointNew = false;
    game.checkpointTimer = 0;
    hero.y = H * 0.42;
    hero.vy = 0;
    hero.angle = 0;
    hero.squash = 0;
    obstacles = [];
    enemies = [];
    bonuses = [];
    particles = [];
    popups = [];
  }

  function spawnObstacle() {
    const t = ramp(GAP_RAMP);
    // every so often a pair stands tighter than the current baseline
    const squeeze = Math.random() < 0.25 + t * 0.2 ? 6 + Math.random() * 12 * t : 0;
    const gap = Math.max(92, Math.round(gapSize() - squeeze));

    const minTop = 74;
    const maxTop = GROUND_Y - gap - 74;
    // later on the gaps stop drifting gently and start jumping up and down
    const jump = 24 + 70 * ramp(SPEED_RAMP);
    let gapTop = minTop;
    for (let i = 0; i < 6; i++) {
      gapTop = minTop + Math.random() * Math.max(10, maxTop - minTop);
      if (game.lastGapTop === null || Math.abs(gapTop - game.lastGapTop) >= jump) break;
    }
    game.lastGapTop = gapTop;

    obstacles.push({
      x: W + 20,
      gapTop: Math.round(gapTop),
      gap: gap,
      // distance until the next pair, so the rhythm varies too
      spacing: Math.round(spacing() + (Math.random() - 0.5) * 24),
      scored: false,
    });
  }

  function enterCheckpoint() {
    game.nextCheckpoint += CHECKPOINTS.every;
    const slot = pickCheckpointPhoto();
    if (!slot) return;                      // no photos bundled - just play on
    game.checkpointSlot = slot;
    game.lastPhoto = slot;
    game.checkpointNew = Collection.add(slot);
    game.state = STATE.CHECKPOINT;
    game.checkpointTimer = 0;
    game.flash = Math.max(game.flash, 0.3);
    if (game.checkpointNew) {
      Sfx.newFind();
      burst(W / 2, 150, 26, ["#ffd447", "#ff3ea5", "#ffffff"], 3);
    } else {
      Sfx.levelUp();
    }
  }

  function leaveCheckpoint() {
    game.state = STATE.PLAY;
    game.invuln = Math.max(game.invuln, 1.2);   // a moment to get your bearings
    Sfx.swoosh();
  }

  function openCollection() {
    if (game.state === STATE.COLLECTION) return;
    game.boardFrom = game.state === STATE.OVER ? STATE.OVER : STATE.TITLE;
    game.collectionPick = null;
    game.state = STATE.COLLECTION;
    Collection.use(game.player);
  }

  function closeCollection() {
    if (game.collectionPick) { game.collectionPick = null; return; }
    game.state = game.boardFrom;
    if (game.state === STATE.OVER) game.overTimer = Math.max(game.overTimer, 1);
  }

  // A level every few points: the world gets faster and the player is told so.
  function checkLevel() {
    if (game.score >= game.nextCheckpoint) {
      enterCheckpoint();
      return;                              // the checkpoint screen announces it
    }
    const level = Math.floor(game.score / LEVEL_EVERY) + 1;
    if (level <= game.level) return;
    game.level = level;
    game.flash = Math.max(game.flash, 0.22);
    popup("скорость +", W / 2, 132, "#ffd447", 2);
    Sfx.levelUp();
  }

  // Where the cola bottles will be, in frames from now - used to send Katy
  // through an open corridor instead of parking her inside a gap.
  function bottleBlocksHero(frames) {
    const drift = speed() * frames;
    const xs = obstacles.map((o) => o.x);
    if (xs.length) {
      const last = Math.max.apply(null, xs);
      const step = spacing();
      for (let k = 1; k <= 4; k++) xs.push(last + step * k);
    }
    for (const x0 of xs) {
      const x = x0 - drift;
      if (x < HERO_X + HERO_SIZE + 46 && x + COLA_W > HERO_X - 46) return true;
    }
    return false;
  }

  // Pick an approach speed that lands the flyer in an open corridor rather than
  // inside a bottle gap, so everything on screen can actually be dodged.
  function fairSpeed(spawnX, low, high) {
    for (let i = 0; i <= 14; i++) {
      const v = low + (high - low) * (i / 14);
      if (!bottleBlocksHero((spawnX - HERO_X) / v)) return v;
    }
    return (low + high) / 2;
  }

  function spawnEnemy(kind) {
    const def = ENEMIES[kind];
    const spawnX = W + 24;
    const e = {
      kind: kind,
      def: def,
      x: spawnX,
      t: Math.random() * 6,
      scored: false,
    };
    const base = speed();
    if (kind === "gull") {
      e.vx = fairSpeed(spawnX, base * 1.15, base * 2.1);
      e.amp = 8 + Math.random() * 18;
      e.freq = 1.6 + Math.random() * 1.2;
      e.baseY = 50 + Math.random() * (GROUND_Y - 150 - e.amp * 2);
    } else if (kind === "spider") {
      // one swing across the screen on a web strung from the top edge
      e.vx = fairSpeed(spawnX, base * 0.9, base * 1.6);
      e.rope = 110 + Math.random() * 80;
      e.swing = 0.85 + Math.random() * 0.25;     // half of the arc, in radians
      e.progress = 0;
      e.duration = 1.7 + Math.random() * 0.7;
      e.anchorY = -8;
      e.baseY = e.anchorY + e.rope;              // only used before the first step
    } else {
      // paparazzi drone: creeps in and drifts towards the player's height
      e.vx = fairSpeed(spawnX, base * 0.85, base * 1.5);
      e.chase = 0.38;
      e.baseY = 60 + Math.random() * (GROUND_Y - 170);
    }
    e.y = e.baseY;
    enemies.push(e);
    Sfx.swoosh();
  }

  function pickEnemyKind() {
    const pool = [];
    for (const kind in ENEMIES) {
      if (game.score >= ENEMIES[kind].unlock) {
        for (let i = 0; i < ENEMIES[kind].weight; i++) pool.push(kind);
      }
    }
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  // Two pickups float through, both worth an extra life: Katy and the arches.
  function spawnBonus() {
    const kind = Math.random() < 0.5 ? "katy" : "mac";
    const w = kind === "katy" ? KATY_W : macSprite.width;
    const h = kind === "katy" ? KATY_H : macSprite.height;
    const spawnX = W + 30;
    const y = 70 + Math.random() * (GROUND_Y - 200);
    bonuses.push({
      kind: kind,
      w: w,
      h: h,
      x: spawnX,
      baseY: y,
      y: y,
      t: Math.random() * Math.PI * 2,
      amp: 16 + Math.random() * 20,
      vx: fairSpeed(spawnX, speed() * 0.9, speed() * 1.5),
      taken: false,
    });
    if (kind === "katy") Sfx.katy(); else Sfx.swoosh();
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

  function popup(text, x, y, color, scale) {
    popups.push({
      text: text, x: x, y: y, life: 1,
      color: color || COLORS.paper, scale: scale || 1,
    });
  }

  function flap() {
    hero.vy = FLAP_V;
    hero.squash = 1;
    Sfx.flap();
    burst(HERO_X - 8, hero.y + 10, 3, ["#ffffff", "#cfe9ff"], 1.1);
  }

  function die(cause) {
    if (game.state !== STATE.PLAY) return;
    game.state = STATE.DYING;
    game.lives = 0;
    game.shake = 0.45;
    game.flash = 0.8;
    hero.vy = Math.min(hero.vy, -2.4);
    const debris = {
      cola: ["#e2243a", "#ff6070", "#ffffff"],
      gull: ["#ffffff", "#b9c4d4", "#8b97ab"],
      drone: ["#2b2438", "#c8ccd8", "#ff4d4d"],
      spider: ["#d2222d", "#1d3fa8", "#ffffff"],
      ground: [COLORS.dirt, COLORS.dirtDark, "#ffffff"],
    }[cause] || ["#ffffff", "#ffd447"];
    if (cause === "cola") Sfx.cola();
    else Sfx.hit();
    burst(HERO_X, hero.y, 18, debris, cause === "ground" ? 2.6 : 3);
  }

  function gameOver() {
    game.state = STATE.OVER;
    game.overTimer = 0;
    Sfx.die();
    if (game.score > game.best) game.best = game.score;

    game.rank = null;
    game.sent = true;
    game.submitting = true;
    Scores.submit(game.player, game.score)
      .then((ok) => {
        game.sent = ok;
        return ok ? Scores.rank(game.score) : null;
      })
      .then((rank) => {
        game.rank = rank;
        game.submitting = false;
        loadBoard(true);
        Collection.use(game.player);
      })
      .catch(() => { game.submitting = false; game.sent = false; });
  }

  // --------------------------------------------------------------- collisions
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function heroBox() {
    return { cx: HERO_X + HERO_SIZE / 2, cy: hero.y + HERO_SIZE / 2 };
  }

  // Returns what the player ran into, or null.
  function heroHits() {
    const { cx, cy } = heroBox();
    for (const o of obstacles) {
      if (o.x > cx + HERO_R || o.x + COLA_W < cx - HERO_R) continue;
      if (circleRect(cx, cy, HERO_R, o.x, -60, COLA_W, o.gapTop + 60)) return { kind: "cola", obstacle: o };
      const bottom = o.gapTop + o.gap;
      if (circleRect(cx, cy, HERO_R, o.x, bottom, COLA_W, GROUND_Y - bottom + 10)) {
        return { kind: "cola", obstacle: o };
      }
    }
    for (const e of enemies) {
      const i = e.def.inset;
      const bx = e.kind === "spider" ? e.hitX : e.x;
      const by = e.kind === "spider" ? e.hitY : e.y;
      if (bx === undefined) continue;
      if (circleRect(cx, cy, HERO_R, bx + i, by + i, e.def.w - i * 2, e.def.h - i * 2)) {
        return { kind: e.kind, enemy: e };
      }
    }
    return null;
  }

  function takeLife(bonus) {
    bonus.taken = true;
    burst(bonus.x + bonus.w / 2, bonus.y + bonus.h / 2, 14, ["#ff4d6d", "#ffd447", "#ffffff"], 2.2);
    if (game.lives < MAX_LIVES) {
      game.lives++;
      popup("+1 жизнь", HERO_X + 40, hero.y - 14, "#ff4d6d");
      Sfx.life();
    } else {
      game.score += 3;
      popup("+3", HERO_X + 40, hero.y - 14, "#ffd447");
      Sfx.score();
    }
  }

  // A hit with a life left costs a heart and smashes whatever we hit, so the
  // player is never left stuck inside the thing that just hurt them.
  function survivedHit(hit) {
    game.lives--;
    game.invuln = INVULN;
    game.shake = 0.4;
    game.flash = 0.5;
    hero.vy = Math.min(hero.vy, -3.2);
    Sfx.shield();
    popup("-1 жизнь", HERO_X + 34, hero.y - 10, "#ff5a5a");
    if (hit.obstacle) {
      obstacles = obstacles.filter((o) => o !== hit.obstacle);
      burst(hit.obstacle.x + COLA_W / 2, hero.y + HERO_SIZE / 2, 22,
        ["#e2243a", "#ff6070", "#ffffff"], 3.2);
    }
    if (hit.enemy) {
      enemies = enemies.filter((e) => e !== hit.enemy);
      burst(hit.enemy.x + hit.enemy.def.w / 2, hit.enemy.y + hit.enemy.def.h / 2, 16,
        ["#ffffff", "#b9c4d4", "#e2243a"], 2.8);
    }
  }

  // ------------------------------------------------------------------ enemies
  function updateEnemies(dt) {
    const { cy } = heroBox();
    for (const e of enemies) {
      e.t += dt;
      if (e.kind === "gull") {
        e.x -= e.vx;
        e.y = e.baseY + Math.sin(e.t * e.freq) * e.amp;
      } else if (e.kind === "spider") {
        // the anchor slides along with the scenery while he swings under it
        e.x -= e.vx;
        e.progress = Math.min(1, e.progress + dt / e.duration);
        e.angle = e.swing * Math.cos(Math.PI * e.progress);
        e.anchorX = e.x + e.def.w / 2;
        const hx = e.anchorX + Math.sin(e.angle) * e.rope;
        const hy = e.anchorY + Math.cos(e.angle) * e.rope;
        e.handX = hx;
        e.handY = hy;
        e.drawX = hx - e.def.w / 2;
        e.drawY = hy;
        e.hitX = e.drawX;
        e.hitY = hy + 6;
      } else {
        e.x -= e.vx;
        const dy = cy - (e.y + e.def.h / 2);
        e.y += Math.max(-e.chase, Math.min(e.chase, dy));
        e.y = Math.max(16, Math.min(GROUND_Y - e.def.h - 8, e.y));
      }

      if (!e.scored && e.x + e.def.w < HERO_X) {
        e.scored = true;
        game.score++;
        Sfx.score();
        popup("+1", HERO_X + 26, hero.y - 6, COLORS.paper);
        checkLevel();
      }
    }
    enemies = enemies.filter((e) => e.x + e.def.w > -40);

    for (const b of bonuses) {
      b.t += dt;
      b.x -= b.vx;
      b.y = b.baseY + Math.sin(b.t * 1.7) * b.amp;
    }
    bonuses = bonuses.filter((b) => !b.taken && b.x + b.w > -40);
  }

  function collectBonuses() {
    const { cx, cy } = heroBox();
    for (const b of bonuses) {
      if (b.taken) continue;
      if (circleRect(cx, cy, HERO_R + 4, b.x + 5, b.y + 5, b.w - 10, b.h - 10)) takeLife(b);
    }
    bonuses = bonuses.filter((b) => !b.taken);
  }

  // ------------------------------------------------------------------- update
  function update(dt) {
    game.time += dt;
    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt);
    if (game.flash > 0) game.flash = Math.max(0, game.flash - dt * 2.4);

    // How fast the scenery slides this frame; clouds drift on top of it.
    let scrollSpeed = 0;
    if (game.state === STATE.TITLE || game.state === STATE.BOARD ||
        game.state === STATE.COLLECTION) scrollSpeed = speed() * 0.6;
    else if (game.state === STATE.PLAY) scrollSpeed = speed();
    game.scroll += scrollSpeed;
    updateSky(dt, scrollSpeed);

    if (game.state === STATE.LOADING) {
      loading.timer += dt;
      hero.y = 182 + Math.sin(game.time * 3) * 5;
      hero.angle = Math.sin(game.time * 3) * 0.1;
      // a short floor so the bar is readable, and a ceiling so a stuck image
      // can never keep the game from starting
      if ((loadingProgress() >= 1 && loading.timer > 0.45) || loading.timer > 12) {
        finishLoading();
      }
    } else if (game.state === STATE.TITLE || game.state === STATE.BOARD ||
        game.state === STATE.COLLECTION) {
      hero.y = 138 + Math.sin(game.time * 3) * 6;
      hero.angle = Math.sin(game.time * 3) * 0.12;
    } else if (game.state === STATE.PLAY) {
      hero.vy = Math.min(MAX_FALL, hero.vy + GRAVITY);
      hero.y += hero.vy;
      hero.angle = Math.max(-0.5, Math.min(1.5, hero.vy * 0.09));

      if (hero.y < -HERO_SIZE) { hero.y = -HERO_SIZE; hero.vy = 0; }

      const last = obstacles[obstacles.length - 1];
      if (!last || last.x < W - last.spacing) spawnObstacle();

      for (const o of obstacles) {
        o.x -= speed();
        if (!o.scored && o.x + COLA_W < HERO_X) {
          o.scored = true;
          game.score++;
          Sfx.score();
          popup("+1", HERO_X + 26, hero.y - 6, COLORS.paper);
          checkLevel();
        }
      }
      obstacles = obstacles.filter((o) => o.x + COLA_W > -10);

      // flying enemies, unlocked one kind at a time as the score grows
      game.enemyTimer -= dt;
      if (game.enemyTimer <= 0) {
        game.enemyTimer = Math.max(2.2, 5.5 - game.score * 0.07) + Math.random() * 2;
        const kind = pickEnemyKind();
        if (kind && enemies.length < (game.score >= 25 ? 4 : 3)) spawnEnemy(kind);
      }

      // Katy shows up regularly while there is a life to win
      game.katyTimer -= dt;
      if (game.katyTimer <= 0) {
        game.katyTimer = 11 + Math.random() * 7;
        if (!bonuses.length) spawnBonus();
      }

      updateEnemies(dt);
      collectBonuses();

      if (game.invuln > 0) game.invuln = Math.max(0, game.invuln - dt);
      const hit = game.invuln > 0 ? null : heroHits();
      if (hit) {
        if (game.lives > 1) survivedHit(hit);
        else die(hit.kind);
      } else if (hero.y + HERO_SIZE >= GROUND_Y) {
        die("ground");
      }
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
    } else if (game.state === STATE.CHECKPOINT) {
      game.checkpointTimer += dt;
    }

    if (hero.squash > 0) hero.squash = Math.max(0, hero.squash - dt * 4.5);

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
    ctx.fillRect(246, 24, 24, 32);
    ctx.fillRect(242, 28, 32, 24);
    ctx.fillRect(238, 34, 40, 12);
    const pulse = Math.sin(game.time * 1.6) > 0 ? 1 : 0;
    ctx.fillStyle = COLORS.sunCore;
    ctx.fillRect(250 - pulse, 30 - pulse, 12 + pulse * 2, 12 + pulse * 2);

    for (const c of clouds) drawCloud(c);
    for (const b of birds) drawBird(b);
    drawTiled(mountainLayer, game.scroll * 0.3, GROUND_Y - 190);
    drawTiled(cityLayer, game.scroll * 0.46, GROUND_Y - 96);

    // lake strip in front of the city
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(0, GROUND_Y - 26, W, 26);
    ctx.fillStyle = COLORS.waterLight;
    const wobble = Math.floor(game.scroll * 0.6);
    for (let x = 0; x < W; x += 16) {
      const px = (x - wobble % 16 + W) % W;
      const lane = (x / 16) % 2;
      const dy = Math.round(Math.sin(game.time * 2.2 + x * 0.35) * 1.5);
      ctx.fillRect(px, GROUND_Y - 20 + lane * 8 + dy, 7, 2);
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

    // lower bottle stands up, with the label facing the player
    ctx.drawImage(colaCap, x, bottomStart);
    drawText(ctx, "cola", x + COLA_W / 2, bottomStart + 62, {
      scale: 1, color: "#ffffff", align: "center",
    });
    const bodyTop = bottomStart + CAP_H;
    if (bodyTop < GROUND_Y) ctx.drawImage(colaBody, x, bodyTop, COLA_W, GROUND_Y - bodyTop);
  }

  function drawHero(atX) {
    if (!heroReady) return;
    // blink while the extra-life shield is still up
    if (game.invuln > 0 && Math.floor(game.time * 14) % 2 === 0) return;
    const cx = (atX === undefined ? HERO_X : atX) + HERO_SIZE / 2;
    const cy = hero.y + HERO_SIZE / 2;
    // quantise the rotation so the sprite keeps its pixel grid
    const step = Math.PI / 12;
    const angle = Math.round(hero.angle / step) * step;
    // stretch upwards right after a flap, then settle back
    const squash = Math.sin(hero.squash * Math.PI) * 0.16;
    const w = Math.round(HERO_SIZE * (1 - squash));
    const h = Math.round(HERO_SIZE * (1 + squash));
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.rotate(angle);
    ctx.drawImage(heroImg, -Math.round(w / 2), -Math.round(h / 2), w, h);
    ctx.restore();
  }

  function drawEnemy(e) {
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    if (e.kind === "gull") {
      const frame = Math.floor(e.t * 7) % 2;
      ctx.drawImage(gullFrames[frame], x, y);
    } else if (e.kind === "spider") {
      if (e.handX === undefined) return;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(e.anchorX) + 0.5, 0);
      ctx.lineTo(Math.round(e.handX) + 0.5, Math.round(e.handY) + 2);
      ctx.stroke();
      // quantised rotation so he leans into the swing without smearing pixels
      const step = Math.PI / 12;
      const angle = Math.round(e.angle / step) * step;
      ctx.save();
      ctx.translate(Math.round(e.handX), Math.round(e.handY));
      ctx.rotate(-angle);
      ctx.drawImage(spiderSprite, -spiderSprite.width / 2, 0);
      ctx.restore();
    } else {
      const frame = Math.floor(e.t * 16) % 2;
      ctx.drawImage(droneFrames[frame], x, y);
    }
  }

  function drawBonus(b) {
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    const bob = Math.sin(b.t * 3) > 0 ? 0 : 1;

    // sparkles so a pickup never reads as another enemy
    ctx.fillStyle = "rgba(255,212,71,0.9)";
    for (let i = 0; i < 3; i++) {
      const a = b.t * 2 + i * 2.1;
      const sx = Math.round(x + b.w / 2 + Math.cos(a) * (b.w / 2 + 6));
      const sy = Math.round(y + b.h / 2 + Math.sin(a) * (b.h / 2 + 2));
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.drawImage(b.kind === "katy" ? katySprite : macSprite, x, y + bob);
    const hy = Math.round(y - 14 + Math.sin(b.t * 4) * 2);
    ctx.drawImage(heartSprite, Math.round(x + b.w / 2 - heartSprite.width / 2), hy);
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
      drawText(ctx, t.text, t.x, t.y, {
        scale: t.scale, color: t.color, align: "center", outline: COLORS.ink,
      });
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ buttons
  // Rebuilt from the current state, so the same list drives drawing and taps.
  function uiButtons() {
    if (game.dialogOpen || game.state === STATE.LOADING) return [];
    if (game.paused) {
      return [{ id: "resume", x: 60, y: 268, w: 200, h: 32, label: "продолжить", primary: true }];
    }
    if (game.state === STATE.TITLE) {
      return [
        { id: "play", x: 60, y: 300, w: 200, h: 32, label: "играть", primary: true, scale: 2 },
        { id: "board", x: 24, y: 340, w: 84, h: 26, label: "рейтинг" },
        { id: "collection", x: 118, y: 340, w: 84, h: 26, label: "лёши" },
        { id: "name", x: 212, y: 340, w: 84, h: 26, label: "имя" },
      ];
    }
    if (game.state === STATE.OVER) {
      return [
        { id: "again", x: 60, y: 300, w: 200, h: 32, label: "ещё раз", primary: true, scale: 2 },
        { id: "board", x: 59, y: 340, w: 96, h: 26, label: "рейтинг" },
        { id: "collection", x: 165, y: 340, w: 96, h: 26, label: "лёши" },
      ];
    }
    if (game.state === STATE.COLLECTION) {
      const list = [{ id: "back", x: 90, y: 428, w: 140, h: 28, label: "назад", primary: true }];
      if (!game.collectionPick) {
        // every found photo is tappable, so you can look at it properly
        for (const cell of collectionCells()) {
          if (Collection.has(cell.slot)) {
            list.push({
              id: "cell:" + cell.slot, x: cell.x, y: cell.y,
              w: cell.cell, h: cell.cell, invisible: true,
            });
          }
        }
      }
      return list;
    }
    if (game.state === STATE.CHECKPOINT) {
      return game.checkpointTimer > 0.5
        ? [{ id: "continue", x: 60, y: 432, w: 200, h: 30, label: "дальше", primary: true }]
        : [];
    }
    if (game.state === STATE.BOARD) {
      return [
        { id: "back", x: 44, y: 404, w: 130, h: 28, label: "назад", primary: true },
        { id: "refresh", x: 182, y: 404, w: 94, h: 28, label: "обновить" },
      ];
    }
    // during play only the two small corner toggles are tappable
    return [
      { id: "pause", x: W - 58, y: 8, w: 22, h: 22, icon: "pause" },
      { id: "sound", x: W - 30, y: 8, w: 22, h: 22, icon: "sound" },
    ];
  }

  function onButton(id) {
    Sfx.unlock();
    if (id !== "sound") Sfx.swoosh();
    if (id.indexOf("cell:") === 0) { game.collectionPick = id.slice(5); return; }
    if (id === "play" || id === "again") { game.paused = false; press(); }
    else if (id === "board") openBoard();
    else if (id === "back") { if (game.state === STATE.COLLECTION) closeCollection(); else closeBoard(); }
    else if (id === "collection") openCollection();
    else if (id === "continue") leaveCheckpoint();
    else if (id === "refresh") loadBoard(true);
    else if (id === "name") askName(false);
    else if (id === "pause") game.paused = true;
    else if (id === "resume") game.paused = false;
    else if (id === "sound") Sfx.toggleMute();
  }

  function drawButton(b) {
    if (b.invisible) return;       // tap targets over the collection grid
    if (b.icon) {
      ctx.fillStyle = "rgba(26,16,36,0.45)";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = COLORS.paper;
      if (b.icon === "pause") {
        ctx.fillRect(b.x + 6, b.y + 5, 4, 12);
        ctx.fillRect(b.x + 12, b.y + 5, 4, 12);
      } else {
        ctx.fillRect(b.x + 5, b.y + 8, 4, 6);
        ctx.fillRect(b.x + 9, b.y + 5, 3, 12);
        if (Sfx.isMuted()) {
          ctx.fillStyle = "#ff5a5a";
          ctx.fillRect(b.x + 4, b.y + 4, 14, 2);
        } else {
          ctx.fillRect(b.x + 14, b.y + 7, 2, 8);
        }
      }
      return;
    }
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    ctx.fillStyle = b.primary ? "#ff3ea5" : COLORS.paper;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.primary ? "#c41f77" : "#e4d5b4";
    ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3);
    const scale = b.scale || 1;
    drawText(ctx, b.label, b.x + b.w / 2, b.y + Math.round((b.h - 7 * scale) / 2) - 1, {
      scale: scale, color: b.primary ? "#ffffff" : COLORS.ink, align: "center",
    });
  }

  function drawButtons() {
    for (const b of uiButtons()) drawButton(b);
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
      for (let i = 0; i < game.lives; i++) {
        ctx.drawImage(heartSprite, 8 + i * 18, 10);
      }
      const label = String(game.score);
      const tw = textWidth(label, 4);
      ctx.fillStyle = "rgba(26,16,36,0.32)";
      ctx.fillRect(Math.round(W / 2 - tw / 2) - 8, 32, tw + 16, 44);
      drawText(ctx, label, W / 2, 40, {
        scale: 4, color: COLORS.paper, align: "center", outline: COLORS.ink,
      });
    }
  }

  function drawTitle() {
    drawText(ctx, "flappy", W / 2, 62, { scale: 4, color: "#ffd447", align: "center", outline: COLORS.ink });
    drawText(ctx, "lesha", W / 2, 96, { scale: 4, color: "#ff3ea5", align: "center", outline: COLORS.ink });

    drawHero(W / 2 - HERO_SIZE / 2);
    drawText(ctx, "игрок: " + (game.player || "..."), W / 2, 176, {
      scale: 1, color: COLORS.paper, align: "center", outline: COLORS.ink,
    });

    panel(38, 186, W - 76, 110);
    drawText(ctx, "враги", W / 2, 192, { scale: 1, color: COLORS.ink, align: "center" });
    const icons = [
      [colaTiny, "кола"],
      [gullTiny, "чайка"],
      [spiderTiny, "паук"],
      [droneTiny, "дрон"],
    ];
    icons.forEach(([img, label], i) => {
      const cx = W / 2 + (i - (icons.length - 1) / 2) * 58;
      ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(220 - img.height / 2));
      drawText(ctx, label, cx, 238, { scale: 1, color: COLORS.ink, align: "center" });
    });
    ctx.fillStyle = "#e4d5b4";
    ctx.fillRect(48, 246, W - 96, 2);
    ctx.drawImage(katyTiny, 52, 252);
    ctx.drawImage(macTiny, 74, 258);
    drawText(ctx, "кэти и макдак дают", 96, 256, { scale: 1, color: COLORS.ink });
    drawText(ctx, "дополнительную жизнь", 96, 268, { scale: 1, color: "#c41f77" });

    drawText(ctx, "пробел / тап - взмах", W / 2, 374, {
      scale: 1, color: COLORS.paper, align: "center", outline: COLORS.ink,
    });
    drawText(ctx, "твой рекорд: " + game.best, W / 2, 388, {
      scale: 1, color: "#ffd447", align: "center", outline: COLORS.ink,
    });
  }

  // ------------------------------------------------------------ leaderboard
  function boardRow(place, name, score, y, mine) {
    if (mine) {
      ctx.fillStyle = "rgba(255,62,165,0.25)";
      ctx.fillRect(26, y - 5, W - 52, 23);
    }
    const color = mine ? "#c41f77" : COLORS.ink;
    drawText(ctx, place, 34, y, { scale: 2, color: color });
    drawText(ctx, String(name).slice(0, Scores.MAX_NAME), 86, y, { scale: 2, color: color });
    drawText(ctx, String(score), W - 34, y, { scale: 2, color: color, align: "right" });
  }

  function drawBoard() {
    ctx.fillStyle = "rgba(26,16,36,0.55)";
    ctx.fillRect(0, 0, W, H);

    drawText(ctx, "рейтинг", W / 2, 18, { scale: 3, color: "#ffd447", align: "center", outline: COLORS.ink });
    const badge = game.board.source === "cloud"
      ? "общий топ игроков"
      : (Scores.online ? "нет связи с сервером" : "рейтинг выключен");
    drawText(ctx, badge, W / 2, 48, {
      scale: 1, color: game.board.source === "cloud" ? "#9fe8a0" : "#ffb3b3",
      align: "center", outline: COLORS.ink,
    });

    panel(20, 64, W - 40, 330);

    const rows = game.board.rows || [];
    const me = (game.player || "").toUpperCase();
    if (game.board.loading && !rows.length) {
      drawText(ctx, Math.floor(game.time * 2) % 2 ? "загрузка" : "загрузка.", W / 2, 210,
        { scale: 2, color: COLORS.ink, align: "center" });
    } else if (!rows.length) {
      const offline = game.board.source !== "cloud";
      drawText(ctx, offline ? "нет связи" : "пока пусто", W / 2, 196,
        { scale: 2, color: COLORS.ink, align: "center" });
      drawText(ctx, offline ? "нажми обновить" : "стань первым!", W / 2, 224,
        { scale: 1, color: COLORS.ink, align: "center" });
    } else {
      const shown = rows.slice(0, 11);
      let myPlace = -1;
      rows.forEach((r, i) => {
        if (myPlace < 0 && String(r.player).toUpperCase() === me) myPlace = i;
      });
      shown.forEach((r, i) => {
        boardRow("#" + (i + 1), r.player, r.score, 78 + i * 26,
          String(r.player).toUpperCase() === me);
      });
      const footY = 78 + Math.max(shown.length, 4) * 26 + 8;
      if (footY < 380) {
        ctx.fillStyle = "#e4d5b4";
        ctx.fillRect(30, footY - 6, W - 60, 2);
        let mine;
        if (myPlace >= 0 && myPlace < shown.length) {
          mine = "ты на " + (myPlace + 1) + " месте";
        } else if (game.rank) {
          mine = "ты: #" + game.rank + "  -  " + game.best;
        } else if (myPlace >= 0) {
          mine = "ты: #" + (myPlace + 1) + "  -  " + rows[myPlace].score;
        } else {
          mine = "тебя тут ещё нет";
        }
        drawText(ctx, mine, W / 2, footY + 2, { scale: 1, color: COLORS.ink, align: "center" });
      }
    }
  }

  // A polaroid on top of the frozen game: the photo is drawn smoothly, the
  // frame around it stays pixel art like everything else.
  function drawCheckpoint() {
    const cp = currentCheckpoint();
    if (!cp) return;

    ctx.fillStyle = "rgba(20,12,30,0.72)";
    ctx.fillRect(0, 0, W, H);

    if (cp.isNew) {
      const blink = Math.floor(game.time * 4) % 2 === 0;
      drawText(ctx, "новый лёша!", W / 2, 40, {
        scale: 3, color: blink ? "#ffd447" : "#fff3ad", align: "center", outline: COLORS.ink,
      });
      drawText(ctx, "добавлен в коллекцию", W / 2, 78, {
        scale: 1, color: "#9fe8a0", align: "center", outline: COLORS.ink,
      });
    } else {
      drawText(ctx, "чекпоинт", W / 2, 44, {
        scale: 3, color: "#ffd447", align: "center", outline: COLORS.ink,
      });
      drawText(ctx, game.score + " очков", W / 2, 80, {
        scale: 2, color: COLORS.paper, align: "center", outline: COLORS.ink,
      });
    }

    const fx = 32;
    const fy = 104;
    const fw = W - 64;
    const px = fx + 10;
    const py = fy + 10;
    const pw = fw - 20;

    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(fx - 3, fy - 3, fw + 6, pw + 62 + 6);
    ctx.fillStyle = "#fffdf6";
    ctx.fillRect(fx, fy, fw, pw + 62);

    drawPhoto(cp.slot, px, py, pw);
    ctx.strokeStyle = "rgba(26,16,36,0.35)";
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, pw - 1);

    drawText(ctx, cp.title, W / 2, py + pw + 12, {
      scale: titleScale(cp.title, fw - 16), color: COLORS.ink, align: "center",
    });
    if (!cp.isNew) {
      drawText(ctx, cp.cheer, W / 2, py + pw + 34, {
        scale: 1, color: "#c41f77", align: "center",
      });
    }

  }

  // "Коллекция Лёш": a grid of finds, tap one to see it big.
  const GRID_Y = 92;

  // Three big tiles per row while they fit, four smaller ones once the
  // collection outgrows three rows.
  function gridLayout() {
    const count = Collection.all().length;
    const cols = count > 9 ? 4 : 3;
    const cell = cols === 3 ? 84 : 62;
    const gap = 10;
    return {
      cols: cols,
      cell: cell,
      x: (W - (cell * cols + gap * (cols - 1))) / 2,
      step: cell + gap,
      rowStep: cell + 22,
    };
  }

  function collectionCells() {
    const g = gridLayout();
    return Collection.all().map((slot, i) => ({
      slot: slot,
      cell: g.cell,
      x: g.x + (i % g.cols) * g.step,
      y: GRID_Y + Math.floor(i / g.cols) * g.rowStep,
    }));
  }

  function drawCollection() {
    ctx.fillStyle = "rgba(20,12,30,0.72)";
    ctx.fillRect(0, 0, W, H);

    drawText(ctx, "коллекция лёш", W / 2, 20, {
      scale: 2, color: "#ffd447", align: "center", outline: COLORS.ink,
    });
    const all = Collection.all();
    drawText(ctx, "найдено " + Collection.count() + " из " + all.length, W / 2, 48, {
      scale: 1, color: COLORS.paper, align: "center", outline: COLORS.ink,
    });
    drawText(ctx, Collection.loaded() ? "новые попадаются на чекпоинтах" : "нет связи с сервером", W / 2, 64, {
      scale: 1, color: Collection.loaded() ? "#b9a9d6" : "#ffb3b3", align: "center", outline: COLORS.ink,
    });

    if (game.collectionPick) {
      const slot = game.collectionPick;
      const fx = 32;
      const fy = 96;
      const fw = W - 64;
      const pw = fw - 20;
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(fx - 3, fy - 3, fw + 6, pw + 62 + 6);
      ctx.fillStyle = "#fffdf6";
      ctx.fillRect(fx, fy, fw, pw + 62);
      drawPhoto(slot, fx + 10, fy + 10, pw);
      const title = photoTitle(slot);
      drawText(ctx, title, W / 2, fy + pw + 22, {
        scale: titleScale(title, fw - 16), color: COLORS.ink, align: "center",
      });
      return;
    }

    for (const cell of collectionCells()) {
      const size = cell.cell;
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(cell.x - 2, cell.y - 2, size + 4, size + 4);
      if (Collection.has(cell.slot)) {
        ctx.fillStyle = "#fffdf6";
        ctx.fillRect(cell.x, cell.y, size, size);
        drawPhoto(cell.slot, cell.x + 3, cell.y + 3, size - 6);
        drawText(ctx, photoName(cell.slot), cell.x + size / 2, cell.y + size + 5, {
          scale: 1, color: COLORS.paper, align: "center", outline: COLORS.ink,
        });
      } else {
        ctx.fillStyle = "#2c1b44";
        ctx.fillRect(cell.x, cell.y, size, size);
        drawText(ctx, "?", cell.x + size / 2, cell.y + size / 2 - 14, {
          scale: 4, color: "#5a4577", align: "center",
        });
        drawText(ctx, "не найден", cell.x + size / 2, cell.y + size + 5, {
          scale: 1, color: "#8a77ad", align: "center",
        });
      }
    }
  }

  function drawGameOver() {
    drawText(ctx, "игра окончена", W / 2, 96, {
      scale: 3, color: "#ff5a5a", align: "center", outline: COLORS.ink,
    });

    panel(50, 132, W - 100, 152);
    drawText(ctx, game.player || "игрок", W / 2, 142, { scale: 1, color: "#c41f77", align: "center" });

    drawText(ctx, "счёт", 66, 162, { scale: 1, color: COLORS.ink });
    drawText(ctx, String(game.score), W - 66, 158, { scale: 2, color: COLORS.ink, align: "right" });
    drawText(ctx, "рекорд", 66, 190, { scale: 1, color: COLORS.ink });
    drawText(ctx, String(game.best), W - 66, 186, { scale: 2, color: COLORS.ink, align: "right" });

    drawText(ctx, "место", 66, 218, { scale: 1, color: COLORS.ink });
    if (game.submitting) {
      drawText(ctx, "...", W - 66, 214, { scale: 2, color: "#c41f77", align: "right" });
    } else if (game.rank) {
      drawText(ctx, "#" + game.rank, W - 66, 214, { scale: 2, color: "#c41f77", align: "right" });
    } else {
      drawText(ctx, "нет связи", W - 66, 220, { scale: 1, color: "#c0182f", align: "right" });
    }

    const medal = medalFor(game.score);
    if (medal) {
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(64, 242, 22, 22);
      ctx.fillStyle = medal.dark;
      ctx.fillRect(66, 244, 18, 18);
      ctx.fillStyle = medal.color;
      ctx.fillRect(68, 246, 14, 14);
      ctx.fillStyle = medal.dark;
      ctx.fillRect(72, 250, 6, 6);
      drawText(ctx, medal.name, 96, 250, { scale: 1, color: COLORS.ink });
    } else {
      drawText(ctx, "10 очков - бронза", 66, 250, { scale: 1, color: COLORS.ink });
    }

    if (game.overTimer > 0.6 && Math.floor(game.time * 2) % 2 === 0) {
      drawText(ctx, "пробел / тап - ещё раз", W / 2, 382, {
        scale: 1, color: COLORS.paper, align: "center", outline: COLORS.ink,
      });
    }
  }

  function drawLoading() {
    drawText(ctx, "flappy", W / 2, 120, { scale: 4, color: "#ffd447", align: "center", outline: COLORS.ink });
    drawText(ctx, "lesha", W / 2, 156, { scale: 4, color: "#ff3ea5", align: "center", outline: COLORS.ink });

    drawHero(W / 2 - HERO_SIZE / 2);

    const bw = 200;
    const bx = (W - bw) / 2;
    const by = 240;
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(bx - 3, by - 3, bw + 6, 22);
    ctx.fillStyle = "#2c1b44";
    ctx.fillRect(bx, by, bw, 16);
    ctx.fillStyle = "#ff3ea5";
    ctx.fillRect(bx, by, Math.round(bw * loadingProgress()), 16);
    ctx.fillStyle = "#ffd447";
    ctx.fillRect(bx, by, Math.round(bw * loadingProgress()), 4);

    drawText(ctx, "загрузка " + Math.round(loadingProgress() * 100) + "%", W / 2, 272, {
      scale: 1, color: COLORS.paper, align: "center", outline: COLORS.ink,
    });
    drawText(ctx, "готовим лёш", W / 2, 292, {
      scale: 1, color: "#b9a9d6", align: "center", outline: COLORS.ink,
    });
  }

  function render() {
    ctx.save();
    if (game.shake > 0) {
      ctx.translate(Math.round((Math.random() - 0.5) * game.shake * 12),
        Math.round((Math.random() - 0.5) * game.shake * 12));
    }

    drawBackground();
    for (const o of obstacles) drawBottle(o);
    for (const e of enemies) drawEnemy(e);
    for (const b of bonuses) drawBonus(b);
    if (game.state !== STATE.TITLE && game.state !== STATE.BOARD &&
        game.state !== STATE.COLLECTION && game.state !== STATE.LOADING) drawHero();
    drawParticles();
    drawTiled(groundTile, game.scroll, GROUND_Y);
    drawPopups();

    if (game.state === STATE.LOADING) drawLoading();
    if (game.state === STATE.TITLE) drawTitle();
    if (game.state === STATE.OVER) drawGameOver();
    if (game.state === STATE.BOARD) drawBoard();
    if (game.state === STATE.CHECKPOINT) drawCheckpoint();
    if (game.state === STATE.COLLECTION) drawCollection();
    drawHud();
    if (!game.paused) drawButtons();

    if (game.paused) {
      ctx.fillStyle = "rgba(26,16,36,0.6)";
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, "пауза", W / 2, 220, { scale: 3, color: COLORS.paper, align: "center", outline: COLORS.ink });
      drawButtons();
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
    if (game.dialogOpen || game.paused || game.state === STATE.LOADING) return;
    if (game.state === STATE.BOARD) { closeBoard(); return; }
    if (game.state === STATE.CHECKPOINT) {
      if (game.checkpointTimer > 0.5) leaveCheckpoint();
      return;
    }
    if (game.state === STATE.COLLECTION) { closeCollection(); return; }
    if (!game.player) { askName(true); return; }

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

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    };
  }

  function buttonAt(point) {
    // generous hit area so small taps still land on phones
    return uiButtons().find((b) =>
      point.x >= b.x - 6 && point.x <= b.x + b.w + 6 &&
      point.y >= b.y - 6 && point.y <= b.y + b.h + 6);
  }

  window.addEventListener("keydown", (e) => {
    if (game.dialogOpen) return;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Enter") {
      e.preventDefault();
      press();
    } else if (e.code === "KeyM") {
      Sfx.unlock();
      Sfx.toggleMute();
    } else if (e.code === "KeyP") {
      game.paused = !game.paused;
    } else if (e.code === "KeyR") {
      if (!game.dialogOpen) reset();
    } else if (e.code === "KeyC") {
      if (!game.dialogOpen) { if (game.state === STATE.COLLECTION) closeCollection(); else openCollection(); }
    } else if (e.code === "KeyL") {
      if (!game.dialogOpen) { if (game.state === STATE.BOARD) closeBoard(); else openBoard(); }
    } else if (e.code === "KeyN") {
      askName(false);
    } else if (e.code === "Escape") {
      if (game.state === STATE.COLLECTION) closeCollection();
      else if (game.state === STATE.BOARD) closeBoard();
      else if (game.paused) game.paused = false;
    }
  });
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (game.dialogOpen) return;
    const hit = buttonAt(canvasPoint(e));
    if (hit) { onButton(hit.id); return; }
    press();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("blur", () => {
    if (game.state === STATE.PLAY && !game.dialogOpen) game.paused = true;
  });

  // ------------------------------------------------------------------ scaling
  function resize() {
    // Phones get the full screen; desktops keep a whole-number zoom so every
    // game pixel stays a perfect square.
    const compact = window.matchMedia("(pointer: coarse), (max-height: 620px)").matches;
    const viewportH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const availW = Math.max(160, window.innerWidth - (compact ? 0 : 16));
    const availH = Math.max(240, viewportH - (compact ? 0 : 96));
    let scale = Math.min(availW / W, availH / H);
    if (!compact && scale >= 1) scale = Math.floor(scale);
    scale = Math.max(scale, 0.25);
    const cssW = Math.round(W * scale);
    canvas.style.width = cssW + "px";
    canvas.style.height = Math.round(H * scale) + "px";
    setBacking((cssW * (window.devicePixelRatio || 1)) / W);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 150));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
  resize();

  // --------------------------------------------------------------------- boot
  seedClouds();
  game.player = Scores.getName();
  syncProfile();
  loadBoard(false);
  // the name dialog waits until the photos are in - see finishLoading()

  // Small hook so the game can be driven from a script (used by the smoke test).
  window.FlappyLesha = {
    STATE: STATE,
    game: game,
    hero: hero,
    obstacles: () => obstacles,
    enemies: () => enemies,
    bonuses: () => bonuses,
    katies: () => bonuses,
    press: press,
    spawnEnemy: spawnEnemy,
    spawnBonus: spawnBonus,
    button: onButton,
    buttons: uiButtons,
    askName: askName,
    openBoard: openBoard,
    checkpoint: currentCheckpoint,
    pickPhoto: pickCheckpointPhoto,
    openCollection: openCollection,
    sync: syncProfile,
    collection: () => Collection,
    loading: () => ({ total: loading.total, done: loading.done, progress: loadingProgress() }),
    loadBoard: loadBoard,
    gapSize: gapSize,
    speed: speed,
    spacing: spacing,
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
