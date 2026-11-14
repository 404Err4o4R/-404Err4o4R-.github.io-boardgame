/* =========================
   Party 聯機網站 — 音效（Web Audio 即場合成，唔使任何音檔）
   用法：SFX.play("click")；SFX.setMuted(true)；SFX.setVolume(0.6)
========================= */
(function () {
  let ctx = null;
  let master = null;
  let muted = false;
  let volume = 0.6;

  try {
    muted = localStorage.getItem("sfxMuted") === "1";
    const v = parseFloat(localStorage.getItem("sfxVolume"));
    if (!isNaN(v)) volume = v;
  } catch (e) {}

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // 單一個音：頻率、長度、波形、音量、滑去邊個頻率、幾時開始
  function tone(f, dur, o = {}) {
    const c = ctx, t = c.currentTime + (o.at || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const v = o.vol ?? 0.3, a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // 白噪音：用嚟做爆炸、水花、鼓、紙
  function noise(dur, o = {}) {
    const c = ctx, t = c.currentTime + (o.at || 0);
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = o.filter || "lowpass";
    filt.frequency.setValueAtTime(o.freq || 1200, t);
    if (o.freqTo) filt.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
    filt.Q.value = o.q || 1;
    const g = c.createGain(), v = o.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const chord = (notes, gap, dur, o) =>
    notes.forEach((f, i) => tone(f, dur, { ...o, at: (o?.at || 0) + i * gap }));

  const SOUNDS = {
    /* ---------- 共用 ---------- */
    join: () => chord([523, 784], 0.08, 0.18, { type: "triangle", vol: 0.22 }),
    leave: () => chord([659, 440], 0.08, 0.18, { type: "triangle", vol: 0.18 }),
    start: () => chord([523, 659, 784, 1047], 0.09, 0.3, { type: "square", vol: 0.12 }),
    round: () => chord([660, 990], 0.1, 0.25, { type: "sine", vol: 0.25 }),
    turn: () => { tone(988, 0.15, { type: "sine", vol: 0.3 }); tone(1319, 0.3, { type: "sine", vol: 0.3, at: 0.13 }); },
    tick: () => tone(1500, 0.04, { type: "square", vol: 0.08 }),
    timeup: () => { tone(440, 0.22, { type: "square", vol: 0.12 }); tone(330, 0.35, { type: "square", vol: 0.12, at: 0.2 }); },
    submit: () => tone(600, 0.12, { type: "sine", vol: 0.25, to: 1200 }),
    reveal: () => { noise(0.35, { filter: "bandpass", freq: 400, freqTo: 4000, vol: 0.15 }); tone(1047, 0.4, { vol: 0.2, at: 0.3 }); },
    score: () => chord([1319, 1568], 0.06, 0.15, { type: "triangle", vol: 0.2 }),
    win: () => {
      chord([523, 659, 784], 0.12, 0.25, { type: "square", vol: 0.1 });
      chord([1047, 1319, 1568], 0, 0.9, { type: "triangle", vol: 0.12, at: 0.4 });
    },
    chat: () => tone(1200, 0.08, { type: "sine", vol: 0.15, to: 1600 }),
    error: () => tone(200, 0.2, { type: "sawtooth", vol: 0.1 }),

    /* ---------- 心有靈犀一點通 ---------- */
    g1_allsync: () => [1568, 1976, 2349, 3136, 2637].forEach((f, i) => tone(f, 0.5, { type: "sine", vol: 0.13, at: i * 0.06 })),

    /* ---------- 9upper 瞎掰王 ---------- */
    g2_role: () => { tone(220, 0.8, { type: "sine", vol: 0.25, to: 440 }); tone(330, 0.8, { type: "triangle", vol: 0.1, at: 0.1, to: 660 }); },

    /* ---------- He/She's a 10 ---------- */
    g3_flip: () => { noise(0.08, { filter: "highpass", freq: 2000, vol: 0.2 }); tone(500, 0.08, { type: "triangle", vol: 0.12, at: 0.04 }); },

    /* ---------- 誰最有可能 ---------- */
    g4_drumroll: () => {
      for (let i = 0; i < 14; i++) noise(0.05, { filter: "bandpass", freq: 300, vol: 0.12 + i * 0.012, at: i * 0.055 });
      noise(0.4, { filter: "highpass", freq: 3000, vol: 0.25, at: 0.8 });
      tone(110, 0.3, { vol: 0.4, at: 0.8 });
    },

    /* ---------- 故事接龍 ---------- */
    // 機械鍵盤：三下「噠」，最後一下係較重嘅 Enter
    g5_type: () => {
      [0, 0.14, 0.26].forEach((at, i) => {
        noise(0.03, { filter: "bandpass", freq: 2500 + Math.random() * 1500, q: 2, vol: 0.22, at });
        tone(160 + Math.random() * 60, 0.03, { type: "square", vol: 0.05, at });
      });
      noise(0.05, { filter: "bandpass", freq: 1500, q: 1.5, vol: 0.3, at: 0.42 });
      tone(120, 0.06, { type: "square", vol: 0.08, at: 0.42 });
    },

    /* ---------- Sync 唔 Sync ---------- */
    // 明快版：快速上行大三和弦 + 高音閃一閃
    g6_match: () => {
      chord([784, 988, 1175, 1568], 0.055, 0.18, { type: "square", vol: 0.09 });
      chord([1568, 1976, 2349], 0, 0.45, { type: "triangle", vol: 0.12, at: 0.24 });
      [3136, 3951].forEach((f, i) => tone(f, 0.25, { vol: 0.06, at: 0.3 + i * 0.07 }));
    },
    g6_miss: () => { tone(440, 0.2, { type: "triangle", vol: 0.15 }); tone(415, 0.3, { type: "triangle", vol: 0.15, at: 0.15 }); },

    /* ---------- 數字炸彈 ---------- */
    g7_fuse: () => noise(0.25, { filter: "highpass", freq: 5000, vol: 0.12 }),
    g7_card: () => noise(0.25, { filter: "bandpass", freq: 800, freqTo: 3000, vol: 0.2 }),
    g7_boom: () => {
      noise(1.4, { filter: "lowpass", freq: 3000, freqTo: 60, vol: 0.6 });
      tone(120, 0.8, { type: "sine", vol: 0.5, to: 30 });
    },
    g7_safe: () => tone(700, 0.1, { type: "triangle", vol: 0.18 }),

    /* ---------- 海戰棋 ---------- */
    g8_fire: () => { noise(0.3, { filter: "lowpass", freq: 900, freqTo: 200, vol: 0.4 }); tone(1800, 0.6, { vol: 0.08, to: 500, at: 0.1 }); },
    g8_splash: () => noise(0.6, { filter: "bandpass", freq: 1500, freqTo: 400, q: 0.7, vol: 0.3, attack: 0.03 }),
    g8_hit: () => { noise(0.6, { filter: "lowpass", freq: 2500, freqTo: 100, vol: 0.5 }); tone(90, 0.4, { vol: 0.4, to: 40 }); },
    g8_sink: () => {
      noise(0.9, { filter: "lowpass", freq: 2000, freqTo: 80, vol: 0.5 });
      for (let i = 0; i < 6; i++) tone(300 + Math.random() * 300, 0.08, { vol: 0.1, to: 900, at: 0.6 + i * 0.09 });
    },
    g8_alarm: () => { for (let i = 0; i < 3; i++) { tone(660, 0.2, { type: "sawtooth", vol: 0.07, at: i * 0.4 }); tone(880, 0.2, { type: "sawtooth", vol: 0.07, at: i * 0.4 + 0.2 }); } },
    g8_place: () => tone(220, 0.08, { type: "square", vol: 0.12 }),

    /* ---------- 心中有數 ---------- */
    g9_dial: () => tone(2400, 0.015, { type: "square", vol: 0.05 }),
    g9_lock: () => { tone(300, 0.06, { type: "square", vol: 0.15 }); tone(600, 0.1, { type: "triangle", vol: 0.15, at: 0.05 }); },
    g9_bullseye: () => { tone(1568, 0.6, { vol: 0.25 }); tone(2093, 0.6, { vol: 0.15, at: 0.1 }); noise(0.1, { filter: "highpass", freq: 4000, vol: 0.1 }); }
  };

  const last = {};
  function play(name) {
    if (muted || !SOUNDS[name]) return;
    if (!ac()) return;
    const now = performance.now();
    if (last[name] && now - last[name] < 40) return; // 避免同一個音疊埋一齊
    last[name] = now;
    try { SOUNDS[name](); } catch (e) {}
  }

  window.SFX = {
    play,
    list: Object.keys(SOUNDS),
    isMuted: () => muted,
    setMuted(m) { muted = !!m; try { localStorage.setItem("sfxMuted", muted ? "1" : "0"); } catch (e) {} },
    getVolume: () => volume,
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = volume;
      try { localStorage.setItem("sfxVolume", String(volume)); } catch (e) {}
    },
    unlock: ac
  };
})();

/* =========================
   幾時響：比較前後兩次房間狀態，揀返啱嘅音效
   淨係重要時刻先響（撳掣唔響）
========================= */
(function () {
  const P = (n, delay) => delay ? setTimeout(() => SFX.play(n), delay) : SFX.play(n);
  const ended = (ph) => ph === "gameover" || ph === "final";

  // 海戰棋：一次攻擊嘅結果（擊沉 > 命中 > 擋咗 > 落空）
  function g8Result(cells) {
    if (!cells || !cells.length) return;
    if (cells.some((c) => c.sunk)) return P("g8_sink", 350);
    if (cells.some((c) => c.res === "hit")) return P("g8_hit", 350);
    if (cells.some((c) => c.res === "blocked")) return P("g8_place", 350);
    P("g8_splash", 350);
  }

  const RULES = {
    game1(pg, g) {
      if (g.phase === "vote" && (pg.phase !== "vote" || pg.round !== g.round)) return P("round");
      if (g.phase === "chat" && pg.phase !== "chat") {
        const v = g.votes || {}, a = v[0] || 0, b = v[1] || 0;
        if (g.winner !== null && a + b >= 2 && (a === 0 || b === 0)) return P("g1_allsync");
        return P("reveal");
      }
    },
    game2(pg, g, me) {
      if (g.phase === "prep" && pg.phase !== "prep") return P("g2_role");
      if (g.phase === "speaking" && g.currentPlayerId !== pg.currentPlayerId && g.currentPlayerId === me) return P("turn");
      if (g.phase === "result" && pg.phase !== "result") return P("reveal");
      if (g.phase !== pg.phase) return P("round");
    },
    game3(pg, g) {
      if (g.phase === "writing" && (pg.phase !== "writing" || pg.round !== g.round)) return P("round");
      if (g.phase === "rating" && (pg.phase !== "rating" || pg.currentRatingIndex !== g.currentRatingIndex || pg.ratingStage !== g.ratingStage)) return P("g3_flip");
      if (g.phase === "reveal" && pg.phase !== "reveal") return P("reveal");
    },
    game4(pg, g) {
      if (g.phase === "voting" && (pg.phase !== "voting" || pg.round !== g.round)) return P("round");
      if (g.phase === "reveal" && pg.phase !== "reveal") return P("g4_drumroll");
    },
    game5(pg, g, me) {
      if ((g.story || []).length > (pg.story || []).length) P("g5_type");
      if (g.currentTurnPlayerId !== pg.currentTurnPlayerId && g.currentTurnPlayerId === me) P("turn", 600);
    },
    game6(pg, g) {
      if (g.phase === "answering" && (pg.phase !== "answering" || pg.attempt !== g.attempt || pg.round !== g.round)) return P("round");
      if (g.phase === "merging" && pg.phase !== "merging") return P("reveal");
      if (g.phase === "reveal" && pg.phase !== "reveal") return P(g.result?.success ? "g6_match" : "g6_miss");
    },
    game7(pg, g, me) {
      if (g.phase === "boom" && pg.phase !== "boom") return P("g7_boom");
      if (g.phase !== "turn") return;
      if (pg.phase !== "turn" || pg.bombIndex !== g.bombIndex) return P("round");
      if (g.via && g.turnSeq !== pg.turnSeq && g.via.by !== me) P("g7_card");
      else if (g.low !== pg.low || g.high !== pg.high) {
        P("g7_safe");
        if (g.high - g.low <= 10) P("g7_fuse", 150);
      }
      if (g.currentId !== pg.currentId && g.currentId === me) P("turn", 300);
    },
    game8(pg, g, me) {
      if (g.hot && !pg.hot) P("g8_alarm");
      if (g.phase === "roundover" && pg.phase !== "roundover") return P("reveal");
      if (g.phase !== pg.phase && (g.phase === "placing" || g.phase === "draw")) return P("round");
      if (g.last && g.last.seq !== pg.last?.seq) {
        if (g.last.by !== me) P("g8_fire");
        g8Result(g.last.cells);
      }
      if (g.phase === "reveal" && pg.phase !== "reveal" && g.reveal) {
        P("g8_fire");
        g8Result(g.reveal.flatMap((ev) => ev?.cells || []));
      }
      const myTurn = (x) => x.phase === "turn" && (x.shooter === me || (!x.shooter && x.cur === x.myKey));
      if (myTurn(g) && (!myTurn(pg) || g.turnSeq !== pg.turnSeq)) P("turn", 700);
    },
    game9(pg, g, me) {
      if (g.phase === "hint" && (pg.phase !== "hint" || pg.turnNo !== g.turnNo)) return P(g.psychicId === me ? "turn" : "round");
      if (g.phase === "guess" && pg.phase !== "guess") return P("round");
      if (g.phase === "reveal" && pg.phase !== "reveal") {
        const bull = (g.result?.guesses || []).some((r) => r.points === 4);
        return P(bull ? "g9_bullseye" : "reveal");
      }
    }
  };

  SFX.onState = function (prev, room, me) {
    if (!room || !prev || prev.code !== room.code) return;
    const pg = prev.gameState || { phase: "waiting" };
    const g = room.gameState || { phase: "waiting" };

    // 等候室：有人入房／走咗
    if (g.phase === "waiting") {
      const a = (prev.players || []).length, b = (room.players || []).length;
      if (b > a) P("join"); else if (b < a) P("leave");
      return;
    }
    // 開始（包括再來一場）
    if (pg.phase === "waiting" || (ended(pg.phase) && !ended(g.phase))) return P("start");
    // 結算
    if (ended(g.phase)) { if (!ended(pg.phase)) P("win"); return; }

    try { RULES[room.game]?.(pg, g, me); } catch (e) {}
  };

  // 自己送出動作：答案／投票提交成功、技能卡、開炮、放船、鎖定答案
  const SEND = {
    "g7:card": "g7_card", "g8:fire": "g8_fire", "g8:place": "g8_place", "g8:random": "g8_place",
    "g9:guess": "g9_lock", "g9:hint": "submit",
    "g1:vote": "submit", "g3:submit": "submit", "g3:score": "submit", "g4:vote": "submit",
    "g5:submit": "submit", "g6:submit": "submit", "g6:vote": "submit", "g7:guess": "submit",
    "g2:pick": "submit", "g2:judge": "submit"
  };
  SFX.onSend = function (msg) { const n = SEND[msg?.type]; if (n) P(n); };

  // 倒數：最後 5 秒每秒一下，到 0 響「時間到」
  const seen = {};
  SFX.onTimer = function (endsAt, remainingMs) {
    const s = Math.ceil(remainingMs / 1000);
    const k = String(endsAt);
    if (seen[k] === undefined) { seen[k] = s; return; }
    if (s === seen[k]) return;
    seen[k] = s;
    if (s >= 1 && s <= 5) P("tick");
    else if (s === 0) P("timeup");
  };

  // 瀏覽器要用戶撳過一下先俾出聲：第一次撳畫面就解鎖
  const unlock = () => { SFX.unlock(); document.removeEventListener("pointerdown", unlock); };
  document.addEventListener("pointerdown", unlock);
})();
