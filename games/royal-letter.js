/* =========================
   Game 11 · Royal Letter 宮廷密函
   玩法跟日文版《ラブレター》原版（16 張），角色名用自己嗰套：
   1 衛兵 ×5（估牌）· 2 弄臣 ×2（偷睇）· 3 男爵 ×2（比大細）· 4 修士 ×2（護盾）
   5 王子 ×2（棄牌重抽）· 6 國王 ×1（換牌）· 7 伯爵 ×1（手牌合計 ≥12 即出局）· 8 公主 ×1
   呢個檔案淨係純邏輯（唔掂 WebSocket／storage），方便 node 直接測試。
========================= */

export const RL_DECK = [1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8];
export const RL_GUARD = 1, RL_JESTER = 2, RL_BARON = 3, RL_MONK = 4, RL_PRINCE = 5, RL_KING = 6, RL_COUNTESS = 7, RL_PRINCESS = 8;
export const RL_TURN_MS_OPTIONS = [15000, 20000, 30000];
export const RL_MIN_PLAYERS = 3;
export const RL_MAX_PLAYERS = 4;
export const RL_PLAY_SHOW_MS = 2400;   // 出牌動畫（約 2.2 秒）：下一位嘅計時喺動畫之後先開始
export const RL_OFFLINE_TURN_MS = 1500; // 輪到斷咗線嘅人：好快幫佢自動出牌
export const RL_MATCH_END_MS = 6000;   // 有人集齊好感：一局完結畫面停一陣先去成場結果
export const RL_LOG_MAX = 40;

// 勝利所需好感：3 人 5 枚、4 人 4 枚（2 人局只會喺有人中途離開時出現，沿用開局嘅數）
export function rlTargetTokens(count) {
  return count <= 2 ? 7 : count === 3 ? 5 : 4;
}

