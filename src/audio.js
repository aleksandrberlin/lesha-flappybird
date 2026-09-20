// Tiny chiptune sound engine: square/triangle blips and a noise burst,
// everything generated at runtime so the game stays dependency free.
const Sfx = (function () {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    return ctx;
  }

  // A single square-wave note with a fast decay envelope.
  function tone(freq, dur, opts) {
    const o = opts || {};
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), t0 + dur);
    const vol = o.vol === undefined ? 0.5 : o.vol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const node = ctx.createBufferSource();
    node.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    const gain = ctx.createGain();
    gain.gain.value = vol === undefined ? 0.5 : vol;
    node.connect(filter).connect(gain).connect(master);
    node.start(t0);
  }

  return {
    unlock: ensure,
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      if (muted && ctx) master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.01);
      else if (ctx) master.gain.setTargetAtTime(0.22, ctx.currentTime, 0.01);
      return muted;
    },
    flap() { tone(520, 0.1, { to: 760, vol: 0.35 }); },
    score() { tone(660, 0.07, { vol: 0.4 }); tone(880, 0.1, { vol: 0.4, delay: 0.07 }); },
    cola() { tone(180, 0.18, { to: 90, type: "sawtooth", vol: 0.35 }); noise(0.25, 0.35); },
    katy() { // a little pop-diva glissando when she shows up
      tone(523, 0.09, { vol: 0.3, type: "triangle" });
      tone(659, 0.09, { vol: 0.3, type: "triangle", delay: 0.09 });
      tone(880, 0.16, { vol: 0.3, type: "triangle", delay: 0.18 });
    },
    hit() { tone(140, 0.22, { to: 60, vol: 0.5 }); noise(0.2, 0.5); },
    die() {
      tone(400, 0.12, { to: 300, vol: 0.4 });
      tone(300, 0.12, { to: 200, vol: 0.4, delay: 0.12 });
      tone(200, 0.3, { to: 70, vol: 0.4, delay: 0.24 });
    },
    swoosh() { tone(300, 0.08, { to: 520, type: "triangle", vol: 0.25 }); },
    life() { // Katy hands over a heart
      tone(523, 0.08, { vol: 0.35 });
      tone(784, 0.08, { vol: 0.35, delay: 0.08 });
      tone(1046, 0.18, { vol: 0.35, delay: 0.16 });
    },
    shield() { // a hit that cost a life but was survived
      tone(220, 0.16, { to: 120, vol: 0.45 });
      noise(0.22, 0.4);
    },
    levelUp() { // the world just got faster
      tone(392, 0.09, { vol: 0.3 });
      tone(523, 0.09, { vol: 0.3, delay: 0.09 });
      tone(659, 0.09, { vol: 0.3, delay: 0.18 });
      tone(880, 0.2, { vol: 0.32, delay: 0.27 });
    },
  };
})();
