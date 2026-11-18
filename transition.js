/* =========================
   Party 聯機網站 — 開場／結束過場動畫
   開場：遊戲主題色底 + 四邊散落封面元素 + 遊戲名 + loading bar（約 2 秒；再來一場用短版約 1.2 秒）
   結束：「遊戲結束」蓋印 → 主題色掃屏 → 「冠軍係…」震動 → 揭曉 + 彩紙 → 淡出見結果頁（約 5 秒）
   用法：app.js 收到 state 時叫 Transition.onState(prevRoom, room, myId)
   以後加新遊戲：喺 THEMES 加主題色同封面元素就得；冇設定會用預設樣式。
========================= */
(function () {
  const INK = "#1f2740";
  const PURE = "#FEFEF2";
  const ended = (ph) => ph === "gameover" || ph === "final";
  const reduced = () => {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
  };

  /* ---------- 每隻遊戲：封面底色、字色、蓋印色、封面元素（由 ROOM_COVERS 抽出嚟） ---------- */
  const rn = () => 1 + Math.floor(Math.random() * 100); // 數字炸彈嘅數字牌：每次隨機 1–100
  const S3 = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
  const THEMES = {
    game1: { bg: "#F2D965", ink: INK, stamp: "#68779f", motifs: [
      ["94 20 52 52", `<path d="M120 22l7 16 16 7-16 7-7 16-7-16-16-7 16-7z" fill="${PURE}" ${S3}/>`],
      ["8 68 104 150", `<g ${S3}><path d="M14 214c0-34 18-54 44-54s44 20 44 54z" fill="#7a89ae"/><path d="M22 118a38 38 0 0 1 72-16l10 14-8 4c0 18-12 30-28 32h-12a38 38 0 0 1-34-34z" fill="#7a89ae"/></g><circle cx="74" cy="112" r="4" fill="${INK}"/>`],
      ["128 68 104 150", `<g ${S3}><path d="M138 214c0-34 18-54 44-54s44 20 44 54z" fill="${INK}"/><path d="M218 118a38 38 0 0 0-72-16l-10 14 8 4c0 18 12 30 28 32h12a38 38 0 0 0 34-34z" fill="${INK}"/></g><circle cx="166" cy="112" r="4" fill="#F2D965"/>`]
    ] },
    game2: { bg: "#F0EDE5", ink: "#004643", stamp: "#004643", motifs: [
      ["14 44 148 148", `<circle cx="88" cy="118" r="70" fill="#004643" ${S3}/><path d="M52 100q12-10 24 0" fill="none" stroke="#F0EDE5" stroke-width="6" stroke-linecap="round"/><circle cx="110" cy="98" r="8" fill="#F0EDE5"/><path d="M58 150q22 14 44 0" fill="none" stroke="#F0EDE5" stroke-width="6" stroke-linecap="round"/>`],
      ["156 14 60 60", `<circle cx="186" cy="44" r="26" fill="#F2D965" ${S3}/><text x="186" y="57" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="34" fill="${INK}">?</text>`],
      ["0 0 44 44", `<circle cx="22" cy="22" r="20" fill="#3FBFA8"/>`]
    ] },
    game3: { bg: "#FF8A6B", ink: INK, stamp: "#F2795F", motifs: [
      ["10 48 104 168", `<path d="M14 82l46-30h28v132h22v28H14v-28h28V92l-20 10z" fill="${PURE}" ${S3}/>`],
      ["100 60 120 156", `<path d="M180 212C112 168 104 92 140 70c18-10 34 2 40 16 6-14 22-26 40-16 36 22 28 98-40 142z" fill="#F2D9C4" ${S3}/><path d="M140 104q10-16 24-12" fill="none" stroke="${PURE}" stroke-width="6" stroke-linecap="round"/>`],
      ["216 16 44 74", `<path d="M226 84V22" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M228 24l28 11-28 12z" fill="#F2D965" ${S3}/>`]
    ] },
    game4: { bg: "#7B57CE", ink: PURE, stamp: "#7B57CE", motifs: [
      ["84 22 116 116", `<circle cx="132" cy="70" r="42" fill="${PURE}" fill-opacity=".35" stroke="${INK}" stroke-width="9"/><circle cx="132" cy="70" r="42" fill="none" stroke="#FFD166" stroke-width="3"/><path d="M162 100l30 30" stroke="${INK}" stroke-width="14" stroke-linecap="round"/>`],
      ["72 72 86 108", `<g ${S3}><circle cx="115" cy="100" r="24" fill="#FFD166"/><path d="M77 176a38 38 0 0 1 76 0z" fill="#FFD166"/></g>`],
      ["8 88 72 92", `<g fill="${PURE}" ${S3}><circle cx="44" cy="112" r="20"/><path d="M12 176a32 32 0 0 1 64 0z"/></g>`]
    ] },
    game5: { bg: "#AFCBE3", ink: INK, stamp: "#5c8fb0", motifs: [
      ["14 38 202 140", `<path d="M115 62C92 46 52 42 18 50v112c34-8 74-4 97 12z" fill="${PURE}" ${S3}/><path d="M115 62c23-16 63-20 97-12v112c-34-8-74-4-97 12z" fill="${INK}" ${S3}/><g stroke="${INK}" stroke-width="5" stroke-linecap="round"><path d="M36 80q30-4 60 6"/><path d="M36 102q30-4 60 6"/><path d="M36 124q22-3 40 2"/></g><g stroke="#AFCBE3" stroke-width="5" stroke-linecap="round"><path d="M134 86q30-10 60-6"/><path d="M134 108q20-6 36-6"/></g>`],
      ["162 110 56 56", `<circle cx="190" cy="138" r="24" fill="#F2D965" ${S3}/><path d="M180 150l4-12 14-14 6 6-14 14z" fill="${PURE}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M180 150l4-12 6 6z" fill="${INK}"/>`]
    ] },
    game6: { bg: "#B9DD5B", ink: INK, stamp: "#3C5A1E", motifs: [
      ["14 4 128 118", `<path d="M18 30a22 22 0 0 1 22-22h76a22 22 0 0 1 22 22v44a22 22 0 0 1-22 22H62l-26 22 6-22h-2a22 22 0 0 1-22-22z" fill="${INK}"/>`],
      ["78 66 128 118", `<path d="M82 92a22 22 0 0 1 22-22h76a22 22 0 0 1 22 22v44a22 22 0 0 1-22 22h-2l6 22-26-22h-54a22 22 0 0 1-22-22z" fill="${PURE}" ${S3}/>`],
      ["122 38 48 48", `<circle cx="146" cy="62" r="21" fill="#F2D965" ${S3}/><path d="M136 62l7 7 12-13" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`]
    ] },
    game7: { bg: "#F7577A", ink: PURE, stamp: "#7A1030", scale: 1.4, spread: 1.7, motifs: [
      ["34 0 152 194", `<circle cx="110" cy="118" r="72" fill="${INK}"/><path d="M62 96 A52 52 0 0 1 92 64" fill="none" stroke="${PURE}" stroke-width="8" stroke-linecap="round" opacity=".35"/><rect x="90" y="34" width="40" height="20" rx="6" fill="${PURE}" ${S3}/><path d="M110 34 C108 8 140 -2 160 8" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><text x="110" y="146" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="76" fill="#FFD3DD">?</text>`],
      ["130 -50 96 96", `<polygon points="178.0,-48.0 184.2,-25.2 201.0,-41.8 195.0,-19.0 217.8,-25.0 201.2,-8.2 224.0,-2.0 201.2,4.2 217.8,21.0 195.0,15.0 201.0,37.8 184.2,21.2 178.0,44.0 171.8,21.2 155.0,37.8 161.0,15.0 138.2,21.0 154.8,4.2 132.0,-2.0 154.8,-8.2 138.2,-25.0 161.0,-19.0 155.0,-41.8 171.8,-25.2" fill="#F2D965" ${S3}/><polygon points="186.7,-28.6 186.2,-13.3 200.7,-18.5 191.3,-6.3 206.0,-2.0 191.3,2.3 200.7,14.5 186.2,9.3 186.7,24.6 178.0,12.0 169.3,24.6 169.8,9.3 155.3,14.5 164.7,2.3 150.0,-2.0 164.7,-6.3 155.3,-18.5 169.8,-13.3 169.3,-28.6 178.0,-16.0" fill="${PURE}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`],
      ["-20 104 66 66", () => `<g transform="rotate(-10 12 137)"><rect x="-14" y="120" width="52" height="34" rx="10" fill="${PURE}" ${S3}/><text x="12" y="144" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="20" fill="${INK}">${rn()}</text></g>`],
      ["180 88 66 66", () => `<g transform="rotate(8 212 121)"><rect x="186" y="104" width="52" height="34" rx="10" fill="#F2D965" ${S3}/><text x="212" y="128" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="20" fill="${INK}">${rn()}</text></g>`]
    ] },
    game8: { bg: "#22408C", ink: PURE, stamp: "#22408C", motifs: [
      ["24 84 136 86", `<path d="M28 142h128l-16 24H44z" fill="${PURE}" ${S3}/><path d="M56 142v-20h46l14 20" fill="#C9D6F2" ${S3}/><path d="M78 122V88" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><path d="M78 88l22 9-22 8" fill="#F2D965" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M102 131h22" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><rect x="64" y="128" width="8" height="8" rx="2" fill="${INK}"/><rect x="84" y="128" width="8" height="8" rx="2" fill="${INK}"/>`],
      ["110 104 72 64", `<polygon points="146,108 152,124 168,116 160,131 178,134 160,140 168,156 152,148 146,164 140,148 124,156 132,140 114,134 132,131 124,116 140,124" fill="#FF7A59" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><polygon points="146,122 149,131 157,128 152,135 160,138 152,141 156,148 149,145 146,153 143,145 136,148 140,141 132,138 140,135 135,128 143,131" fill="#F2D965"/>`],
      ["134 36 84 84", `<circle cx="176" cy="78" r="26" fill="none" stroke="#F2D965" stroke-width="5"/><circle cx="176" cy="78" r="9" fill="#F2D965" stroke="${INK}" stroke-width="2.5"/><path d="M176 40v18M176 98v18M138 78h18M196 78h18" stroke="#F2D965" stroke-width="5" stroke-linecap="round"/>`]
    ] },
    game9: { bg: "#5FA8C6", ink: INK, stamp: "#1F6F94", maxBig: 3, motifs: [
      ["8 30 244 126", `<path d="M14 150 A116 116 0 0 1 246 150 Z" fill="${PURE}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M130 150 L178.4 44.6 A116 116 0 0 1 192.7 52.4 Z" fill="#F5B82E"/><path d="M130 150 L192.7 52.4 A116 116 0 0 1 205.8 62.3 Z" fill="#F26A3D"/><path d="M130 150 L205.8 62.3 A116 116 0 0 1 217.7 73.5 Z" fill="#5FA8C6"/><path d="M130 150 L217.7 73.5 A116 116 0 0 1 228.1 86.2 Z" fill="#F26A3D"/><path d="M130 150 L228.1 86.2 A116 116 0 0 1 236.8 100.1 Z" fill="#F5B82E"/><path d="M28 150 A102 102 0 0 1 232 150" fill="none" stroke="#929fc1" stroke-width="3" stroke-dasharray="2 14" stroke-linecap="round"/><path d="M130 150 L64 68" stroke="#E0284A" stroke-width="10" stroke-linecap="round"/><circle cx="130" cy="150" r="20" fill="#E0284A" stroke="${INK}" stroke-width="5"/><circle cx="130" cy="150" r="7" fill="${PURE}" opacity=".6"/>`],
      ["0 0 44 44", `<path d="M22 4l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="#F5B82E" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`]
    ] },
    game10: { bg: "#F6F2EA", ink: "#16336E", stamp: "#B5303A", maxBig: 3, motifs: [
      ["24 30 200 176", `<defs><pattern id="trRwb" width="42" height="42" patternUnits="userSpaceOnUse"><rect width="42" height="42" fill="#FFFFFF"/><rect width="14" height="42" fill="#B5303A"/><rect x="21" width="14" height="42" fill="#1A47A0"/></pattern></defs><path d="M84 74 C84 34 156 34 156 74" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M44 72 H196 L210 196 H30 Z" fill="url(#trRwb)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`],
      ["164 104 80 84", `<g transform="rotate(14 214 150)"><path d="M182 112 H236 V178 H182 L170 145 Z" fill="${PURE}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><circle cx="184" cy="145" r="5" fill="#F6F2EA" stroke="${INK}" stroke-width="3"/><text x="212" y="160" text-anchor="middle" font-family="Noto Serif HK, serif" font-weight="900" font-size="40" fill="#B5303A">$?</text></g>`],
      ["0 0 60 44", `<rect x="4" y="6" width="52" height="32" rx="4" fill="${PURE}" stroke="${INK}" stroke-width="3"/><text x="30" y="30" text-anchor="middle" font-family="Noto Serif HK, serif" font-weight="900" font-size="18" fill="#1A47A0">$$</text>`]
    ] },
    game11: { bg: "#1F5640", ink: PURE, stamp: "#7A2335", maxBig: 3, motifs: [
      ["10 30 220 150", `<rect x="16" y="36" width="208" height="138" rx="8" fill="#EFE4CC" stroke="#B8913E" stroke-width="5"/><path d="M16 44 L120 120 L224 44" fill="none" stroke="#B8913E" stroke-width="5" stroke-linejoin="round"/><g transform="translate(120 120)"><circle r="30" fill="#7A2335"/><circle r="22" fill="none" stroke="#D4B46A" stroke-width="3"/><path d="M0 12 C-14 2 -12 -8 -5 -8 C-2 -8 0 -5 0 -3 C0 -5 2 -8 5 -8 C12 -8 14 2 0 12 Z" fill="#D4B46A"/></g>`],
      ["0 0 80 56", `<polygon points="6,50 6,14 24,32 40,4 56,32 74,14 74,50" fill="#D4B46A" stroke="#6E4F1C" stroke-width="3" stroke-linejoin="round"/><circle cx="40" cy="38" r="6" fill="#7A2335"/>`],
      ["0 0 60 60", `<circle cx="30" cy="30" r="24" fill="#7A2335"/><circle cx="30" cy="30" r="17" fill="none" stroke="#D4B46A" stroke-width="2.5"/><text x="30" y="38" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="22" fill="#EFE4CC">8</text>`]
    ] }
  };
  const FALLBACK = { bg: "#F2D965", ink: INK, stamp: INK, motifs: THEMES.game1.motifs };
  const TEAM = { navy: "#22408C", pirate: "#B3192B" };
  const CONFETTI = ["#F2D965", PURE, "#3FBFA8", "#FF8A6B", "#7B57CE", "#AFCBE3", "#F7577A"];

  /* ---------- 文字：跟房間語言（台灣 = 書面語） ---------- */
  const TXT = {
    yue: { tips: ["連接房間中…", "準備緊…", "準備好！"], over: "遊戲結束", champ: "冠軍係", pair1: "最有默契係", pair6: "最 Sync 係", team: "勝出嘅係", draw: "平手！", done: "完成！", none: "冇人勝出" },
    zh: { tips: ["正在連接房間…", "準備中…", "準備好了！"], over: "遊戲結束", champ: "冠軍是", pair1: "最有默契的是", pair6: "最 Sync 的是", team: "勝出的是", draw: "平手！", done: "完成！", none: "沒有人勝出" }
  };

  /* ---------- CSS（自己帶埋，唔使改 style.css） ---------- */
  const css = `
  .tr-ov{position:fixed;inset:0;z-index:10050;overflow:hidden;pointer-events:auto;font-family:"Fredoka","Nunito",system-ui,sans-serif}
  .tr-lay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  .tr-mo{position:absolute;pointer-events:none}
  .tr-mo>div{width:100%;height:100%;animation:tr-in .4s cubic-bezier(.2,.9,.3,1.3) both}
  .tr-mo svg{display:block;width:100%;height:100%;overflow:visible;animation:tr-bob 2.6s ease-in-out infinite alternate}
  .tr-title{font-weight:700;font-size:clamp(22px,5.4vw,52px);line-height:1.15;letter-spacing:-.01em;padding:0 max(52px,16%);word-break:keep-all;margin-bottom:26px;animation:tr-up .45s both}
  .tr-bar{width:min(320px,60vw);height:12px;border-radius:6px;overflow:hidden}
  .tr-bar>i{display:block;height:100%;width:0;border-radius:6px}
  .tr-tip{font-family:"Nunito",system-ui,sans-serif;font-weight:700;font-size:14px;margin-top:12px;opacity:.85}
  .tr-stamp{font-weight:700;font-size:clamp(40px,9vw,84px);padding:.08em .4em;border:.09em solid;border-radius:.16em;background:${PURE};animation:tr-pop .5s both}
  .tr-wipe{animation:tr-wipe .5s cubic-bezier(.7,0,.3,1) both}
  .tr-head{font-weight:700;font-size:clamp(24px,5vw,40px);--a:0;animation:tr-shk .14s linear infinite;transition:font-size .25s,opacity .25s}
  .tr-win{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:1.3em;margin-top:18px;position:relative;font-weight:700;font-size:clamp(40px,9vw,80px);line-height:1.1}
  .tr-win b{font-weight:700;animation:tr-pop2 .45s both;padding:0 6vw}
  .tr-ring{position:absolute;left:50%;top:50%;width:1.6em;height:1.6em;margin:-.8em 0 0 -.8em;border-radius:50%;border:4px solid;animation:tr-burst .6s ease-out both}
  .tr-cf{position:absolute;top:-16px;border-radius:2px;animation:tr-fall linear both}
  .tr-out{transition:opacity .4s;opacity:0}
  @keyframes tr-in{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
  @keyframes tr-bob{from{transform:translateY(-4px) rotate(-4deg)}to{transform:translateY(4px) rotate(4deg)}}
  @keyframes tr-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  @keyframes tr-pop{0%{transform:scale(.3) rotate(-8deg);opacity:0}60%{transform:scale(1.15) rotate(3deg);opacity:1}100%{transform:scale(1) rotate(-4deg)}}
  @keyframes tr-pop2{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}
  @keyframes tr-wipe{from{transform:translateX(-100%)}to{transform:none}}
  @keyframes tr-burst{from{transform:scale(.3);opacity:.7}to{transform:scale(2.6);opacity:0}}
  @keyframes tr-fall{to{transform:translateY(110vh) rotate(600deg)}}
  @keyframes tr-shk{0%,100%{transform:translate(0,0)}25%{transform:translate(calc(var(--a)*-1px),calc(var(--a)*.4px)) rotate(calc(var(--a)*-.3deg))}50%{transform:translate(calc(var(--a)*1px),calc(var(--a)*-.4px))}75%{transform:translate(calc(var(--a)*-.5px),calc(var(--a)*-.6px)) rotate(calc(var(--a)*.3deg))}}
  `;
  let styled = false;
  function addStyle() {
    if (styled) return;
    styled = true;
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---------- 工具 ---------- */
  let ov = null;
  let timers = [];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = (fn, ms) => timers.push(setTimeout(fn, ms));
  const sfx = (n) => { try { window.SFX?.play(n); } catch (e) {} };

  function close() {
    timers.forEach(clearTimeout);
    timers = [];
    ov?.remove();
    ov = null;
  }
  function open(bg) {
    close();
    addStyle();
    ov = document.createElement("div");
    ov.className = "tr-ov";
    ov.setAttribute("aria-hidden", "true");
    if (bg) ov.style.background = bg;
    document.body.appendChild(ov);
    return ov;
  }
  function layer(html, style) {
    const d = document.createElement("div");
    d.className = "tr-lay";
    if (style) d.style.cssText += style;
    d.innerHTML = html;
    ov.appendChild(d);
    return d;
  }
  function fadeOut(ms) {
    T(() => { ov?.classList.add("tr-out"); T(close, 420); }, ms);
  }
  const theme = (game) => THEMES[game] || FALLBACK;
  const txt = (room) => TXT[room?.language === "zh" ? "zh" : "yue"];
  function gameName(game) {
    try { if (typeof COVER_TILE_LABELS !== "undefined" && COVER_TILE_LABELS[game]) return COVER_TILE_LABELS[game].full; } catch (e) {}
    try { if (typeof GAME_NAMES !== "undefined" && GAME_NAMES[game]) return GAME_NAMES[game]; } catch (e) {}
    return "";
  }

  // 固定種子：每隻遊戲每次開場嘅圖案排法都一樣
  function seeded(seed) {
    return () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  }

  /* ---------- 四邊散落封面元素：大細、角度、位置唔一致，大嘅會出少少界 ---------- */
  function border(game) {
    const th = theme(game);
    const W = window.innerWidth, H = window.innerHeight;
    const base = Math.min(W, H);
    const sc = th.scale || 1, sp = th.spread || 1, maxBig = th.maxBig ?? Infinity;
    const lo = Math.max(30, base * 0.07) * sc, hi = Math.max(64, base * 0.19) * sc;
    let bigs = 0;
    const r = seeded(parseInt(String(game).replace(/\D/g, ""), 10) * 131 + 17 || 7);
    let k = 0;
    const put = (x, y, z) => {
      const [vb, art] = th.motifs[k % th.motifs.length];
      const svg = typeof art === "function" ? art() : art;
      const e = document.createElement("div");
      e.className = "tr-mo";
      const rot = Math.round(r() * 70 - 35);
      // 闊身圖案（例如成個轉盤）按比例拉闊，唔會縮到好細
      const [, , vw, vh] = vb.split(" ").map(Number);
      const ar = Math.sqrt(vw / vh || 1);
      const w = z * ar, h = z / ar;
      e.style.cssText = `left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg)`;
      e.innerHTML = `<div style="animation-delay:${(k * 0.03).toFixed(2)}s"><svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" style="animation-delay:${((k % 6) * 0.3).toFixed(1)}s">${svg}</svg></div>`;
      ov.appendChild(e);
      k++;
    };
    // 大圖案有上限（maxBig）：超過就改用細尺寸
    const size = () => {
      let z = lo + r() * (hi - lo);
      if (z > hi * 0.75) { if (bigs >= maxBig) z = lo + r() * (hi * 0.55 - lo); else bigs++; }
      return z;
    };
    const edge = base * 0.06;
    let x = r() * 20;
    while (x < W + hi / 2) { const z = size(); put(x, edge + r() * edge - (z > hi * 0.75 ? z * 0.2 : 0), z); x += (z * 0.75 + 14 + r() * 40) * sp; }
    x = r() * 40;
    while (x < W + hi / 2) { const z = size(); put(x, H - edge - r() * edge + (z > hi * 0.75 ? z * 0.2 : 0), z); x += (z * 0.75 + 14 + r() * 40) * sp; }
    let y = hi * 1.1;
    while (y < H - hi * 1.1) { const z = size() * 0.85; put(edge * 0.6 + r() * edge, y, z); y += (z + 18 + r() * 34) * sp; }
    y = hi * 1.3;
    while (y < H - hi * 1.1) { const z = size() * 0.85; put(W - edge * 0.6 - r() * edge, y, z); y += (z + 18 + r() * 34) * sp; }
  }

  /* ---------- 開場 ---------- */
  function intro(room, short) {
    const th = theme(room.game);
    const t = txt(room);
    open(th.bg);
    border(room.game);
    const barDur = short ? 0.8 : 1.6;
    layer(`
      <div class="tr-title" style="color:${th.ink}">${esc(gameName(room.game))}</div>
      <div class="tr-bar" style="background:${th.ink}22"><i style="background:${th.ink};transition:width ${barDur}s cubic-bezier(.4,0,.2,1)"></i></div>
      <div class="tr-tip" style="color:${th.ink}">${esc(short ? t.tips[1] : t.tips[0])}</div>`);
    const bar = ov.querySelector(".tr-bar>i");
    const tip = ov.querySelector(".tr-tip");
    T(() => { bar.style.width = "100%"; }, 60);
    if (!short) T(() => { tip.textContent = t.tips[1]; }, 750);
    T(() => { tip.textContent = t.tips[2]; }, short ? 650 : 1450);
    fadeOut(short ? 850 : 1750);
  }

  /* ---------- 結算：搵出冠軍（每隻遊戲嘅結果格式唔同） ---------- */
  function nick(room, id, fallback) {
    return room.players?.find((p) => p.id === id)?.nickname || fallback || "玩家";
  }
  function topOf(list, room) {
    const top = list.length ? (list[0].score || 0) : 0;
    if (top <= 0) return [];
    return list.filter((p) => (p.score || 0) === top).map((p) => p.nickname || nick(room, p.id));
  }
  function outcome(room) {
    const g = room.gameState || {};
    const t = txt(room);
    switch (room.game) {
      case "game1": {
        const p = g.results?.pairs?.[0];
        return p ? { head: t.pair1, names: [`${p.aName} × ${p.bName}`] } : { kind: "done" };
      }
      case "game2": {
        const list = [...(room.players || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
        return { head: t.champ, names: topOf(list, room) };
      }
      case "game3":
      case "game4":
        return { head: t.champ, names: topOf(g.finalRanking || [], room) };
      case "game5":
        return { kind: "done" };
      case "game6": {
        if (g.mode === "meet") return { kind: "done" };
        const p = (g.pairs || [])[0];
        return p && p.count > 0 ? { head: t.pair6, names: [`${p.aNickname} × ${p.bNickname}`] } : { head: t.pair6, names: [] };
      }
      case "game8": {
        if (g.mode === "team") {
          const sc = g.scores || {};
          const n = sc.navy?.total || 0, p = sc.pirate?.total || 0;
          if (n === p) return { head: t.team, names: [] };
          const win = n > p ? "navy" : "pirate";
          let names = { navy: "海軍", pirate: "海盜" };
          try { if (typeof g8T === "function") names = g8T().teams || names; } catch (e) {}
          return { head: t.team, names: [names[win]], color: TEAM[win] };
        }
        return { head: t.champ, names: topOf(g.ranking || [], room) };
      }
      default:
        return { head: t.champ, names: topOf(g.ranking || g.finalRanking || [], room) };
    }
  }

  function confetti(n) {
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      const z = 6 + Math.random() * 8;
      p.className = "tr-cf";
      p.style.cssText = `left:${Math.random() * 100}%;width:${z}px;height:${z * 1.6}px;background:${CONFETTI[i % CONFETTI.length]};animation-duration:${(1.3 + Math.random() * 1.1).toFixed(2)}s;animation-delay:${(Math.random() * 0.4).toFixed(2)}s`;
      ov.appendChild(p);
    }
  }

  /* ---------- 結束 ---------- */
  function outro(room) {
    const th = theme(room.game);
    const t = txt(room);
    const res = outcome(room);
    const wipe = res.color || th.bg;
    const ink = res.color ? PURE : th.ink;

    open(null);
    layer(`<div class="tr-stamp" style="color:${th.stamp}">${esc(t.over)}</div>`, "background:rgba(254,254,242,.35)");
    T(() => layer("", `background:${wipe}`).classList.add("tr-wipe"), 1100);

    // 合作型（故事接龍、相遇模式）：冇冠軍，直接「完成！」
    if (res.kind === "done") {
      T(() => {
        layer(`<div class="tr-win" style="color:${ink}"><span class="tr-ring" style="border-color:${ink}"></span><b>${esc(t.done)}</b></div>`);
        confetti(60);
        sfx("win");
      }, 1700);
      fadeOut(4200);
      return;
    }

    T(() => {
      layer(`<div class="tr-head" style="color:${ink}">${esc(res.head)}<span class="tr-dots"></span></div><div class="tr-win" style="color:${ink}"></div>`);
      sfx("drumroll");
    }, 1700);
    [[1800, 0.6, "."], [2200, 1, ".."], [2600, 1.5, "..."], [2950, 2, "..."]].forEach(([ms, a, d]) => T(() => {
      const h = ov?.querySelector(".tr-head");
      if (!h) return;
      h.style.setProperty("--a", a);
      h.querySelector(".tr-dots").textContent = d;
    }, ms));
    T(() => {
      const h = ov?.querySelector(".tr-head");
      if (!h) return;
      h.style.animation = "none";
      h.style.fontSize = "clamp(16px,3vw,22px)";
      h.style.opacity = ".85";
      const box = ov.querySelector(".tr-win");
      if (res.names.length) {
        const big = res.names.length > 2 ? "font-size:.6em;" : res.names.length > 1 ? "font-size:.75em;" : "";
        box.innerHTML = `<span class="tr-ring" style="border-color:${ink}"></span>${res.names.map((n) => `<b style="${big}">${esc(n)}</b>`).join("")}`;
        confetti(70);
        sfx("cymbal");
        sfx("win");
      } else {
        // 打和／同歸於盡／冇人有分：唔落彩紙
        box.innerHTML = `<b>${esc(res.head === t.champ ? t.none : t.draw)}</b>`;
        sfx("reveal");
      }
    }, 3300);
    fadeOut(4600);
  }

  /* ---------- 對外 ---------- */
  let lastKey = "";
  window.Transition = {
    enabled: () => !reduced(),
    onState(prev, room) {
      if (!room || !prev || prev.code !== room.code || reduced()) return;
      const pg = prev.gameState?.phase || "waiting";
      const g = room.gameState?.phase || "waiting";
      if (g === "waiting") return;
      const key = room.code + ":" + g + ":" + pg;
      if (pg === "waiting" && !ended(g)) { lastKey = key; return intro(room, false); }
      if (ended(pg) && !ended(g)) { lastKey = key; return intro(room, true); }
      if (ended(g) && !ended(pg) && key !== lastKey) { lastKey = key; return outro(room); }
    },
    // 測試用：Transition.preview("game7", "intro"|"outro"|"restart", roomOverrides)
    preview(game, which, extra) {
      const room = Object.assign({ game, code: "TEST", language: "yue", players: [{ id: "a", nickname: "阿明", score: 12 }, { id: "b", nickname: "小美", score: 8 }], gameState: { phase: "gameover", ranking: [{ id: "a", score: 12 }, { id: "b", score: 8 }] } }, extra || {});
      if (which === "outro") outro(room); else intro(room, which === "restart");
    },
    close
  };
})();
