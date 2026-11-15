/* =========================
   Party 聯機網站 — 背景音樂（Web Audio 即場合成，唔使音檔）
   用法：BGM.play("pixel")／BGM.stop()
   pixel（Pixel Lounge）：首頁＋等候室
   每首係 16 小節，播完無縫重頭。
========================= */
(function () {
  let ctx = null, out = null, bus = null;
  let volume = 0.5, muted = false;
  let cur = null, timer = null, step = 0, nextTime = 0;

  try {
    muted = localStorage.getItem("bgmMuted") === "1";
    const v = parseFloat(localStorage.getItem("bgmVolume"));
    if (!isNaN(v)) volume = v;
  } catch (e) {}

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 0;
      out.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // 每首歌自己一條 bus（方便加濾波），淡入淡出喺 out 做
  function newBus(lowpass) {
    const g = ctx.createGain();
    g.gain.value = 1;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = lowpass; f.Q.value = 0.5;
      g.connect(f).connect(out);
    } else g.connect(out);
    return g;
  }

  /* ---------- 樂器 ---------- */
  let pulseWave = null;
  function pulse25() {
    if (pulseWave) return pulseWave;
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    return (pulseWave = ctx.createPeriodicWave(re, im));
  }

  function env(t, dur, peak, a = 0.005, r = 0.05) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, Math.max(t + a, t + dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(bus);
    return g;
  }

  function osc(t, f, dur, type, peak, o = {}) {
    const s = ctx.createOscillator();
    if (type === "pulse") s.setPeriodicWave(pulse25()); else s.type = type;
    s.frequency.setValueAtTime(f, t);
    if (o.detune) s.detune.value = o.detune;
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib; lg.gain.value = f * 0.006;
      l.connect(lg).connect(s.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    s.connect(env(t, dur, peak, o.a, o.r));
    s.start(t); s.stop(t + dur + 0.05);
  }

  let noiseBuf = null;
  function noise(t, dur, peak, type, freq, q = 1) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f).connect(env(t, dur, peak, 0.002, dur * 0.8));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  function kick(t, peak) {
    const s = ctx.createOscillator();
    s.frequency.setValueAtTime(140, t);
    s.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    s.connect(env(t, 0.18, peak, 0.002, 0.15));
    s.start(t); s.stop(t + 0.25);
  }

  /* ---------- 旋律寫法：每格一個八分音符，"-" 延長，0 休止 ---------- */
  const N = { C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84, D6: 86, E6: 88 };
  function parse(str) {
    const tok = str.trim().split(/\s+/), notes = [];
    tok.forEach((x, i) => {
      if (x === "-" || x === "0") return;
      let len = 1;
      while (tok[i + len] === "-") len++;
      notes[i] = { m: N[x], len };
    });
    return notes;
  }

  /* ========== 曲 1：Pixel Lounge（8-bit，輕鬆）========== */
  const PIXEL = (() => {
    const bpm = 92, chords = [
      [48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50],
      [48, 52, 55], [45, 48, 52], [50, 53, 57], [43, 47, 50]
    ];
    const melA = parse(`
      E5 - G5 - C6 - G5 -   A5 - - G5 E5 - - -   F5 - A5 - C6 - A5 G5   G5 - - - D5 - - -
      E5 - G5 - C6 - D6 -   E6 - D6 C6 A5 - - -  F5 - A5 - D6 - C6 A5   B5 - - - G5 - - -`);
    const melB = parse(`
      C6 - - B5 C6 - G5 -   A5 - - - E5 - G5 -   A5 - G5 - F5 - C5 -    D5 - - E5 G5 - - -
      G5 - E5 - G5 - C6 -   B5 - A5 - E5 - - -   F5 - E5 - D5 - F5 -    G5 - - - - - - -`);
    return {
      bpm, steps: 128, lowpass: 6000,
      tick(t, i, e) {
        const bar = Math.floor(i / 8) % 8, s = i % 8, half = i < 64 ? melA : melB;
        const ch = chords[bar];
        const m = half[i % 64];
        if (m) osc(t, mtof(m.m), m.len * e * 0.95, "pulse", 0.07, { a: 0.005, r: 0.04, vib: m.len > 2 ? 5 : 0 });
        // 分解和弦（細聲方波）
        const arp = [0, 1, 2, 1][s % 4];
        osc(t, mtof(ch[arp] + 12), e * 0.7, "square", 0.018, { r: 0.03 });
        // 三角波低音：第 1、3 拍
        if (s === 0 || s === 4) osc(t, mtof(ch[0] - 12 + (s === 4 ? 12 : 0)), e * 1.8, "triangle", 0.16, { r: 0.06 });
        // 鼓：輕 kick + 細 hi-hat
        if (s === 0 || s === 4) kick(t, 0.18);
        if (s % 2 === 1) noise(t, 0.03, 0.03, "highpass", 7000);
        if (s === 4 && bar % 2 === 1) noise(t, 0.08, 0.05, "bandpass", 1800, 0.8);
      }
    };
  })();

  const SONGS = { pixel: PIXEL };

  function schedule() {
    const e = 60 / cur.bpm / 2; // 八分音符長度
    while (nextTime < ctx.currentTime + 0.15) {
      const sw = cur.swing && step % 2 === 1 ? e * cur.swing : 0;
      cur.tick(nextTime + sw, step, e);
      nextTime += e;
      step = (step + 1) % cur.steps;
    }
  }

  function fade(to, sec) {
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(to, t + sec);
  }

  function stopNow() {
    clearInterval(timer); timer = null;
    if (cur?.stop) cur.stop();
    if (bus) { const b = bus; setTimeout(() => b.disconnect(), 300); }
    cur = null; bus = null;
  }

  // 瀏覽器要用戶撳過一下先俾出聲；轉咗去第二個分頁就暫停，返嚟先繼續
  document.addEventListener("pointerdown", () => { if (ctx && ctx.state === "suspended" && !document.hidden) ctx.resume(); });
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (cur) { ctx.resume(); nextTime = Math.max(nextTime, ctx.currentTime + 0.05); }
  });

  window.BGM = {
    play(name) {
      const song = SONGS[name];
      if (!song || !ac()) return;
      if (cur === song && timer) return;
      stopNow();
      cur = song; bus = newBus(song.lowpass);
      step = 0; nextTime = ctx.currentTime + 0.1;
      if (document.hidden) ctx.suspend();
      if (song.start) song.start();
      timer = setInterval(schedule, 25);
      out.gain.value = 0;
      fade(muted ? 0 : volume, 1.5);
    },
    stop() {
      if (!ctx || !cur) return;
      fade(0, 0.8);
      setTimeout(stopNow, 850);
    },
    current: () => (timer ? Object.keys(SONGS).find((k) => SONGS[k] === cur) : null),
    list: Object.keys(SONGS),
    isMuted: () => muted,
    setMuted(m) {
      muted = !!m;
      try { localStorage.setItem("bgmMuted", muted ? "1" : "0"); } catch (e) {}
      if (ctx) fade(muted ? 0 : volume, 0.3);
    },
    getVolume: () => volume,
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      try { localStorage.setItem("bgmVolume", String(volume)); } catch (e) {}
      if (ctx && !muted) fade(volume, 0.1);
    }
  };
})();
