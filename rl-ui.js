/* =========================
   Game 11 · Royal Letter 宮廷密函（前端）
   app.js 載入之後先載入：用返 app.js 嘅 S、$、esc、send、startTimer、askConfirm、flash、leaveRoom。
   卡面插畫喺 assets/royal-letter/，數字火漆印、好感標記、玩家頭像全部用 SVG 畫。
   香港限定：介面文字一律廣東話。
========================= */

const RL_CARDS = {
  1: { name: "衛兵", en: "GUARD", count: 5, effect: "估一名玩家嘅手牌（唔可以估衛兵），估中佢就出局" },
  2: { name: "弄臣", en: "JESTER", count: 2, effect: "私下偷睇一名玩家嘅手牌" },
  3: { name: "男爵", en: "BARON", count: 2, effect: "同一名玩家私下比手牌，細嗰個出局；打和冇事" },
  4: { name: "修士", en: "MONK", count: 2, effect: "直到你下一回合，其他人嘅牌對你冇效" },
  5: { name: "王子", en: "PRINCE", count: 2, effect: "指定任一玩家（包括自己）棄牌重抽；棄掉公主即出局" },
  6: { name: "國王", en: "KING", count: 1, effect: "同一名其他玩家交換手牌" },
  7: { name: "伯爵", en: "COUNTESS", count: 1, effect: "手牌數字合計 12 或以上，即刻出局" },
  8: { name: "公主", en: "PRINCESS", count: 1, effect: "無論點樣打出或者棄掉，即刻出局" }
};
const RL_TARGETED = [1, 2, 3, 5, 6];
const RL_GOLD = "#B8913E", RL_GOLD_L = "#D4B46A", RL_GOLD_D = "#6E4F1C", RL_WINE = "#7A2335", RL_EMER = "#1F5640", RL_PINE = "#0F2E23", RL_CREAM = "#EFE4CC", RL_INK = "#2A1F14";
const RL_WALL = { 0: "#5E2A33", 1: "#1F4A3A", 2: "#A8853E" };
const RL_AV = [["cav", "#6F86A8"], ["bun", "#C27C8B"], ["tri", "#8FAF8A"], ["curl", "#9C8BC0"]];
const RL_AV_TEXT = ["#AFC3DE", "#E8B4C0", "#B9D3B4", "#C8BCE6"];

const rlImg = (n) => `./assets/royal-letter/card-${n}.jpg`;
const RL_BACK = "./assets/royal-letter/back.jpg";
const rlTier = (n) => (n <= 3 ? 0 : n === 4 ? 1 : 2);

function rlName(id) {
  if (id && id === S.playerId) return "你";
  return S.room?.players?.find((p) => p.id === id)?.nickname || "玩家";
}
function rlRealName(id) {
  return S.room?.players?.find((p) => p.id === id)?.nickname || "玩家";
}
function rlSeatIdx(id) {
  const i = (S.room?.players || []).findIndex((p) => p.id === id);
  return i < 0 ? 0 : i % RL_AV.length;
}