function shuffleWith(list, rng) {
  const x = [...list];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

const sum = (arr) => (arr || []).reduce((a, b) => a + b, 0);

function blankStats() {
  return { guardHits: 0, kills: 0, peeks: 0, firstOut: 0 };
}

// 開一場：order = 參加玩家（座位次序）
export function rlNewMatch(order, turnMs) {
  const tokens = {};
  const stats = {};
  for (const id of order) { tokens[id] = 0; stats[id] = blankStats(); }
  return {
    game: "game11",
    phase: "turn",
    round: 0,
    turnMs: RL_TURN_MS_OPTIONS.includes(turnMs) ? turnMs : RL_TURN_MS_OPTIONS[0],
    order: [...order],
    target: rlTargetTokens(order.length),
    tokens,
    stats,
    actionSeq: 0,
    turnSeq: 0,
    roundWins: []
  };
}

// 新一局：洗牌、抽走一張蓋住、每人派一張，由 startId 開始
export function rlNewRound(g, players, startId, rng = Math.random) {
  const deck = shuffleWith(RL_DECK, rng);
  g.round = (g.round || 0) + 1;
  g.phase = "turn";
  g.players = [...players];
  g.removed = deck.pop();
  g.hands = {};
  g.discards = {};
  for (const id of g.players) { g.hands[id] = [deck.pop()]; g.discards[id] = []; }
  g.deck = deck;
  g.alive = [...g.players];
  g.protected = [];
  g.log = [];
  g.action = null;
  g.firstOutId = null;
  g.roundResult = null;
  g.ready = {};
  g.matchOver = false;
  g.currentId = null;
  const first = g.players.includes(startId) ? startId : g.players[0];
  return rlBeginTurn(g, first);
}

function nextAlive(g, id) {
  const order = g.players || [];
  const n = order.length;
  const i = order.indexOf(id);
  for (let k = 1; k <= n; k++) {
    const cand = order[(i + k + n) % n];
    if (cand !== id && g.alive.includes(cand)) return cand;
  }
  return null;
}

function eliminate(g, id, events, cause) {
  if (!g.alive.includes(id)) return;
  g.alive = g.alive.filter((x) => x !== id);
  g.protected = g.protected.filter((x) => x !== id);
  const hand = g.hands[id] || [];
  g.discards[id] = [...(g.discards[id] || []), ...hand];
  g.hands[id] = [];
  if (!g.firstOutId) {
    g.firstOutId = id;
    if (g.stats[id]) g.stats[id].firstOut += 1;
  }
  events.push({ out: id, cards: hand, cause });
}

// 輪到 id：解除佢自己嘅護盾、抽一張牌；伯爵規則：手牌合計 ≥12 即刻出局。
// 牌庫冇牌就完局。回傳事件陣列（伯爵出局會有）。
export function rlBeginTurn(g, id) {
  const events = [];
  let cur = id;
  for (let guard = 0; guard < 10 && cur; guard++) {
    if (g.alive.length <= 1 || !g.deck.length) { rlEndRound(g); return events; }
    g.protected = g.protected.filter((x) => x !== cur);
    g.hands[cur] = [...(g.hands[cur] || []), g.deck.pop()];
    const hand = g.hands[cur];
    if (hand.includes(RL_COUNTESS) && sum(hand) >= 12) {
      const ev = [];
      eliminate(g, cur, ev, "countess");
      pushLog(g, { kind: "countess", by: cur, cards: [...hand] });
      events.push(...ev);
      if (g.alive.length <= 1) { rlEndRound(g); return events; }
      cur = nextAlive(g, cur);
      continue;
    }
    g.currentId = cur;
    g.turnSeq = (g.turnSeq || 0) + 1;
    return events;
  }
  rlEndRound(g);
  return events;
}

function pushLog(g, entry) {
  g.actionSeq = (g.actionSeq || 0) + 1;
  const e = { seq: g.actionSeq, round: g.round, ...entry };
  g.log = [...(g.log || []), e].slice(-RL_LOG_MAX);
  g.action = e;
  return e;
}

// 有冇可以指定嘅對手（未出局、冇護盾、唔係自己）
export function rlTargets(g, by, card) {
  const others = g.alive.filter((x) => x !== by && !g.protected.includes(x));
  if (card === RL_PRINCE) return [by, ...others];
  if ([RL_GUARD, RL_JESTER, RL_BARON, RL_KING].includes(card)) return others;
  return [];
}

export function rlValidate(g, by, card, targetId, guess) {
  if (!g || g.phase !== "turn") return "未到出牌時間。";
  if (g.currentId !== by) return "未輪到你。";
  const hand = g.hands[by] || [];
  if (!hand.includes(card)) return "你手上冇呢張牌。";
  const targets = rlTargets(g, by, card);
  if (targets.length) {
    if (!targets.includes(targetId)) return "請揀一個可以指定嘅玩家。";
    if (card === RL_GUARD) {
      const n = Number(guess);
      if (!Number.isInteger(n) || n < 2 || n > 8) return "請揀一張要估嘅牌（唔可以估衛兵）。";
    }
  }
  return null;
}

// 出牌：已經驗證過。回傳 log entry。
export function rlPlay(g, by, card, targetId, guess, auto = false) {
  const hand = g.hands[by];
  hand.splice(hand.indexOf(card), 1);
  g.discards[by] = [...(g.discards[by] || []), card];
  const targets = rlTargets(g, by, card);
  const hasTarget = targets.length > 0;
  const target = hasTarget ? targetId : null;
  const events = [];
  const entry = { kind: "play", by, card, target, auto: !!auto, noEffect: false };

  if (card === RL_GUARD) {
    if (!hasTarget) entry.noEffect = true;
    else {
      entry.guess = Number(guess);
      entry.hit = (g.hands[target] || [])[0] === entry.guess;
      if (entry.hit) {
        eliminate(g, target, events, "guard");
        g.stats[by].guardHits += 1;
        g.stats[by].kills += 1;
      }
    }
  } else if (card === RL_JESTER) {
    if (!hasTarget) entry.noEffect = true;
    else {
      entry.peek = (g.hands[target] || [])[0] ?? null; // 只畀出牌嗰個睇
      g.stats[by].peeks += 1;
    }
  } else if (card === RL_BARON) {
    if (!hasTarget) entry.noEffect = true;
    else {
      const mine = (g.hands[by] || [])[0];
      const theirs = (g.hands[target] || [])[0];
      entry.compare = { [by]: mine, [target]: theirs }; // 只畀兩個人睇
      if (mine > theirs) { eliminate(g, target, events, "baron"); g.stats[by].kills += 1; entry.loser = target; }
      else if (theirs > mine) { eliminate(g, by, events, "baron"); g.stats[target].kills += 1; entry.loser = by; }
      else entry.tie = true;
    }
  } else if (card === RL_MONK) {
    g.protected = [...new Set([...g.protected, by])];
  } else if (card === RL_PRINCE) {
    const t = target || by;
    entry.target = t;
    const old = (g.hands[t] || [])[0];
    entry.discarded = old ?? null;
    if (old !== undefined) {
      g.hands[t] = [];
      g.discards[t] = [...(g.discards[t] || []), old];
      if (old === RL_PRINCESS) {
        // 棄掉公主：出局（手上已經冇牌）
        g.alive = g.alive.filter((x) => x !== t);
        g.protected = g.protected.filter((x) => x !== t);
        if (!g.firstOutId) { g.firstOutId = t; g.stats[t].firstOut += 1; }
        events.push({ out: t, cards: [], cause: "prince" });
        if (t !== by) g.stats[by].kills += 1;
      } else {
        let draw;
        if (g.deck.length) draw = g.deck.pop();
        else { draw = g.removed; g.removed = null; entry.usedRemoved = true; }
        g.hands[t] = draw === null || draw === undefined ? [] : [draw];
      }
    }
  } else if (card === RL_KING) {
    if (!hasTarget) entry.noEffect = true;
    else {
      const a = g.hands[by];
      g.hands[by] = g.hands[target];
      g.hands[target] = a;
      entry.swapped = true;
    }
  } else if (card === RL_PRINCESS) {
    eliminate(g, by, events, "princess");
  }

  entry.out = events.map((e) => e.out);
  entry.outCards = Object.fromEntries(events.map((e) => [e.out, e.cards]));
  const logged = pushLog(g, entry);

  if (g.alive.length <= 1 || !g.deck.length) {
    rlEndRound(g);
  } else {
    const next = nextAlive(g, by);
    rlBeginTurn(g, next);
  }
  return logged;
}

// 超時／斷線：隨機幫佢出一張（避開公主），隨機揀合法目標，衛兵隨機估 2–8
export function rlAutoMove(g, by, rng = Math.random) {
  const hand = g.hands[by] || [];
  let options = hand.filter((c) => c !== RL_PRINCESS);
  if (!options.length) options = [...hand];
  const card = options[Math.floor(rng() * options.length)];
  const targets = rlTargets(g, by, card);
  let targetId = null;
  if (targets.length) {
    const pool = card === RL_PRINCE && targets.length > 1 ? targets.filter((x) => x !== by) : targets;
    targetId = pool[Math.floor(rng() * pool.length)];
  }
  const guess = 2 + Math.floor(rng() * 7);
  return { card, targetId, guess };
}

// 完局：剩一個人就佢贏；否則比手牌，同數字就比出過嘅牌合計，再同就一齊贏。
export function rlEndRound(g) {
  if (g.phase !== "turn") return g.roundResult;
  const alive = [...g.alive];
  let winners;
  let reason;
  let tieBreak = false;
  const reveal = {};
  const discardSums = {};
  for (const id of g.players) discardSums[id] = sum(g.discards[id]);
  if (alive.length <= 1) {
    winners = alive;
    reason = "last";
    for (const id of alive) reveal[id] = (g.hands[id] || [])[0] ?? null;
  } else {
    reason = "deck";
    for (const id of alive) reveal[id] = (g.hands[id] || [])[0] ?? 0;
    const top = Math.max(...alive.map((id) => reveal[id]));
    let best = alive.filter((id) => reveal[id] === top);
    if (best.length > 1) {
      tieBreak = true;
      const topSum = Math.max(...best.map((id) => discardSums[id]));
      best = best.filter((id) => discardSums[id] === topSum);
    }
    winners = best;
  }
  for (const id of winners) g.tokens[id] = (g.tokens[id] || 0) + 1;
  g.roundWins = [...(g.roundWins || []), { round: g.round, ids: winners }];
  g.roundResult = { winners, reason, reveal, removed: g.removed ?? null, tieBreak, discardSums };
  g.phase = "roundover";
  g.currentId = null;
  g.ready = {};
  g.matchOver = winners.some((id) => (g.tokens[id] || 0) >= g.target);
  return g.roundResult;
}

// 下一局由上一局嘅贏家開始（多過一個就揀座位最前、仲喺度嘅）
export function rlNextStarter(g, connectedIds) {
  const winners = g.roundResult?.winners || [];
  const pool = (g.order || []).filter((id) => connectedIds.includes(id));
  return winners.find((id) => pool.includes(id)) || pool[0] || null;
}

export function rlRanking(g, nickOf) {
  return [...(g.order || [])]
    .map((id) => ({ id, nickname: nickOf(id), score: g.tokens[id] || 0 }))
    .sort((a, b) => b.score - a.score);
}

// 稱號：數值最高（>0）嘅人，同分一齊攞
export function rlTitles(g) {
  const pick = (key) => {
    const ids = g.order || [];
    const top = Math.max(0, ...ids.map((id) => g.stats[id]?.[key] || 0));
    if (top <= 0) return { ids: [], value: 0 };
    return { ids: ids.filter((id) => (g.stats[id]?.[key] || 0) === top), value: top };
  };
  return {
    guardHits: pick("guardHits"),
    kills: pick("kills"),
    peeks: pick("peeks"),
    firstOut: pick("firstOut")
  };
}

// 畀某個玩家睇嘅 log：偷睇結果只畀出牌嗰個；比大細嘅兩張牌只畀兩個當事人
export function rlViewEntry(e, viewerId) {
  if (!e) return null;
  const out = { ...e };
  if (e.card === RL_JESTER && e.kind === "play") {
    out.peek = viewerId && viewerId === e.by ? e.peek : undefined;
  }
  if (e.card === RL_BARON && e.compare) {
    const party = viewerId && (viewerId === e.by || viewerId === e.target);
    out.compare = party ? e.compare : undefined;
    // 輸咗嗰個嘅牌本身已經公開（棄咗），照畀
    if (!party && e.loser) out.loserCard = e.compare[e.loser];
  }
  return out;
}