/* ---------- SVG：火漆數字印（平民→侍從加月桂→王室加皇冠） ---------- */
function rlBumps(color, r, rad) {
  let s = "";
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    s += `<circle cx="${(rad * Math.cos(a)).toFixed(1)}" cy="${(rad * Math.sin(a)).toFixed(1)}" r="${r}" fill="${color}"></circle>`;
  }
  return s;
}
function rlLeaves(color, rad = 34, rx = 4, ry = 9) {
  return [-50, -20, 10, 40, 70, 110, 140, 170, 200, 230]
    .map((a) => `<g transform="rotate(${a})"><ellipse cx="${rad}" cy="0" rx="${rx}" ry="${ry}" fill="${color}"></ellipse></g>`).join("");
}
function rlSeal(n, w) {
  const t = rlTier(n);
  const h = Math.round((w * 104) / 92);
  let s = `<svg width="${w}" height="${h}" viewBox="-46 -56 92 104" aria-hidden="true">`;
  if (t >= 1) s += rlLeaves(t === 2 ? RL_GOLD_L : "#C9A24E");
  s += rlBumps(RL_WINE, 7, 24);
  s += `<circle r="26" fill="${RL_WINE}"></circle><path d="M-20,-10 L-8,-22 L4,-24 L-14,-4 Z" fill="#934052"></path>`;
  s += `<circle r="19" fill="none" stroke="${t === 0 ? "#56182A" : RL_GOLD_L}" stroke-width="${t === 0 ? 2.5 : 2}"></circle>`;
  if (t === 2) s += `<polygon points="-15,-30 -15,-44 -7,-36 0,-48 7,-36 15,-44 15,-30" fill="${RL_GOLD_L}"></polygon><circle cx="0" cy="-37" r="2.5" fill="${RL_EMER}"></circle>`;
  s += `<text x="0" y="9" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="24" font-weight="700" fill="${RL_CREAM}">${n}</text></svg>`;
  return s;
}
function rlFavour(w, filled = true) {
  if (!filled) {
    return `<svg width="${w}" height="${w}" viewBox="-30 -30 60 60" aria-hidden="true"><circle r="20" fill="none" stroke="#8C7A4E" stroke-width="2.5" stroke-dasharray="5 4"></circle></svg>`;
  }
  return `<svg width="${w}" height="${w}" viewBox="-30 -30 60 60" aria-hidden="true">${rlBumps(RL_WINE, 5, 20)}<circle r="21" fill="${RL_WINE}"></circle><path d="M-16,-8 L-6,-18 L2,-19 L-12,-2 Z" fill="#934052"></path><g transform="translate(0,5)"><path d="M0,10 C-14,0 -12,-10 -5,-10 C-2,-10 0,-7 0,-5 C0,-7 2,-10 5,-10 C12,-10 14,0 0,10 Z" fill="${RL_GOLD_L}"></path></g><polygon points="-7,-8 -7,-15 -3.5,-11.5 0,-17 3.5,-11.5 7,-15 7,-8" fill="${RL_GOLD_L}"></polygon></svg>`;
}
function rlTokens(n, total, w = 18) {
  return `<span class="rl-tokens" role="img" aria-label="${n} 枚好感（要 ${total} 枚）">${Array.from({ length: total }, (_, i) => rlFavour(w, i < n)).join("")}</span>`;
}
function rlAvatarSvg(kind, w, h) {
  const SIL = "#3A1E28";
  const body = `<path d="M-22,28 Q-22,7 0,7 Q22,7 22,28 Z" fill="${SIL}"></path><circle cx="0" cy="-5" r="9.5" fill="${SIL}"></circle>`;
  let extra = "";
  if (kind === "bun") extra = `<circle cx="0" cy="-17" r="6" fill="${SIL}"></circle><path d="M-11,-4 Q-12,-14 0,-15 Q12,-14 11,-4 Q6,-10 0,-10 Q-6,-10 -11,-4 Z" fill="${SIL}"></path><circle cx="8.5" cy="1" r="1.8" fill="${RL_GOLD_L}"></circle><path d="M-6,9 Q0,14 6,9" fill="none" stroke="${RL_GOLD_L}" stroke-width="1.3"></path>`;
  else if (kind === "tri") extra = `<polygon points="-17,-9 0,-25 17,-9 10,-7 0,-13 -10,-7" fill="${SIL}"></polygon><circle cx="0" cy="-20" r="1.8" fill="${RL_GOLD_L}"></circle><path d="M-4,8 L0,14 L4,8" fill="${RL_CREAM}"></path>`;
  else if (kind === "cav") extra = `<ellipse cx="0" cy="-12" rx="17" ry="3.6" fill="${SIL}"></ellipse><rect x="-8" y="-22" width="16" height="10" rx="3" fill="${SIL}"></rect><path d="M5,-21 Q17,-33 22,-17 Q14,-25 5,-18 Z" fill="${RL_GOLD_L}"></path><path d="M-9,9 Q0,16 9,9 L6,7 Q0,12 -6,7 Z" fill="${RL_CREAM}"></path>`;
  else extra = [[-10, -6, 5], [10, -6, 5], [-10, 2, 4.5], [10, 2, 4.5], [0, -14, 6.5], [-7, -12, 5], [7, -12, 5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${SIL}"></circle>`).join("") + `<path d="M-5,8 Q0,13 5,8" fill="none" stroke="${RL_CREAM}" stroke-width="2"></path>`;
  return `<svg width="${w}" height="${h}" viewBox="-24 -26 48 54" aria-hidden="true">${body}${extra}</svg>`;
}
function rlPortrait(id, w, opts = {}) {
  const [kind, col] = RL_AV[rlSeatIdx(id)];
  const h = Math.round(w * 1.22);
  const crest = opts.crown ? `<svg class="rl-crest" width="${Math.round(w * 0.42)}" height="${Math.round(w * 0.24)}" viewBox="-20 -12 40 22" aria-hidden="true"><polygon points="-15,8 -15,-6 -7,1 0,-10 7,1 15,-6 15,8" fill="${RL_GOLD_L}"></polygon><circle cx="0" cy="2" r="2.5" fill="${RL_WINE}"></circle></svg>` : "";
  return `<span class="rl-portrait ${opts.active ? "active" : ""} ${opts.grey ? "grey" : ""}" style="width:${w}px;height:${h}px">${crest}<span class="rl-portrait-in" style="background:${col}">${rlAvatarSvg(kind, Math.round(w * 0.86), Math.round(w * 0.97))}</span></span>`;
}
function rlMiniAv(id, d = 24) {
  const [kind, col] = RL_AV[rlSeatIdx(id)];
  return `<span class="rl-mini-av" style="width:${d}px;height:${d}px;background:${col}">${rlAvatarSvg(kind, d - 2, d)}</span>`;
}
function rlNameColor(id) {
  return RL_AV_TEXT[rlSeatIdx(id)];
}

/* ---------- 卡 ---------- */
function rlCard(n, w, opts = {}) {
  const c = RL_CARDS[n];
  if (!c) return "";
  const tag = opts.onclick ? "button" : "div";
  const attrs = opts.onclick ? `type="button" onclick="${opts.onclick}" aria-pressed="${opts.selected ? "true" : "false"}"` : `role="img"`;
  return `<${tag} class="rl-card ${opts.selected ? "selected" : ""} ${opts.dim ? "dim" : ""}" ${attrs} aria-label="${n} ${c.name}" style="--w:${w}px">
      <span class="rl-card-art" style="background:${RL_WALL[rlTier(n)]}"><img src="${rlImg(n)}" alt="" loading="lazy" draggable="false"></span>
      <span class="rl-card-band"><b>${c.name}</b><small>${c.en}</small></span>
      <span class="rl-card-seal">${rlSeal(n, Math.max(28, Math.round(w * 0.24)))}</span>
    </${tag}>`;
}
function rlThumb(n, w = 26) {
  const c = RL_CARDS[n];
  if (!c) return "";
  return `<span class="rl-thumb" role="img" aria-label="${n} ${c.name}" style="--w:${w}px;background:${RL_WALL[rlTier(n)]}"><img src="${rlImg(n)}" alt="" loading="lazy" draggable="false"><i>${n}</i></span>`;
}
function rlBackImg(w, cls = "") {
  return `<img class="rl-back ${cls}" src="${RL_BACK}" alt="" style="width:${w}px" draggable="false">`;
}

/* ---------- 文字：描述一次出牌 ---------- */
function rlDescribe(e) {
  if (!e) return "";
  const by = rlName(e.by);
  const t = e.target ? rlName(e.target) : "";
  const auto = e.auto ? "（超時自動出牌）" : "";
  if (e.kind === "countess") {
    const other = (e.cards || []).find((x) => x !== 7) || 7;
    return `${by}手上伯爵加${RL_CARDS[other]?.name || ""}合計 ${7 + other}，即刻出局！`;
  }
  switch (e.card) {
    case 1:
      if (e.noEffect) return `${by}打出衛兵，但冇人可以指定，冇效果${auto}`;
      return `${by}打出衛兵，估${t}係${RL_CARDS[e.guess]?.name || "?"}——${e.hit ? `估中！${t}出局` : "估錯"}${auto}`;
    case 2:
      if (e.noEffect) return `${by}打出弄臣，但冇人可以指定，冇效果${auto}`;
      return `${by}用弄臣偷睇咗${t}嘅手牌${e.peek ? `：係${RL_CARDS[e.peek]?.name}（${e.peek}）` : ""}${auto}`;
    case 3: {
      if (e.noEffect) return `${by}打出男爵，但冇人可以指定，冇效果${auto}`;
      let s = `${by}同${t}比大細`;
      if (e.compare) {
        const mine = e.compare[S.playerId];
        const otherId = S.playerId === e.by ? e.target : e.by;
        if (mine !== undefined) s += `（你 ${RL_CARDS[mine]?.name} 對 ${RL_CARDS[e.compare[otherId]]?.name}）`;
      }
      if (e.tie) return `${s}——打和，冇事${auto}`;
      const loserCard = e.compare ? e.compare[e.loser] : e.loserCard;
      return `${s}——${rlName(e.loser)}輸咗出局${loserCard ? `（${RL_CARDS[loserCard]?.name}）` : ""}${auto}`;
    }
    case 4:
      return `${by}打出修士，直到下一回合受保護${auto}`;
    case 5: {
      const self = e.target === e.by;
      const d = RL_CARDS[e.discarded]?.name || "";
      if (e.discarded === 8) return `${by}用王子令${self ? "自己" : t}棄掉公主——${self ? by : t}出局！${auto}`;
      return `${by}用王子令${self ? "自己" : t}棄掉${d}，再抽一張${e.usedRemoved ? "（抽咗一開始蓋住嗰張）" : ""}${auto}`;
    }
    case 6:
      if (e.noEffect) return `${by}打出國王，但冇人可以指定，冇效果${auto}`;
      return `${by}用國王同${t}交換咗手牌${auto}`;
    case 7:
      return `${by}打出伯爵（冇效果）${auto}`;
    case 8:
      return `${by}打出公主，即刻出局！${auto}`;
    default:
      return "";
  }
}

/* ---------- 主畫面 ---------- */
function renderGame11(game) {
  rlQueueAnimations(game);
  if (game.phase === "gameover") return rlRenderGameover(game);
  if (game.phase === "roundover") return rlRenderRoundover(game);
  return rlRenderTable(game);
}

function rlHead(game, right = "") {
  return `
    <div class="rl-head">
      <div class="rl-plaque"><span class="rl-plaque-en">ROYAL LETTER</span><span class="rl-plaque-zh">宮廷密函</span></div>
      <div class="rl-head-info">
        <span>第 ${game.round} 局</span>
        <span>目標 ${game.target} 枚好感</span>
      </div>
      ${right}
    </div>`;
}

function rlSeatHtml(id, game) {
  const alive = (game.alive || []).includes(id);
  const active = game.currentId === id;
  const prot = (game.protected || []).includes(id);
  const offline = !S.room.players.find((p) => p.id === id)?.connected;
  let badge = "";
  if (!alive) badge = `<span class="rl-badge out">已出局</span>`;
  else if (active) badge = `<span class="rl-badge turn">出牌中</span>`;
  else if (prot) badge = `<span class="rl-badge prot"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path></svg>修士保護</span>`;
  else if (offline) badge = `<span class="rl-badge off">離線</span>`;
  else badge = `<span class="rl-badge ghost">·</span>`;
  return `
    <div class="rl-seat ${alive ? "" : "out"}" data-rl-seat="${esc(id)}">
      ${rlPortrait(id, 64, { active, grey: !alive })}
      <span class="rl-nameplate" style="border-bottom-color:${RL_AV[rlSeatIdx(id)][1]}">${esc(rlRealName(id))}</span>
      ${badge}
      ${rlTokens(game.tokens?.[id] || 0, game.target, 15)}
      <div class="rl-discards">${(game.discards?.[id] || []).map((n) => rlThumb(n, 24)).join("") || '<span class="rl-none">未出過牌</span>'}</div>
    </div>`;
}

function rlRemainingHtml(game) {
  if (!game.assist) return "";
  const seen = {};
  for (const list of Object.values(game.discards || {})) for (const n of list) seen[n] = (seen[n] || 0) + 1;
  return `
    <details class="rl-remain" open>
      <summary>剩餘牌數（只計已公開嘅牌）</summary>
      <div class="rl-remain-grid">
        ${Object.entries(RL_CARDS).map(([n, c]) => {
          const left = c.count - (seen[n] || 0);
          return `<span class="${left <= 0 ? "zero" : ""}">${n} ${c.name}</span><b class="${left <= 0 ? "zero" : ""}">${left} / ${c.count}</b>`;
        }).join("")}
      </div>
    </details>`;
}

function rlLogHtml(game) {
  const list = [...(game.log || [])].filter((e) => e.round === game.round).reverse().slice(0, 8);
  if (!list.length) return "";
  return `
    <details class="rl-log">
      <summary>今局出牌紀錄（${list.length}）</summary>
      ${list.map((e) => `<p>${esc(rlDescribe(e))}</p>`).join("")}
    </details>`;
}

function rlRenderTable(game) {
  const me = S.playerId;
  const inRound = (game.players || []).includes(me);
  const alive = (game.alive || []).includes(me);
  const myTurn = game.phase === "turn" && game.currentId === me;
  const hand = game.myHand || [];
  if (!myTurn || S.g11Sel?.turnSeq !== game.turnSeq) S.g11Sel = myTurn ? { turnSeq: game.turnSeq, card: null, target: null, guess: null } : null;
  const sel = S.g11Sel;
  const others = (game.players || []).filter((id) => id !== me);
  const last = (game.log || []).filter((e) => e.round === game.round).at(-1);
  const status = myTurn ? "輪到你出牌" : game.currentId ? `輪到${rlName(game.currentId)}出牌` : "";

  const picking = myTurn && sel?.card && RL_TARGETED.includes(sel.card) && (game.myTargets?.[sel.card] || []).length > 0;

  const center = picking ? rlPickerHtml(game, sel) : `
    <div class="rl-table">
      <div class="rl-table-inner"></div>
      <div class="rl-pile">
        <div class="rl-deck">${rlBackImg(64, "s3")}${rlBackImg(64, "s2")}${rlBackImg(64, "s1")}</div>
        <span>牌庫 ${game.deckCount} 張</span>
      </div>
      <div class="rl-center">
        <div id="time" class="timer"></div>
        <strong>${esc(status)}</strong>
        ${last ? `<span class="rl-last">上一步：${esc(rlDescribe(last))}</span>` : ""}
      </div>
      <div class="rl-pile">
        ${rlBackImg(46, "removed")}
        <span>蓋住 1 張</span>
      </div>
    </div>`;

  let handArea = "";
  if (inRound) {
    if (!alive) {
      handArea = `<div class="rl-out-banner">你呢局已經出局，等下一局啦</div>`;
    } else {
      const cards = hand.map((n) => rlCard(n, 150, {
        selected: myTurn && sel?.card === n,
        onclick: myTurn ? `g11Pick(${n})` : ""
      })).join("");
      const picked = myTurn && sel?.card ? sel.card : null;
      let action = "";
      if (myTurn) {
        if (!picked) action = `<p class="rl-hint">揀一張牌打出</p>`;
        else if (!picking) {
          const noTarget = RL_TARGETED.includes(picked) && !(game.myTargets?.[picked] || []).length;
          action = `
            <p class="rl-effect"><b>${RL_CARDS[picked].name}：</b>${esc(RL_CARDS[picked].effect)}</p>
            ${noTarget ? `<p class="rl-hint">其他人全部有修士保護，打出後冇效果</p>` : ""}
            ${picked === 8 ? `<p class="rl-warn">打出公主會即刻出局！</p>` : ""}
            <button type="button" class="rl-btn" onclick="g11Confirm()">打出 ${RL_CARDS[picked].name}</button>`;
        }
      } else if (hand.length === 1) {
        action = `<p class="rl-effect"><b>${RL_CARDS[hand[0]]?.name}：</b>${esc(RL_CARDS[hand[0]]?.effect || "")}</p>`;
      }
      handArea = `
        <div class="rl-hand-wrap">
          <div class="rl-hand-label"><span>你嘅手牌</span>${rlTokens(game.tokens?.[me] || 0, game.target, 18)}</div>
          <div class="rl-hand">${cards}</div>
          ${action}
        </div>`;
    }
  } else {
    handArea = `<div class="rl-out-banner">你喺度觀戰緊</div>`;
  }

  $("#gamePanel").innerHTML = `
    <div class="rl-root ${myTurn ? "my-turn" : ""}">
      ${rlHead(game)}
      <div class="rl-seats" style="--n:${Math.max(1, others.length)}">${others.map((id) => rlSeatHtml(id, game)).join("")}</div>
      ${center}
      ${picking ? "" : handArea}
      ${rlRemainingHtml(game)}
      ${rlLogHtml(game)}
    </div>`;

  if (!picking) startTimer($("#time"), game.endsAt);
  else startTimer($("#rlPickTime"), game.endsAt);
}

function rlPickerHtml(game, sel) {
  const card = sel.card;
  const targets = game.myTargets?.[card] || [];
  const all = (game.players || []).filter((id) => (card === 5 || id !== S.playerId) && (game.alive || []).includes(id));
  const seen = {};
  for (const list of Object.values(game.discards || {})) for (const n of list) seen[n] = (seen[n] || 0) + 1;
  const targetBtns = all.map((id) => {
    const ok = targets.includes(id);
    const prot = (game.protected || []).includes(id);
    const label = id === S.playerId ? "自己" : rlRealName(id);
    const note = prot ? "（修士保護中）" : "";
    return `<button type="button" class="rl-target ${sel.target === id ? "picked" : ""}" ${ok ? `onclick="g11Target('${esc(id)}')"` : "disabled"} aria-pressed="${sel.target === id ? "true" : "false"}">
        ${rlMiniAv(id, 28)}<span class="rl-target-name">${esc(label)}${note}</span>
        <span class="rl-target-discards">${(game.discards?.[id] || []).map((n) => rlThumb(n, 18)).join("")}</span>
      </button>`;
  }).join("");
  const guessBtns = card === 1 ? [2, 3, 4, 5, 6, 7, 8].map((n) => {
    const gone = (seen[n] || 0) >= RL_CARDS[n].count;
    return `<button type="button" class="rl-guess ${sel.guess === n ? "picked" : ""}" ${gone ? "disabled" : `onclick="g11Guess(${n})"`} aria-pressed="${sel.guess === n ? "true" : "false"}">
        ${rlThumb(n, 30)}<span>${n} ${RL_CARDS[n].name}${gone ? "（已出晒）" : ""}</span>
      </button>`;
  }).join("") : "";
  const ready = sel.target && (card !== 1 || sel.guess);
  const confirmText = !sel.target ? "揀一名玩家" : card === 1 && !sel.guess ? "揀要估嘅牌" :
    card === 1 ? `確定：估${rlName(sel.target)}係${RL_CARDS[sel.guess].name}` :
    card === 5 && sel.target === S.playerId ? "確定：棄掉自己手牌" :
    `確定：${RL_CARDS[card].name}指定${rlName(sel.target)}`;
  return `
    <div class="rl-picker">
      <div class="rl-picker-card">
        <span class="rl-picker-label">你打出</span>
        ${rlCard(card, 170)}
        <div id="rlPickTime" class="timer"></div>
      </div>
      <div class="rl-picker-main">
        <p class="rl-effect"><b>${RL_CARDS[card].name}：</b>${esc(RL_CARDS[card].effect)}</p>
        <p class="rl-step">① 揀一名玩家</p>
        <div class="rl-targets">${targetBtns}</div>
        ${card === 1 ? `<p class="rl-step">② 估${sel.target ? rlName(sel.target) : "佢"}手上係咩牌</p><div class="rl-guesses">${guessBtns}</div><p class="rl-hint">唔可以估衛兵；已經出晒嘅牌會變灰</p>` : ""}
        <div class="rl-picker-actions">
          <button type="button" class="rl-btn ghost" onclick="g11Back()">返回</button>
          <button type="button" class="rl-btn" onclick="g11Confirm()" ${ready ? "" : "disabled"}>${esc(confirmText)}</button>
        </div>
      </div>
    </div>`;
}

window.g11Pick = (n) => {
  const game = S.room?.gameState;
  if (!game || game.currentId !== S.playerId || !S.g11Sel) return;
  S.g11Sel = { turnSeq: game.turnSeq, card: S.g11Sel.card === n && !RL_TARGETED.includes(n) ? null : n, target: null, guess: null };
  // 王子：其他人全部受保護時只可以指自己，直接幫佢揀
  const targets = game.myTargets?.[n] || [];
  if (n === 5 && targets.length === 1) S.g11Sel.target = targets[0];
  rlRenderTable(game);
  document.querySelector("#gamePanel .rl-picker")?.scrollIntoView({ block: "start", behavior: "smooth" });
};
window.g11Target = (id) => {
  if (!S.g11Sel) return;
  S.g11Sel.target = id;
  rlRenderTable(S.room.gameState);
};
window.g11Guess = (n) => {
  if (!S.g11Sel) return;
  S.g11Sel.guess = n;
  rlRenderTable(S.room.gameState);
};
window.g11Back = () => {
  if (!S.g11Sel) return;
  S.g11Sel.card = null;
  S.g11Sel.target = null;
  S.g11Sel.guess = null;
  rlRenderTable(S.room.gameState);
};
window.g11Confirm = async () => {
  const game = S.room?.gameState;
  const sel = S.g11Sel;
  if (!game || !sel?.card || game.currentId !== S.playerId) return;
  const targets = game.myTargets?.[sel.card] || [];
  if (targets.length && RL_TARGETED.includes(sel.card)) {
    if (!sel.target) return flash("請揀一名玩家。");
    if (sel.card === 1 && !sel.guess) return flash("請揀要估嘅牌。");
  }
  if (sel.card === 8) {
    const ok = await askConfirm("打出公主會即刻出局，肯定？");
    if (!ok) return;
  }
  send({ type: "g11:play", card: sel.card, targetId: targets.length ? sel.target : null, guess: sel.guess });
};

/* ---------- 一局完結 ---------- */
function rlRenderRoundover(game) {
  clearInterval(S.timer);
  const res = game.roundResult || {};
  const winners = res.winners || [];
  const reveal = res.reveal || {};
  const ready = new Set(game.ready || []);
  const me = S.playerId;
  const inMatch = (game.order || []).includes(me);
  const reason = res.reason === "last" ? "其他人全部出局" : "牌庫已經抽完，留低嘅玩家翻牌比大細";
  const outs = (game.log || []).filter((e) => e.round === game.round && ((e.out || []).length || e.kind === "countess"));
  const connected = (game.order || []).filter((id) => S.room.players.find((p) => p.id === id)?.connected);
  const readyCount = connected.filter((id) => ready.has(id)).length;

  const survivors = Object.keys(reveal).map((id) => {
    const win = winners.includes(id);
    const n = reveal[id];
    return `
      <div class="rl-surv ${win ? "win" : ""}">
        <span class="rl-surv-tag">${win ? "本局勝出" : "&nbsp;"}</span>
        <div class="rl-surv-card">${n ? rlCard(n, 120) : ""}${win ? `<span class="rl-surv-seal">${rlFavour(50)}</span>` : ""}</div>
        <span class="rl-nameplate" style="border-bottom-color:${RL_AV[rlSeatIdx(id)][1]}">${esc(rlName(id))}</span>
        ${res.tieBreak ? `<small class="rl-sum">出過嘅牌合計 ${res.discardSums?.[id] ?? 0}</small>` : ""}
      </div>`;
  }).join("");

  const rows = (game.order || []).map((id) => {
    const p = S.room.players.find((x) => x.id === id);
    const isReady = ready.has(id);
    const plus = winners.includes(id) ? '<span class="rl-plus">+1</span>' : "";
    let st;
    if (game.matchOver) st = "";
    else if (!p?.connected) st = `<span class="rl-rd off">離線</span>`;
    else if (isReady) st = `<span class="rl-rd ok"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>準備好</span>`;
    else if (id === me) st = `<span class="rl-rd">等緊你</span>`;
    else st = `<button type="button" class="rl-nudge" onclick="g11Nudge('${esc(id)}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"></path><path d="M10 20a2 2 0 0 0 4 0"></path></svg>提醒</button>`;
    return `
      <div class="rl-score-row ${id === me ? "me" : ""}">
        ${rlMiniAv(id, 24)}
        <span class="rl-score-name">${esc(rlName(id))}</span>${plus}
        ${rlTokens(game.tokens?.[id] || 0, game.target, 16)}
        <span class="rl-score-st">${st}</span>
      </div>`;
  }).join("");

  const champ = game.matchOver ? (game.order || []).filter((id) => (game.tokens?.[id] || 0) >= game.target) : [];
  const meReady = ready.has(me);
  const foot = game.matchOver
    ? `<p class="rl-matchover">${esc(champ.map(rlName).join("、"))} 集齊 ${game.target} 枚好感！即將公佈成場結果……</p>`
    : inMatch
      ? `<div class="rl-ready-bar">
          <span><b>${readyCount} / ${connected.length}</b> 準備好　全部人準備好就開始第 ${game.round + 1} 局</span>
          <button type="button" class="rl-btn ${meReady ? "done" : ""}" onclick="g11Ready(${meReady ? "false" : "true"})">${meReady ? "已準備（撳一下取消）" : "準備好"}</button>
        </div>`
      : `<p class="rl-hint">等緊玩家準備下一局</p>`;

  $("#gamePanel").innerHTML = `
    <div class="rl-root rl-roundover">
      ${rlHead(game)}
      <div class="rl-ro-title">
        <div class="rl-ro-plaque">第 ${game.round} 局完結</div>
        <span>${esc(reason)}</span>
      </div>
      <div class="rl-ro-body">
        <div class="rl-ro-left">
          <div class="rl-ro-table">${survivors}</div>
          <div class="rl-ro-events">
            ${outs.map((e) => `<p>${e.card ? rlThumb(e.card, 20) : rlThumb(7, 20)}<span>${esc(rlDescribe(e))}</span></p>`).join("")}
            ${res.removed ? `<p>${rlThumb(res.removed, 20)}<span>一開始蓋住嗰張係<b>${RL_CARDS[res.removed].name}</b></span></p>` : `<p><span>一開始蓋住嗰張已經被王子抽咗</span></p>`}
            ${res.tieBreak ? `<p class="rl-note">翻牌同數字：比較各人出過嘅牌數字合計，最大嗰個勝出</p>` : ""}
          </div>
        </div>
        <div class="rl-ro-right">
          <p class="rl-ro-sub">好感標記（${game.target} 枚勝出）・準備狀態</p>
          ${rows}
        </div>
      </div>
      ${foot}
    </div>`;
}

window.g11Ready = (v) => send({ type: "g11:ready", ready: !!v });
window.g11Nudge = (id) => send({ type: "g11:nudge", targetId: id });
window.g11EndEarly = async () => {
  const ok = await askConfirm("肯定提前結算？之後就唔可以再繼續呢局。");
  if (!ok) return;
  send({ type: "g11:end" });
};

/* ---------- 被提醒彈窗 & 提示 ---------- */
function g11ShowNudge(msg) {
  document.querySelector(".rl-nudge-ov")?.remove();
  const g = S.room?.gameState;
  if (!g || g.phase !== "roundover") return;
  const others = (msg.waiting || []).filter((n) => n !== rlRealName(S.playerId));
  const ov = document.createElement("div");
  ov.className = "rl-nudge-ov";
  ov.innerHTML = `
    <div class="rl-nudge-box" role="alertdialog" aria-label="${esc(msg.from)} 提你準備">
      <span class="rl-nudge-seal">${rlFavour(56)}</span>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="${RL_WINE}" stroke-width="2" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"></path><path d="M10 20a2 2 0 0 0 4 0"></path><path d="M3 7l2 1M21 7l-2 1"></path></svg>
      <p class="rl-nudge-title"><span>${esc(msg.from)}</span> 提你快啲準備！</p>
      <p class="rl-nudge-sub">${msg.readyCount ? `已經有 ${msg.readyCount} 位準備好，` : ""}仲等緊${others.length ? `你同 ${esc(others.join("、"))}` : "你一個"}</p>
      <div class="rl-nudge-actions">
        <button type="button" class="rl-btn" data-act="ready">準備好</button>
        <button type="button" class="rl-btn ghost" data-act="later">等多陣</button>
      </div>
    </div>`;
  ov.addEventListener("click", (event) => {
    const act = event.target.closest("[data-act]")?.dataset.act;
    if (act === "ready") send({ type: "g11:ready", ready: true });
    if (act) ov.remove();
  });
  document.body.appendChild(ov);
  window.SFX?.play("turn");
}

function g11Toast(text) {
  document.querySelector(".rl-toast")?.remove();
  const t = document.createElement("div");
  t.className = "rl-toast";
  t.setAttribute("role", "status");
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------- 成場結果（連可長按儲存嘅結果圖） ---------- */
const RL_TITLES = [
  { key: "guardHits", name: "料事如神", unit: (v) => `衛兵估中 ${v} 次`, icon: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 1v5M12 18v5M1 12h5M18 12h5"></path>' },
  { key: "kills", name: "宮廷殺手", unit: (v) => `令 ${v} 人出局`, icon: '<path d="M12 2l2 4v9h-4V6z"></path><path d="M7 15h10"></path><path d="M12 15v6"></path>' },
  { key: "peeks", name: "隔牆有耳", unit: (v) => `偷睇手牌 ${v} 次`, icon: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>' },
  { key: "firstOut", name: "炮灰", unit: (v) => `${v} 局都係第一個出局`, icon: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path><path d="M12 5l-2 5 3 2-2 5"></path>' }
];

function rlRenderGameover(game) {
  clearInterval(S.timer);
  const ranking = game.ranking || [];
  const top = ranking.length ? ranking[0].score : 0;
  const champs = top > 0 ? ranking.filter((p) => p.score === top) : [];
  const rankOf = (score) => 1 + ranking.filter((p) => p.score > score).length;
  const isHost = S.room.hostId === S.playerId;
  const titles = game.titles || {};
  const key = JSON.stringify([ranking, titles, game.round]);
  if (S.g11GameoverKey === key && $("#gamePanel .rl-final")) return;
  S.g11GameoverKey = key;

  $("#gamePanel").innerHTML = `
    <div class="rl-root rl-final">
      <div class="rl-final-card" id="rlFinalCard">
        <div class="rl-final-head"><span>ROYAL LETTER</span><small>宮廷密函 · 共 ${game.round} 局${game.endedEarly ? "（提前結算）" : ""}</small></div>
        <div class="rl-final-top">
          <div class="rl-champ">
            ${champs.length ? champs.slice(0, 2).map((p) => rlPortrait(p.id, champs.length > 1 ? 110 : 150, { crown: true, active: true })).join("") : ""}
            <div class="rl-ro-plaque">宮廷之主</div>
            <strong>${esc(champs.map((p) => p.nickname).join("、") || "冇人")}</strong>
            ${champs.length ? rlTokens(top, game.target, 22) : ""}
          </div>
          <div class="rl-rank">
            <p class="rl-ro-sub">最終排名</p>
            ${ranking.map((p) => `
              <div class="rl-rank-row ${champs.some((c) => c.id === p.id) ? "first" : ""} ${p.id === S.playerId ? "me" : ""}">
                <span class="rl-rank-n">${rankOf(p.score)}</span>${rlMiniAv(p.id, 26)}
                <span class="rl-rank-name">${esc(p.nickname)}${p.id === S.playerId ? "（你）" : ""}</span>
                ${rlTokens(p.score, game.target, 16)}
              </div>`).join("")}
          </div>
        </div>
        <div class="rl-titles">
          ${RL_TITLES.map((t) => {
            const v = titles[t.key] || { ids: [], value: 0 };
            return `
              <div class="rl-title">
                <span class="rl-title-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${RL_GOLD_L}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg></span>
                <span class="rl-title-txt"><b>${t.name}</b><span>${v.ids.length ? esc(v.ids.map(rlRealName).join("、")) : "—"}</span><small>${v.ids.length ? esc(t.unit(v.value)) : "冇人"}</small></span>
              </div>`;
          }).join("")}
        </div>
      </div>
      <p class="rl-hint">手機長按圖片就可以儲存　<a id="rlShotDl" class="rl-dl hidden">下載圖片</a></p>
      <div class="rl-final-actions">
        <button type="button" class="rl-btn ghost" onclick="leaveRoom()">離開房間</button>
        ${isHost ? `<button type="button" class="rl-btn" onclick="g11Restart()">再來一場</button>` : `<p class="rl-hint">等房主決定再來一場</p>`}
      </div>
    </div>`;

  rlMakeShot(game, ranking, champs, titles).catch(() => {});
}

window.g11Restart = async () => {
  const ok = await askConfirm("用同一個設定再來一場？");
  if (!ok) return;
  send({ type: "game:restart" });
};

// 結果圖：canvas 畫一張（肖像、排名、稱號），畫好就取代網頁版結果卡，手機長按即可儲存
function rlSvgImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '));
  });
}

async function rlMakeShot(game, ranking, champs, titles) {
  const key = S.g11GameoverKey;
  try {
    await Promise.all([
      document.fonts?.load('700 40px "Noto Serif TC"'),
      document.fonts?.load('700 30px "Cinzel"')
    ]);
  } catch (e) {}
  const W = 720, rowH = 56, scale = 2;
  const nChamp = Math.min(2, champs.length);
  const titleRows = Math.ceil(RL_TITLES.length / 2);
  const rankTop = nChamp ? 548 : 190;
  const titleTop = rankTop + 44 + ranking.length * rowH + 22;
  const H = titleTop + titleRows * 100 + 50;

  const ids = [...new Set(ranking.map((p) => p.id))];
  const avatars = {};
  const fav = await rlSvgImage(rlFavour(60, true));
  const favEmpty = await rlSvgImage(rlFavour(60, false));
  for (const id of ids) {
    const [kind] = RL_AV[rlSeatIdx(id)];
    avatars[id] = await rlSvgImage(rlAvatarSvg(kind, 240, 270));
  }
  const icons = [];
  for (const t of RL_TITLES) icons.push(await rlSvgImage(`<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="${RL_GOLD_L}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg>`));

  const cv = document.createElement("canvas");
  cv.width = W * scale;
  cv.height = H * scale;
  const ctx = cv.getContext("2d");
  ctx.scale(scale, scale);
  const serif = '"Noto Serif TC", "Songti TC", serif';
  const cinzel = '"Cinzel", Georgia, serif';
  const fit = (text, max) => { let t = text; while (ctx.measureText(t).width > max && t.length > 1) t = t.slice(0, -1); return t === text ? t : t + "…"; };
  const tokens = (n, total, cx, cy, d) => {
    const gap = d + 4;
    let x = cx - ((total - 1) * gap) / 2;
    for (let i = 0; i < total; i++, x += gap) ctx.drawImage(i < n ? fav : favEmpty, x - d / 2, cy - d / 2, d, d);
  };

  // 底：松林綠 + 雙金框
  ctx.fillStyle = RL_PINE; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = RL_GOLD; ctx.lineWidth = 5; ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.strokeStyle = RL_GOLD_D; ctx.lineWidth = 1.5; ctx.strokeRect(25, 25, W - 50, H - 50);
  ctx.textAlign = "center";
  ctx.fillStyle = RL_GOLD_L; ctx.font = `700 24px ${cinzel}`;
  ctx.fillText("ROYAL LETTER", W / 2, 72);
  ctx.fillStyle = "#DCE6D6"; ctx.font = `700 16px ${serif}`;
  ctx.fillText(`宮廷密函 · 共 ${game.round} 局${game.endedEarly ? "（提前結算）" : ""}`, W / 2, 100);

  // 冠軍：鍍金橢圓肖像 + 皇冠
  if (nChamp) {
    const rx = nChamp > 1 ? 62 : 76, ry = nChamp > 1 ? 76 : 92, cy = 250;
    champs.slice(0, 2).forEach((p, i) => {
      const cx = nChamp > 1 ? W / 2 + (i ? 92 : -92) : W / 2;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = RL_AV[rlSeatIdx(p.id)][1]; ctx.fill();
      ctx.clip();
      const aw = rx * 1.75, ah = aw * 1.12;
      ctx.drawImage(avatars[p.id], cx - aw / 2, cy + ry - ah + 4, aw, ah);
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = RL_GOLD; ctx.lineWidth = 8; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, rx + 6, ry + 6, 0, 0, Math.PI * 2);
      ctx.strokeStyle = RL_GOLD_D; ctx.lineWidth = 2; ctx.stroke();
      // 皇冠
      const top = cy - ry - 8, cw = 30;
      ctx.beginPath();
      ctx.moveTo(cx - cw, top + 8); ctx.lineTo(cx - cw, top - 20); ctx.lineTo(cx - cw / 2, top - 6);
      ctx.lineTo(cx, top - 30); ctx.lineTo(cx + cw / 2, top - 6); ctx.lineTo(cx + cw, top - 20); ctx.lineTo(cx + cw, top + 8); ctx.closePath();
      ctx.fillStyle = RL_GOLD_L; ctx.fill(); ctx.strokeStyle = RL_GOLD_D; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, top - 2, 5, 0, Math.PI * 2); ctx.fillStyle = RL_WINE; ctx.fill();
    });
    // 名牌
    const py = cy + ry + 26;
    ctx.fillStyle = RL_CREAM; ctx.fillRect(W / 2 - 86, py, 172, 42);
    ctx.strokeStyle = RL_GOLD; ctx.lineWidth = 2.5; ctx.strokeRect(W / 2 - 86, py, 172, 42);
    ctx.strokeStyle = RL_GOLD_D; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - 92, py - 6, 184, 54);
    ctx.fillStyle = RL_WINE; ctx.font = `700 23px ${serif}`;
    ctx.fillText("宮廷之主", W / 2, py + 30);
    ctx.fillStyle = RL_CREAM; ctx.font = `700 34px ${serif}`;
    ctx.fillText(fit(champs.map((p) => p.nickname).join("、"), W - 140), W / 2, py + 96);
    tokens(champs[0].score, game.target, W / 2, py + 128, 26);
  } else {
    ctx.fillStyle = RL_CREAM; ctx.font = `700 26px ${serif}`;
    ctx.fillText("今場冇人攞到好感", W / 2, 160);
  }

  // 排名
  let y = rankTop;
  ctx.textAlign = "left";
  ctx.fillStyle = RL_GOLD_L; ctx.font = `700 18px ${serif}`;
  ctx.fillText("最終排名", 60, y + 18);
  ctx.strokeStyle = RL_GOLD_D; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(60, y + 30); ctx.lineTo(W - 60, y + 30); ctx.stroke();
  y += 44;
  const rankOf = (score) => 1 + ranking.filter((p) => p.score > score).length;
  for (const p of ranking) {
    const first = champs.some((c) => c.id === p.id);
    if (first) { ctx.fillStyle = "rgba(212,180,106,.16)"; ctx.fillRect(60, y, W - 120, rowH - 8); }
    ctx.fillStyle = first ? RL_GOLD_L : "#BFCDBB"; ctx.font = `700 22px ${cinzel}`;
    ctx.fillText(String(rankOf(p.score)), 76, y + 32);
    const ax = 120, ay = y + 24;
    ctx.save();
    ctx.beginPath(); ctx.arc(ax, ay, 17, 0, Math.PI * 2); ctx.fillStyle = RL_AV[rlSeatIdx(p.id)][1]; ctx.fill(); ctx.clip();
    ctx.drawImage(avatars[p.id], ax - 16, ay - 14, 32, 36);
    ctx.restore();
    ctx.beginPath(); ctx.arc(ax, ay, 17, 0, Math.PI * 2); ctx.strokeStyle = RL_GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = RL_CREAM; ctx.font = `700 20px ${serif}`;
    ctx.fillText(fit(p.nickname, 300), 150, y + 31);
    tokens(p.score, game.target, W - 60 - (game.target * 26) / 2 - 10, y + 24, 22);
    y += rowH;
  }

  // 稱號
  const colW = (W - 120) / 2;
  RL_TITLES.forEach((t, i) => {
    const v = titles[t.key] || { ids: [], value: 0 };
    const x = 60 + (i % 2) * colW;
    const yy = titleTop + Math.floor(i / 2) * 100;
    ctx.fillStyle = "rgba(239,228,204,.06)"; ctx.fillRect(x + 4, yy, colW - 8, 86);
    ctx.strokeStyle = RL_GOLD_D; ctx.lineWidth = 1; ctx.strokeRect(x + 4, yy, colW - 8, 86);
    ctx.beginPath(); ctx.arc(x + 44, yy + 43, 24, 0, Math.PI * 2); ctx.strokeStyle = RL_GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.drawImage(icons[i], x + 30, yy + 29, 28, 28);
    ctx.fillStyle = RL_GOLD_L; ctx.font = `700 19px ${serif}`;
    ctx.fillText(t.name, x + 80, yy + 30);
    ctx.fillStyle = RL_CREAM; ctx.font = `700 17px ${serif}`;
    ctx.fillText(fit(v.ids.length ? v.ids.map(rlRealName).join("、") : "—", colW - 100), x + 80, yy + 56);
    ctx.fillStyle = "#BFCDBB"; ctx.font = `14px ${serif}`;
    ctx.fillText(v.ids.length ? t.unit(v.value) : "冇人", x + 80, yy + 76);
  });

  const url = cv.toDataURL("image/png");
  const card = $("#rlFinalCard");
  if (!card || S.g11GameoverKey !== key) return;
  const champName = champs.map((p) => p.nickname).join("、");
  card.outerHTML = `<img class="rl-shot" id="rlFinalCard" src="${url}" alt="宮廷密函結果：宮廷之主 ${esc(champName || "冇人")}；排名 ${esc(ranking.map((p) => `${p.nickname} ${p.score} 枚`).join("，"))}">`;
  const dl = $("#rlShotDl");
  if (dl) {
    dl.href = url;
    dl.download = `royal-letter-${S.room?.code || ""}.png`;
    dl.classList.remove("hidden");
  }
}

/* ---------- 出牌動畫：升起 → 轉一圈 → 停 1 秒 → 飛去出牌者位置 ---------- */
function rlQueueAnimations(game) {
  if (S.g11Seen === null || S.g11Seen === undefined || (S.g11SeenRound && S.g11SeenRound > game.round) || (game.actionSeq || 0) < S.g11Seen) {
    S.g11Seen = game.actionSeq || 0;
    S.g11SeenRound = game.round;
    return;
  }
  const fresh = (game.log || []).filter((e) => e.seq > S.g11Seen);
  S.g11Seen = Math.max(S.g11Seen, game.actionSeq || 0);
  S.g11SeenRound = game.round;
  if (!fresh.length) return;
  S.g11AnimQ = [...(S.g11AnimQ || []), ...fresh];
  if (!S.g11Animating) rlRunQueue();
}

function rlRunQueue() {
  const e = (S.g11AnimQ || []).shift();
  if (!e) { S.g11Animating = false; return; }
  S.g11Animating = true;
  rlAnimate(e, () => rlRunQueue());
}

function rlAnimate(e, done) {
  const reduce = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (x) { return false; } })();
  const card = e.kind === "countess" ? 7 : e.card;
  if (!RL_CARDS[card]) return done();
  const ov = document.createElement("div");
  ov.className = "rl-anim-ov";
  ov.setAttribute("aria-hidden", "true");
  ov.innerHTML = `<div class="rl-anim-card">${rlCard(card, 160)}</div><p class="rl-anim-cap">${esc(rlDescribe(e))}</p>`;
  document.body.appendChild(ov);
  // 讀屏：用 status 讀出
  g11Live(rlDescribe(e));
  window.SFX?.play((e.out || []).length || e.kind === "countess" ? "reveal" : "g3_flip");

  // 動畫範圍：遊戲畫面嗰格（睇得到嘅部分），唔係成個視窗
  const panel = document.querySelector("#gamePanel")?.getBoundingClientRect();
  const box = panel && panel.width > 200
    ? { left: Math.max(0, panel.left), top: Math.max(0, panel.top), right: Math.min(window.innerWidth, panel.right), bottom: Math.min(window.innerHeight, panel.bottom) }
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  if (box.bottom - box.top < 420) { box.top = 0; box.bottom = window.innerHeight; }
  Object.assign(ov.style, { left: box.left + "px", top: box.top + "px", width: box.right - box.left + "px", height: box.bottom - box.top + "px" });
  const el = ov.querySelector(".rl-anim-card");
  const cap = ov.querySelector(".rl-anim-cap");
  const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
  const seat = e.by === S.playerId ? document.querySelector(".rl-hand-wrap, .rl-out-banner") : document.querySelector(`[data-rl-seat="${CSS.escape(e.by)}"]`);
  const r = seat?.getBoundingClientRect();
  const from = r ? { x: r.left + r.width / 2 - cx, y: r.top + r.height / 2 - cy } : { x: 0, y: (box.bottom - box.top) * 0.35 };
  const total = reduce ? 1600 : 2200;
  const kf = reduce
    ? [{ opacity: 0, transform: "translate(0,0) scale(1.2)" }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0, transform: "translate(0,0) scale(1.2)" }]
    : [
        { transform: `translate(${from.x}px,${from.y}px) scale(.45) rotateY(0deg)`, opacity: 0.6 },
        { transform: "translate(0,0) scale(1.3) rotateY(0deg)", opacity: 1, offset: 0.14 },
        { transform: "translate(0,0) scale(1.3) rotateY(360deg)", opacity: 1, offset: 0.36 },
        { transform: "translate(0,0) scale(1.3) rotateY(360deg)", opacity: 1, offset: 0.82 },
        { transform: `translate(${from.x}px,${from.y}px) scale(.22) rotateY(360deg)`, opacity: 0 }
      ];
  try {
    el.animate(kf, { duration: total, easing: "ease-in-out", fill: "forwards" });
    cap.animate([{ opacity: 0 }, { opacity: 0, offset: 0.36 }, { opacity: 1, offset: 0.42 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: total, fill: "forwards" });
  } catch (x) {}
  setTimeout(() => { ov.remove(); done(); }, total + 40);
}

function g11Live(text) {
  let live = document.getElementById("rlLive");
  if (!live) {
    live = document.createElement("div");
    live.id = "rlLive";
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    document.body.appendChild(live);
  }
  live.textContent = text;
}

/* ---------- 開房設定（跟設計稿：羊皮紙卡放喺墨綠暗花背景上） ---------- */
function g11OpenSettings() {
  document.querySelector(".rl-set-ov")?.remove();
  const sec = S.g11TurnSeconds || 15;
  const assist = !!S.g11Assist;
  const nick = $("#createName")?.value || "";
  const prevFocus = document.activeElement;
  const ov = document.createElement("div");
  ov.className = "rl-set-ov";
  ov.innerHTML = `
    <div class="rl-set" role="dialog" aria-modal="true" aria-labelledby="rlSetTitle">
      <div class="rl-set-side">
        <div class="rl-set-cover">
          <img src="${RL_BACK}" alt="">
          <span class="rl-set-tag"><span>Royal Letter</span>宮廷密函</span>
        </div>
        <div class="rl-set-name">
          <span class="en">Royal Letter</span>
          <span class="zh">宮廷密函</span>
          <span class="desc">每局抽一張、出一張，用宮廷人物嘅能力淘汰對手，最後拎住最大嘅牌就贏。</span>
        </div>
        <div class="rl-set-pills"><span>3–4 人</span><span>約 15–25 分鐘</span><span>香港限定</span></div>
      </div>
      <div class="rl-set-main">
        <p class="rl-set-title" id="rlSetTitle">開房設定</p>
        <div class="rl-set-row">
          <span class="rl-set-label">地區</span>
          <div class="rl-set-val"><span class="rl-set-region">香港</span><small>呢隻遊戲只有香港版，唔可以揀台灣</small></div>
        </div>
        <div class="rl-set-row">
          <span class="rl-set-label">人數</span>
          <div class="rl-set-val"><span>3–4 人，人齊就可以開始</span><small>勝利條件自動設定：3 人局要 5 枚好感，4 人局要 4 枚</small></div>
        </div>
        <div class="rl-set-row">
          <span class="rl-set-label" id="rlSetTimeLbl">出牌時限</span>
          <div class="rl-set-val">
            <div class="rl-seg" role="radiogroup" aria-labelledby="rlSetTimeLbl">
              ${[15, 20, 30].map((n) => `<button type="button" role="radio" data-sec="${n}" aria-checked="${n === sec}" tabindex="${n === sec ? 0 : -1}">${n} 秒</button>`).join("")}
            </div>
            <small>預設 15 秒；夠鐘未出就自動隨機出一張</small>
          </div>
        </div>
        <div class="rl-set-row">
          <span class="rl-set-label">記牌輔助</span>
          <div class="rl-set-val">
            <div class="rl-set-switchrow"><span id="rlSetAssistLbl">顯示剩餘牌數表</span><button type="button" class="rl-switch" role="switch" aria-checked="${assist}" aria-labelledby="rlSetAssistLbl"><span></span></button></div>
            <small>開咗之後，遊戲入面會顯示每款牌仲有幾多張未出。預設關閉，熟手要自己記牌</small>
          </div>
        </div>
        <div class="rl-set-row">
          <label class="rl-set-label" for="rlSetNick">你的暱稱</label>
          <div class="rl-set-val"><input id="rlSetNick" class="rl-set-input" maxlength="16" placeholder="例如：小米" value="${esc(nick)}" autocomplete="nickname"></div>
        </div>
        <div class="rl-set-actions">
          <button type="button" class="rl-btn ghost" data-act="back">返回</button>
          <button type="button" class="rl-btn" data-act="go">開房</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  document.body.classList.add("rl-set-open");

  const close = () => {
    ov.remove();
    document.body.classList.remove("rl-set-open");
    document.removeEventListener("keydown", onKey, true);
    prevFocus?.focus?.();
  };
  const seg = [...ov.querySelectorAll(".rl-seg button")];
  const pick = (btn) => {
    seg.forEach((b) => { b.setAttribute("aria-checked", b === btn ? "true" : "false"); b.tabIndex = b === btn ? 0 : -1; });
    S.g11TurnSeconds = Number(btn.dataset.sec) || 15;
  };
  seg.forEach((btn, i) => {
    btn.addEventListener("click", () => pick(btn));
    btn.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = seg[(i + d + seg.length) % seg.length];
      pick(next);
      next.focus();
    });
  });
  const sw = ov.querySelector(".rl-switch");
  sw.addEventListener("click", () => {
    const on = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", on ? "true" : "false");
    S.g11Assist = on;
  });
  const go = () => {
    const name = ov.querySelector("#rlSetNick").value.trim();
    const field = $("#createName");
    if (field) field.value = name;
    S.g11TurnSeconds = Number(ov.querySelector('.rl-seg [aria-checked="true"]')?.dataset.sec) || 15;
    S.g11Assist = sw.getAttribute("aria-checked") === "true";
    close();
    createRoom();
  };
  ov.querySelector('[data-act="back"]').addEventListener("click", close);
  ov.querySelector('[data-act="go"]').addEventListener("click", go);
  ov.querySelector("#rlSetNick").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const f = [...ov.querySelectorAll('button:not([tabindex="-1"]),input')];
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener("keydown", onKey, true);
  (ov.querySelector('.rl-seg [aria-checked="true"]') || ov.querySelector("#rlSetNick")).focus();
}
window.g11OpenSettings = g11OpenSettings;
