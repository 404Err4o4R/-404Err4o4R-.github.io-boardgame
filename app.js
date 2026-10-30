const CONFIG = window.PLAY_TOGETHER_CONFIG || {};
const WORKER_URL = String(CONFIG.WORKER_URL || "").replace(/\/+$/, "");
const HTTP_BASE = WORKER_URL;
const WS_BASE = WORKER_URL.replace(/^http/, "ws");

const $ = (selector) => document.querySelector(selector);

const S = {
  socket: null,
  reconnectTimer: null,
  reconnectAttempts: 0,
  intentionalClose: false,
  room: null,
  playerId: null,
  token: null,
  nickname: "",
  role: null,
  explanation: null,
  chat: [],
  timer: null,
  selectedGame: "game1",
  filters: [],
  questions: null,
  myVote: undefined,
  g1SelectedPair: undefined
};

/* =========================
   遊戲一分類顏色
   （順序＋色值已經用 dataviz 驗證器跑過鄰接色盲對比，
   固定順序，唔會隨機跳，每個分類永遠對應返同一隻色。）
========================= */

const CATEGORY_COLORS = {
  "哲學題": "#5f76c2",
  "社交題": "#e2884a",
  "食物題": "#2f9e8f",
  "價值觀題": "#d9ab2e",
  "戀愛題": "#c46fa3",
  "情境題": "#5fa151",
  "個人愛好題": "#8272cc",
  "十八禁題": "#d16b63",
  "生活習慣題": "#b8794a",
  "殘酷二選一": "#6a4c93"
};

const CATEGORY_ORDER = Object.keys(CATEGORY_COLORS);

function categoryColor(category) {
  return CATEGORY_COLORS[category] || "#68779f";
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function showError(text) {
  const el = $("#lobbyError");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("hidden", !text);
}

/*
 * 用 sessionStorage 而唔用 localStorage：
 * localStorage 係成個瀏覽器共用，如果喺同一個瀏覽器開兩個分頁測試，
 * 第二個分頁會讀到第一個玩家嘅 token，然後用佢嘅身份「重連」，
 * 結果兩個分頁變成同一個玩家。sessionStorage 每個分頁獨立，
 * 同時仍然支援喺同一個分頁 refresh 之後重連返。
 */
function saveSession() {
  if (!S.room || !S.playerId || !S.token) return;

  try {
    sessionStorage.setItem(
      "pt:" + S.room.code,
      JSON.stringify({
        playerId: S.playerId,
        token: S.token,
        nickname: S.nickname
      })
    );
  } catch {}
}

function loadSession(code) {
  try {
    return JSON.parse(sessionStorage.getItem("pt:" + code) || "null");
  } catch {
    return null;
  }
}

function clearSession(code) {
  const target = code || S.room?.code;

  if (!target) return;

  try {
    sessionStorage.removeItem("pt:" + target);
  } catch {}
}

/* =========================
   題庫
========================= */

async function loadQuestions() {
  if (!HTTP_BASE) {
    throw new Error("Worker 網址未設定，請檢查 config.js。");
  }

  const [g1, g2] = await Promise.all([
    fetch(`${HTTP_BASE}/api/categories?game=game1`).then((r) => r.json()),
    fetch(`${HTTP_BASE}/api/categories?game=game2`).then((r) => r.json())
  ]);

  if (!g1.ok) throw new Error(g1.error || "載入題庫分類失敗。");
  if (!g2.ok) throw new Error(g2.error || "載入題庫分類失敗。");

  S.questions = {
    game1: { categories: g1.categories || [] },
    game2: { categories: g2.categories || [] }
  };

  renderCategories();
}

// 淨係遊戲一嘅分類有喺 CATEGORY_COLORS 度，遊戲二嘅分類會跌返去用預設嘅黃色 active 樣式。
function filterChipStyle(category, active) {
  const color = CATEGORY_COLORS[category];
  if (!color) return "";

  return active
    ? `background:${color};border-color:${color};color:#fff`
    : `border-color:${color}77;color:${color}`;
}

function renderCategories() {
  const catSection = $("#catSection");
  const roundsSection = $("#roundsSection");
  const langSection = $("#langSection");
  const g4Section = $("#g4Section");
  const g5Section = $("#g5Section");
  const g6Section = $("#g6Section");

  if (g6Section) g6Section.classList.toggle("hidden", S.selectedGame !== "game6");
  $("#g7Section")?.classList.toggle("hidden", S.selectedGame !== "game7");
  $("#g8Section")?.classList.toggle("hidden", S.selectedGame !== "game8");
  $("#g9Section")?.classList.toggle("hidden", S.selectedGame !== "game9");
  $("#g1Section")?.classList.toggle("hidden", S.selectedGame !== "game1");
  $("#g2Section")?.classList.toggle("hidden", S.selectedGame !== "game2");

  if (S.selectedGame === "game6" || S.selectedGame === "game7" || S.selectedGame === "game8" || S.selectedGame === "game9") {
    if (S.selectedGame === "game9") renderG9Preview();
    if (catSection) catSection.style.display = "none";
    if (roundsSection) roundsSection.classList.add("hidden");
    if (langSection) langSection.classList.remove("hidden");
    if (g4Section) g4Section.classList.add("hidden");
    if (g5Section) g5Section.classList.add("hidden");
    return;
  }

  if (S.selectedGame === "game3") {
    if (catSection) catSection.style.display = "none";
    if (roundsSection) roundsSection.classList.remove("hidden");
    if (langSection) langSection.classList.remove("hidden");
    if (g4Section) g4Section.classList.add("hidden");
    if (g5Section) g5Section.classList.add("hidden");
    return;
  }

  if (S.selectedGame === "game4") {
    if (catSection) catSection.style.display = "none";
    if (roundsSection) roundsSection.classList.add("hidden");
    if (langSection) langSection.classList.remove("hidden");
    if (g4Section) g4Section.classList.remove("hidden");
    if (g5Section) g5Section.classList.add("hidden");
    return;
  }

  if (S.selectedGame === "game5") {
    if (catSection) catSection.style.display = "none";
    if (roundsSection) roundsSection.classList.add("hidden");
    if (langSection) langSection.classList.remove("hidden");
    if (g4Section) g4Section.classList.add("hidden");
    if (g5Section) g5Section.classList.remove("hidden");
    renderG5Rounds();
    return;
  }

  if (catSection) catSection.style.display = "";
  if (roundsSection) roundsSection.classList.add("hidden");
  if (g4Section) g4Section.classList.add("hidden");
  if (g5Section) g5Section.classList.add("hidden");

  if (langSection) {
    langSection.classList.toggle(
      "hidden",
      S.selectedGame !== "game1" && S.selectedGame !== "game2" && S.selectedGame !== "game4"
    );
  }

  if (!S.questions) return;

  const categories =
    S.selectedGame === "game1"
      ? S.questions.game1.categories
      : S.questions.game2.categories;

  S.filters = S.filters.filter((x) => categories.includes(x));

  if (!S.filters.length) {
    S.filters = [...categories];
  }

  const box = $("#catBox");

  if (!box) return;

  box.innerHTML = categories.map((category) => {
    const active = S.filters.includes(category);
    return `
      <button
        type="button"
        class="filter-chip ${active ? "active" : ""}"
        data-category="${esc(category)}"
        style="${filterChipStyle(category, active)}"
      >
        ${esc(categoryLabel(category))}
      </button>
    `;
  }).join("");

  box.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("active");

      button.setAttribute(
        "style",
        filterChipStyle(
          button.dataset.category,
          button.classList.contains("active")
        )
      );

      S.filters = [...box.querySelectorAll(".filter-chip.active")]
        .map((x) => x.dataset.category);
    });
  });
}

loadQuestions().catch((error) => {
  showError(error.message);
});

/* =========================
   首頁操作
========================= */

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(button.dataset.scroll);

    if (target) {
      target.scrollIntoView({
        behavior: "smooth"
      });
    }
  });
});

document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab")
      .forEach((x) => x.classList.remove("active"));

    document.querySelectorAll(".tab-panel")
      .forEach((x) => x.classList.remove("active"));

    tab.classList.add("active");

    const target =
      tab.dataset.tab === "create"
        ? "#createTab"
        : "#joinTab";

    document.querySelector(target)
      ?.classList.add("active");
  });
});

const ROOM_COVERS = {
  game1: `
    <div class="game-cover cover2 cover2-g1">
      <div class="gc-icon">
        <svg viewBox="-10 -0 260 220" aria-hidden="true">
    <path d="M62 86 Q120 18 178 86" fill="none" stroke="#1f2740" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round"></path>
    <path d="M120 22l7 16 16 7-16 7-7 16-7-16-16-7 16-7z" fill="#FEFEF2" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"></path>

    <g stroke="#1f2740" stroke-width="3" stroke-linejoin="round">
      <path d="M14 214c0-34 18-54 44-54s44 20 44 54z" fill="#7a89ae"></path>
      <path d="M22 118a38 38 0 0 1 72-16l10 14-8 4c0 18-12 30-28 32h-12a38 38 0 0 1-34-34z" fill="#7a89ae"></path>
    </g>
    <circle cx="74" cy="112" r="4" fill="#1f2740"></circle>

    <g stroke="#1f2740" stroke-width="3" stroke-linejoin="round">
      <path d="M138 214c0-34 18-54 44-54s44 20 44 54z" fill="#1f2740"></path>
      <path d="M218 118a38 38 0 0 0-72-16l-10 14 8 4c0 18 12 30 28 32h12a38 38 0 0 0 34-34z" fill="#1f2740"></path>
    </g>
    <circle cx="166" cy="112" r="4" fill="#F2D965"></circle>
  </svg>
      </div>
      <div class="gc-label eyebrow">SAME WAVELENGTH</div>
      <div class="gc-label bottom">心有靈犀一點通</div>
    </div>
  `,
  game2: `
    <div class="game-cover cover2 cover2-g2">
      <div class="gc-icon">
        <svg viewBox="-5 -0 260 220" aria-hidden="true">
    <circle cx="45" cy="260" r="130" fill="#3FBFA8"></circle>
    <circle cx="88" cy="118" r="70" fill="#004643" stroke="#1f2740" stroke-width="3"></circle>
    <path d="M52 100q12-10 24 0" fill="none" stroke="#F0EDE5" stroke-width="6" stroke-linecap="round"></path>
    <circle cx="110" cy="98" r="8" fill="#F0EDE5"></circle>
    <path d="M58 150q22 14 44 0" fill="none" stroke="#F0EDE5" stroke-width="6" stroke-linecap="round"></path>
    <path d="M128 118c26-6 66-10 100-6a8 8 0 0 1 0 16c-34 4-74 0-100-6z" fill="#F2D965" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"></path>
    <g stroke="#1f2740" stroke-width="3" stroke-linecap="round">
      <path d="M210 92l6-12"></path>
      <path d="M226 98l12-8"></path>
      <path d="M194 90l-2-12"></path>
    </g>
    <circle cx="186" cy="44" r="26" fill="#F2D965" stroke="#1f2740" stroke-width="3"></circle>
    <text x="186" y="57" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="34" fill="#1f2740">?</text>
  </svg>
      </div>
      <div class="gc-label eyebrow">BLUFF · GUESS RIGHT</div>
      <div class="gc-label bottom">9upper 瞎掰王</div>
    </div>
  `,
  game3: `
    <div class="game-cover cover2 cover2-g3">
      <div class="gc-icon">
        <svg viewBox="-0 -0 260 220" aria-hidden="true">
    <path d="M14 82l46-30h28v132h22v28H14v-28h28V92l-20 10z" fill="#FEFEF2" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"></path>
    <path d="M180 212C112 168 104 92 140 70c18-10 34 2 40 16 6-14 22-26 40-16 36 22 28 98-40 142z" fill="#F2D9C4" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"></path>
    <path d="M140 104q10-16 24-12" fill="none" stroke="#FEFEF2" stroke-width="6" stroke-linecap="round"></path>
    <path d="M226 84V22" stroke="#1f2740" stroke-width="4" stroke-linecap="round"></path>
    <path d="M228 24l28 11-28 12z" fill="#F2D965" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"></path>
  </svg>
      </div>
      <div class="gc-label eyebrow">RATE FREELY · NO SCRIPT</div>
      <div class="gc-label bottom">He/She's a 10，但係……</div>
    </div>
  `,
  game4: `
    <div class="game-cover cover2 cover2-g4">
      <div class="gc-icon">
        <svg viewBox="-15 -10 260 220" aria-hidden="true">
    <g fill="#FEFEF2" stroke="#1f2740" stroke-width="3">
      <circle cx="44" cy="112" r="20"></circle>
      <path d="M12 176a32 32 0 0 1 64 0z"></path>
      <circle cx="186" cy="112" r="20"></circle>
      <path d="M154 176a32 32 0 0 1 64 0z"></path>
    </g>
    <g stroke="#1f2740" stroke-width="3">
      <circle cx="115" cy="100" r="24" fill="#FFD166"></circle>
      <path d="M77 176a38 38 0 0 1 76 0z" fill="#FFD166"></path>
    </g>
    <circle cx="132" cy="70" r="42" fill="#FEFEF2" fill-opacity=".35" stroke="#1f2740" stroke-width="9"></circle>
    <circle cx="132" cy="70" r="42" fill="none" stroke="#FFD166" stroke-width="3"></circle>
    <path d="M162 100l30 30" stroke="#1f2740" stroke-width="14" stroke-linecap="round"></path>
  </svg>
      </div>
      <div class="gc-label eyebrow">MOST LIKELY TO</div>
      <div class="gc-label bottom">誰最有可能</div>
    </div>
  `,
  game5: `
    <div class="game-cover cover2 cover2-g5">
      <div class="gc-icon">
        <svg viewBox="-15 -10 260 220" aria-hidden="true">
    <path d="M115 62C92 46 52 42 18 50v112c34-8 74-4 97 12z" fill="#FEFEF2" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"></path>
    <path d="M115 62c23-16 63-20 97-12v112c-34-8-74-4-97 12z" fill="#1f2740" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"></path>
    <g stroke="#1f2740" stroke-width="5" stroke-linecap="round">
      <path d="M36 80q30-4 60 6"></path>
      <path d="M36 102q30-4 60 6"></path>
      <path d="M36 124q22-3 40 2"></path>
    </g>
    <g stroke="#AFCBE3" stroke-width="5" stroke-linecap="round">
      <path d="M134 86q30-10 60-6"></path>
      <path d="M134 108q20-6 36-6"></path>
    </g>
    <circle cx="190" cy="138" r="24" fill="#F2D965" stroke="#1f2740" stroke-width="3"></circle>
    <path d="M180 150l4-12 14-14 6 6-14 14z" fill="#FEFEF2" stroke="#1f2740" stroke-width="2.5" stroke-linejoin="round"></path>
    <path d="M180 150l4-12 6 6z" fill="#1f2740"></path>
  </svg>
      </div>
      <div class="gc-label eyebrow">STORY CHAIN</div>
      <div class="gc-label bottom">故事接龍</div>
    </div>
  `,
  game6: `
    <div class="game-cover cover-g6">
      <div class="gc-icon">
        <svg viewBox="-20 -15 260 220" aria-hidden="true">
          <path d="M18 30a22 22 0 0 1 22-22h76a22 22 0 0 1 22 22v44a22 22 0 0 1-22 22H62l-26 22 6-22h-2a22 22 0 0 1-22-22z" fill="#1f2740"/>
          <path d="M82 92a22 22 0 0 1 22-22h76a22 22 0 0 1 22 22v44a22 22 0 0 1-22 22h-2l6 22-26-22h-54a22 22 0 0 1-22-22z" fill="#FEFEF2" stroke="#1f2740" stroke-width="3"/>
          <circle cx="146" cy="62" r="21" fill="#F2D965" stroke="#1f2740" stroke-width="3"/>
          <path d="M136 62l7 7 12-13" fill="none" stroke="#1f2740" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="gc-label eyebrow">WORD SYNC</div>
      <div class="gc-label bottom">Sync 唔 Sync</div>
    </div>
  `,
  game7: `
    <div class="game-cover cover-g7">
      <div class="gc-icon">
        <svg viewBox="-20 -15 260 220" aria-hidden="true">
          <circle cx="110" cy="118" r="72" fill="#1f2740"/>
          <path d="M62 96 A52 52 0 0 1 92 64" fill="none" stroke="#FEFEF2" stroke-width="8" stroke-linecap="round" opacity=".35"/>
          <rect x="90" y="34" width="40" height="20" rx="6" fill="#FEFEF2" stroke="#1f2740" stroke-width="3"/>
          <path d="M110 34 C108 8 140 -2 160 8" fill="none" stroke="#1f2740" stroke-width="4" stroke-linecap="round"/>
          <polygon points="178.0,-48.0 184.2,-25.2 201.0,-41.8 195.0,-19.0 217.8,-25.0 201.2,-8.2 224.0,-2.0 201.2,4.2 217.8,21.0 195.0,15.0 201.0,37.8 184.2,21.2 178.0,44.0 171.8,21.2 155.0,37.8 161.0,15.0 138.2,21.0 154.8,4.2 132.0,-2.0 154.8,-8.2 138.2,-25.0 161.0,-19.0 155.0,-41.8 171.8,-25.2" fill="#F2D965" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"/>
          <polygon points="186.7,-28.6 186.2,-13.3 200.7,-18.5 191.3,-6.3 206.0,-2.0 191.3,2.3 200.7,14.5 186.2,9.3 186.7,24.6 178.0,12.0 169.3,24.6 169.8,9.3 155.3,14.5 164.7,2.3 150.0,-2.0 164.7,-6.3 155.3,-18.5 169.8,-13.3 169.3,-28.6 178.0,-16.0" fill="#FEFEF2" stroke="#1f2740" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M205.0 -48.8L211.0 -59.2M230.2 -16.0L241.8 -19.1M224.8 25.0L235.2 31.0M127.3 -20.5L116.0 -24.6M155.2 -50.9L150.1 -61.8" fill="none" stroke="#1f2740" stroke-width="4" stroke-linecap="round"/>
          <text x="110" y="146" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="76" fill="#FFD3DD">?</text>
          <g transform="rotate(-10 12 137)">
            <rect x="-14" y="120" width="52" height="34" rx="10" fill="#FEFEF2" stroke="#1f2740" stroke-width="3"/>
            <text x="12" y="144" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="20" fill="#1f2740">25</text>
          </g>
          <g transform="rotate(8 212 121)">
            <rect x="186" y="104" width="52" height="34" rx="10" fill="#F2D965" stroke="#1f2740" stroke-width="3"/>
            <text x="212" y="128" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="20" fill="#1f2740">52</text>
          </g>
          <rect x="54" y="178" width="112" height="26" rx="13" fill="#FEFEF2" stroke="#1f2740" stroke-width="3"/>
          <text x="110" y="196" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="15" fill="#1f2740">37 — 68</text>
        </svg>
      </div>
      <div class="gc-label eyebrow">GUESS · DODGE · BOOM</div>
      <div class="gc-label bottom">Number Bomb 數字炸彈</div>
    </div>
  `,
  game8: `
    <div class="game-cover cover-g8">
      <div class="gc-icon">
        <svg viewBox="-20 -15 260 220" aria-hidden="true">
          <rect x="10" y="40" width="200" height="150" rx="18" fill="#3459AD" stroke="#1f2740" stroke-width="3"/>
          <path d="M35 40v150M60 40v150M85 40v150M110 40v150M135 40v150M160 40v150M185 40v150M10 65h200M10 90h200M10 115h200M10 140h200M10 165h200" stroke="#FEFEF2" stroke-opacity=".22" stroke-width="2"/>
          <circle cx="47" cy="77" r="5" fill="#FEFEF2" opacity=".8"/>
          <circle cx="197" cy="177" r="5" fill="#FEFEF2" opacity=".8"/>
          <circle cx="22" cy="177" r="5" fill="#FEFEF2" opacity=".8"/>
          <circle cx="122" cy="52" r="5" fill="#FEFEF2" opacity=".8"/>
          <path d="M28 142h128l-16 24H44z" fill="#FEFEF2" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"/>
          <path d="M56 142v-20h46l14 20" fill="#C9D6F2" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"/>
          <path d="M78 122V88" stroke="#1f2740" stroke-width="3.5" stroke-linecap="round"/>
          <path d="M78 88l22 9-22 8" fill="#F2D965" stroke="#1f2740" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M102 131h22" stroke="#1f2740" stroke-width="4" stroke-linecap="round"/>
          <rect x="64" y="128" width="8" height="8" rx="2" fill="#1f2740"/>
          <rect x="84" y="128" width="8" height="8" rx="2" fill="#1f2740"/>
          <polygon points="146,108 152,124 168,116 160,131 178,134 160,140 168,156 152,148 146,164 140,148 124,156 132,140 114,134 132,131 124,116 140,124" fill="#FF7A59" stroke="#1f2740" stroke-width="2.5" stroke-linejoin="round"/>
          <polygon points="146,122 149,131 157,128 152,135 160,138 152,141 156,148 149,145 146,153 143,145 136,148 140,141 132,138 140,135 135,128 143,131" fill="#F2D965"/>
          <circle cx="176" cy="78" r="26" fill="none" stroke="#F2D965" stroke-width="5"/>
          <circle cx="176" cy="78" r="9" fill="#F2D965" stroke="#1f2740" stroke-width="2.5"/>
          <path d="M176 40v18M176 98v18M138 78h18M196 78h18" stroke="#F2D965" stroke-width="5" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="gc-label eyebrow">AIM · FIRE · SINK</div>
      <div class="gc-label bottom">Battleship 海戰棋</div>
    </div>
  `,
  game9: `
    <div class="game-cover cover-g9">
      <div class="gc-icon">
        <svg viewBox="0 0 260 170" aria-hidden="true">
          <path d="M14 150 A116 116 0 0 1 246 150 Z" fill="#FEFEF2" stroke="#1f2740" stroke-width="5" stroke-linejoin="round"/>
          <path d="M130 150 L178.4 44.6 A116 116 0 0 1 192.7 52.4 Z" fill="#F5B82E"/>
          <path d="M130 150 L192.7 52.4 A116 116 0 0 1 205.8 62.3 Z" fill="#F26A3D"/>
          <path d="M130 150 L205.8 62.3 A116 116 0 0 1 217.7 73.5 Z" fill="#5FA8C6"/>
          <path d="M130 150 L217.7 73.5 A116 116 0 0 1 228.1 86.2 Z" fill="#F26A3D"/>
          <path d="M130 150 L228.1 86.2 A116 116 0 0 1 236.8 100.1 Z" fill="#F5B82E"/>
          <path d="M28 150 A102 102 0 0 1 232 150" fill="none" stroke="#929fc1" stroke-width="3" stroke-dasharray="2 14" stroke-linecap="round"/>
          <path d="M130 150 L64 68" stroke="#E0284A" stroke-width="10" stroke-linecap="round"/>
          <circle cx="130" cy="150" r="20" fill="#E0284A" stroke="#1f2740" stroke-width="5"/>
          <circle cx="130" cy="150" r="7" fill="#FEFEF2" opacity=".6"/>
        </svg>
      </div>
      <div class="gc-label eyebrow">HINT · DIAL · GUESS</div>
      <div class="gc-label bottom">心中有數</div>
    </div>
  `
};

const GAME_ACCENTS = {
  game1: "#68779f",
  game2: "#004643",
  game3: "#F2795F",
  game4: "#7B57CE",
  game5: "#5c8fb0",
  game6: "#3C5A1E",
  game7: "#7A1030",
  game8: "#22408C",
  game9: "#1F6F94"
};

const GAME_NAMES = {
  game1: "心有靈犀一點通",
  game2: "9upper瞎掰王",
  game3: "He/She's a 10",
  game4: "Most Likely To 邊個至似",
  game5: "故事接龍",
  game6: "Sync 唔 Sync",
  game7: "Number Bomb 數字炸彈",
  game8: "Battleship 海戰棋",
  game9: "心中有數"
};

function renderRoomVisual() {
  const el = $("#roomVisual");
  if (el) {
    el.innerHTML = ROOM_COVERS[S.selectedGame] || ROOM_COVERS.game1;
  }

  document.documentElement.style.setProperty(
    "--game-accent",
    GAME_ACCENTS[S.selectedGame] || GAME_ACCENTS.game1
  );
}

renderRoomVisual();

document.querySelectorAll("[data-start]").forEach((button) => {
  button.addEventListener("click", () => {
    S.selectedGame = button.dataset.start;

    const select = $("#gameSelect");

    if (select) {
      select.value = S.selectedGame;
    }

    S.filters = [];

    renderCategories();
    renderRoomVisual();

    document
      .querySelector('[data-tab="create"]')
      ?.click();

    $("#room")?.scrollIntoView({
      behavior: "smooth"
    });
  });
});

$("#gameSelect")?.addEventListener("change", () => {
  S.selectedGame = $("#gameSelect").value;
  S.filters = [];
  renderCategories();
  renderRoomVisual();
});

$("#toggleCats")?.addEventListener("click", () => {
  const buttons = [
    ...document.querySelectorAll("#catBox .filter-chip")
  ];

  const allSelected =
    buttons.length > 0 &&
    buttons.every((button) =>
      button.classList.contains("active")
    );

  buttons.forEach((button) => {
    const nextActive = !allSelected;
    button.classList.toggle("active", nextActive);
    button.setAttribute(
      "style",
      filterChipStyle(button.dataset.category, nextActive)
    );
  });

  S.filters = allSelected
    ? []
    : buttons.map((button) => button.dataset.category);
});

$("#roundsBox")?.addEventListener("click", (event) => {
  const chip = event.target.closest(".rounds-chip");
  if (!chip) return;

  document
    .querySelectorAll("#roundsBox .rounds-chip")
    .forEach((el) => el.classList.remove("active"));
  chip.classList.add("active");

  const customInput = $("#roundsCustom");

  if (chip.dataset.rounds === "custom") {
    customInput?.classList.remove("hidden");
    customInput?.focus();
    S.selectedRounds = null;
  } else {
    customInput?.classList.add("hidden");
    S.selectedRounds = Number(chip.dataset.rounds) || null;
  }
});

$("#roundsCustom")?.addEventListener("input", () => {
  const box = $("#roundsCustom");
  const n = Number(box.value);
  if (n >= 2 && n <= 50) {
    S.selectedRounds = n;
    box.style.borderColor = "";
  } else {
    S.selectedRounds = null;
    box.style.borderColor = box.value ? "var(--yellow-deep)" : "";
  }
});

$("#langBox")?.addEventListener("click", (event) => {
  const chip = event.target.closest(".lang-chip");
  if (!chip) return;

  document
    .querySelectorAll("#langBox .lang-chip")
    .forEach((el) => el.classList.remove("active"));
  chip.classList.add("active");

  S.selectedLanguage = chip.dataset.lang || "yue";
  applyFormLanguage();
});

// 開房表格：揀「台灣」時，有 data-zh 嘅說明文字轉做書面語；揀返「香港」就還原。
// 題庫分類名本身係篩選用嘅 key，唔改；台灣版淨係轉顯示文字。
const CATEGORY_LABEL_ZH = { "網絡梗起源": "網路梗起源" };
function categoryLabel(category) {
  return S.selectedLanguage === "zh" ? (CATEGORY_LABEL_ZH[category] || category) : category;
}

function applyFormLanguage() {
  const zh = S.selectedLanguage === "zh";
  document.querySelectorAll("#catBox .filter-chip").forEach((el) => {
    el.textContent = categoryLabel(el.dataset.category);
  });
  document.querySelectorAll("#createTab [data-zh]").forEach((el) => {
    if (el.dataset.yue === undefined) el.dataset.yue = el.textContent.trim();
    el.textContent = zh ? el.dataset.zh : el.dataset.yue;
  });
  renderG9Preview();
}

// 房間入面嘅說明文字：台灣版房間用書面語。
function lz(yue, zh) {
  return S.room?.language === "zh" ? zh : yue;
}

$("#writeTimeBox")?.addEventListener("click", (event) => {
  const chip = event.target.closest(".write-chip");
  if (!chip) return;

  document
    .querySelectorAll("#writeTimeBox .write-chip")
    .forEach((el) => el.classList.remove("active"));
  chip.classList.add("active");

  S.selectedWriteSeconds = Number(chip.dataset.write) || 60;
});

$("#g4RoundsBox")?.addEventListener("click", (event) => {
  const chip = event.target.closest(".g4-rounds-chip");
  if (!chip) return;

  document
    .querySelectorAll("#g4RoundsBox .g4-rounds-chip")
    .forEach((el) => el.classList.remove("active"));
  chip.classList.add("active");

  S.selectedG4Rounds = Number(chip.dataset.rounds) || 20;
});

$("#g4AnonBox")?.addEventListener("click", (event) => {
  const chip = event.target.closest(".g4-anon-chip");
  if (!chip) return;

  document
    .querySelectorAll("#g4AnonBox .g4-anon-chip")
    .forEach((el) => el.classList.remove("active"));
  chip.classList.add("active");

  S.selectedG4Anonymous = chip.dataset.anon === "1";
});

const G5_SENTENCE_ROUNDS = [10, 15, 25];
const G5_CHAR_ROUNDS = [20, 50, 100];

function renderG5Rounds() {
  const box = $("#g5RoundsBox");
  if (!box) return;

  const mode = S.selectedG5Mode || "sentence";
  const options = mode === "char" ? G5_CHAR_ROUNDS : G5_SENTENCE_ROUNDS;

  box.innerHTML = options
    .map(
      (n, i) => `
        <button
          type="button"
          class="filter-chip g5-rounds-chip ${i === 0 ? "active" : ""}"
          data-rounds="${n}"
        >
          ${n}輪
        </button>
      `
    )
    .join("");

  S.selectedG5Rounds = options[0];
}

$("#g5ModeBox")?.addEventListener("click", (event) => {
  const chip = event.target.closest(".g5-mode-chip");
  if (!chip) return;

  document
    .querySelectorAll("#g5ModeBox .g5-mode-chip")
    .forEach((el) => el.classList.remove("active"));
  chip.classList.add("active");

  S.selectedG5Mode = chip.dataset.mode === "char" ? "char" : "sentence";
  renderG5Rounds();
});

$("#g5RoundsBox")?.addEventListener("click", (event) => {
  const chip = event.target.closest(".g5-rounds-chip");
  if (!chip) return;

  document
    .querySelectorAll("#g5RoundsBox .g5-rounds-chip")
    .forEach((el) => el.classList.remove("active"));
  chip.classList.add("active");

  S.selectedG5Rounds = Number(chip.dataset.rounds) || G5_SENTENCE_ROUNDS[0];
});

/* Game 1 · 心有靈犀 / Game 2 · 9upper 開房設定 */
S.g1VoteSeconds = 10;
S.g1Rounds = 0; // 0 = 無限
S.g2SpeakSeconds = 30;
S.g2Rounds = 5;

function bindChips(boxSel, chipSel, onPick) {
  $(boxSel)?.addEventListener("click", (event) => {
    const chip = event.target.closest(chipSel);
    if (!chip) return;
    document.querySelectorAll(`${boxSel} ${chipSel}`).forEach((el) => el.classList.remove("active"));
    chip.classList.add("active");
    onPick(chip);
  });
}

bindChips("#g1TimeBox", ".g1-time-chip", (chip) => { S.g1VoteSeconds = Number(chip.dataset.sec) || 10; });
bindChips("#g1RoundsBox", ".g1-rounds-chip", (chip) => { S.g1Rounds = Number(chip.dataset.rounds) || 0; });
bindChips("#g2TimeBox", ".g2-time-chip", (chip) => { S.g2SpeakSeconds = Number(chip.dataset.sec) || 30; });
bindChips("#g2RoundsBox", ".g2-rounds-chip", (chip) => {
  const custom = $("#g2RoundsCustom");
  if (chip.dataset.rounds === "custom") {
    custom?.classList.remove("hidden");
    custom?.focus();
    S.g2Rounds = null;
  } else {
    custom?.classList.add("hidden");
    S.g2Rounds = Number(chip.dataset.rounds) || 5;
  }
});
$("#g2RoundsCustom")?.addEventListener("input", () => {
  const box = $("#g2RoundsCustom");
  const n = Number(box.value);
  if (Number.isInteger(n) && n >= 1 && n <= 30) {
    S.g2Rounds = n;
    box.style.borderColor = "";
  } else {
    S.g2Rounds = null;
    box.style.borderColor = box.value ? "var(--yellow-deep)" : "";
  }
});

/* Game 6 · Sync 唔 Sync 開房設定 */
S.g6AnswerSeconds = 20;
S.g6Rounds = 10;
S.g6VoteSeconds = 10;

$("#g6TimeBox")?.addEventListener("click", (event) => {
  const chip = event.target.closest(".g6-time-chip");
  if (!chip) return;
  document.querySelectorAll("#g6TimeBox .g6-time-chip").forEach((el) => el.classList.remove("active"));
  chip.classList.add("active");
  S.g6AnswerSeconds = Number(chip.dataset.sec) || 20;
});

$("#g6RoundsBox")?.addEventListener("click", (event) => {
  const chip = event.target.closest(".g6-rounds-chip");
  if (!chip) return;
  document.querySelectorAll("#g6RoundsBox .g6-rounds-chip").forEach((el) => el.classList.remove("active"));
  chip.classList.add("active");
  const custom = $("#g6RoundsCustom");
  if (chip.dataset.rounds === "custom") {
    custom?.classList.remove("hidden");
    custom?.focus();
    S.g6Rounds = null;
  } else {
    custom?.classList.add("hidden");
    S.g6Rounds = Number(chip.dataset.rounds) || 10;
  }
});

$("#g6RoundsCustom")?.addEventListener("input", () => {
  const box = $("#g6RoundsCustom");
  const n = Number(box.value);
  if (Number.isInteger(n) && n >= 3 && n <= 30) {
    S.g6Rounds = n;
    box.style.borderColor = "";
  } else {
    S.g6Rounds = null;
    box.style.borderColor = box.value ? "var(--yellow-deep)" : "";
  }
});

document.querySelectorAll(".g6-step-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const next = S.g6VoteSeconds + Number(button.dataset.step || 0);
    S.g6VoteSeconds = Math.min(30, Math.max(5, next));
    const label = $("#g6VoteLabel");
    if (label) label.textContent = `${S.g6VoteSeconds} 秒`;
  });
});

/* Game 7 · 數字炸彈 開房設定 */
S.g7Rounds = 5;
S.g7TurnSeconds = 10;

bindChips("#g7TimeBox", ".g7-time-chip", (chip) => { S.g7TurnSeconds = Number(chip.dataset.sec) || 10; });
bindChips("#g7RoundsBox", ".g7-rounds-chip", (chip) => {
  const custom = $("#g7RoundsCustom");
  if (chip.dataset.rounds === "custom") {
    custom?.classList.remove("hidden");
    custom?.focus();
    S.g7Rounds = null;
  } else {
    custom?.classList.add("hidden");
    S.g7Rounds = Number(chip.dataset.rounds) || 5;
  }
});
$("#g7RoundsCustom")?.addEventListener("input", () => {
  const box = $("#g7RoundsCustom");
  const n = Number(box.value);
  if (Number.isInteger(n) && n >= 1 && n <= 20) {
    S.g7Rounds = n;
    box.style.borderColor = "";
  } else {
    S.g7Rounds = null;
    box.style.borderColor = box.value ? "var(--yellow-deep)" : "";
  }
});

/* Game 8 · Battleship 開房設定 */
S.g8Rounds = 3;
S.g8TurnSeconds = 20;
bindChips("#g8RoundsBox", ".g8-rounds-chip", (chip) => { S.g8Rounds = Number(chip.dataset.rounds) || 3; });
bindChips("#g8TimeBox", ".g8-time-chip", (chip) => { S.g8TurnSeconds = Number(chip.dataset.sec) || 20; });

/* Game 9 · 心中有數 開房設定 */
S.g9Rounds = 2;
S.g9GuessSeconds = 30;
bindChips("#g9RoundsBox", ".g9-rounds-chip", (chip) => { S.g9Rounds = Number(chip.dataset.rounds) || 2; renderG9Preview(); });
bindChips("#g9TimeBox", ".g9-time-chip", (chip) => { S.g9GuessSeconds = Number(chip.dataset.sec) || 30; });

/* =========================
   房間
========================= */

$("#createBtn")?.addEventListener("click", createRoom);
$("#joinBtn")?.addEventListener("click", joinRoom);
$("#closeGame")?.addEventListener("click", leaveRoom);
$("#joinCode")?.addEventListener("input", () => {
  const input = $("#joinCode");
  const button = $("#joinBtn");

  if (!input || !button) return;

  const code = input.value.trim().toUpperCase();
  input.value = code;

  const valid = /^[A-Z0-9]{6}$/.test(code);

  button.classList.toggle(
    "btn-yellow",
    valid
  );

  button.classList.toggle(
    "btn-blue",
    !valid
  );
});
async function createRoom() {
  try {
    if (!HTTP_BASE) {
      throw new Error("Worker 網址未設定，請檢查 config.js。");
    }

    S.nickname = $("#createName")?.value.trim() || "玩家";

    if (S.selectedGame === "game2" && !S.g2Rounds) {
      throw new Error("自定義回合數要喺 1 至 30 之間。");
    }

    if (S.selectedGame === "game6" && !S.g6Rounds) {
      throw new Error(S.selectedLanguage === "zh" ? "自訂回合數須介於 3 至 30 之間。" : "自定義回合數要喺 3 至 30 之間。");
    }

    if (S.selectedGame === "game7" && !S.g7Rounds) {
      throw new Error(S.selectedLanguage === "zh" ? "自訂回合數須介於 1 至 20 之間。" : "自定義回合數要喺 1 至 20 之間。");
    }

    const res = await fetch(`${HTTP_BASE}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: S.selectedGame,
        filters: { categories: S.filters },
        rounds: S.selectedGame === "game3" ? (S.selectedRounds || null) : null,
        writeSeconds: S.selectedGame === "game3" ? (S.selectedWriteSeconds || 60) : null,
        language: (S.selectedGame === "game1" || S.selectedGame === "game2" || S.selectedGame === "game3" || S.selectedGame === "game4" || S.selectedGame === "game5" || S.selectedGame === "game6" || S.selectedGame === "game7" || S.selectedGame === "game8" || S.selectedGame === "game9") ? (S.selectedLanguage || "yue") : null,
        g1VoteSeconds: S.selectedGame === "game1" ? S.g1VoteSeconds : null,
        g1Rounds: S.selectedGame === "game1" ? S.g1Rounds : null,
        g2SpeakSeconds: S.selectedGame === "game2" ? S.g2SpeakSeconds : null,
        g2Rounds: S.selectedGame === "game2" ? S.g2Rounds : null,
        g6AnswerSeconds: S.selectedGame === "game6" ? S.g6AnswerSeconds : null,
        g6Rounds: S.selectedGame === "game6" ? S.g6Rounds : null,
        g6VoteSeconds: S.selectedGame === "game6" ? S.g6VoteSeconds : null,
        g7TurnSeconds: S.selectedGame === "game7" ? S.g7TurnSeconds : null,
        g7Rounds: S.selectedGame === "game7" ? S.g7Rounds : null,
        g8TurnSeconds: S.selectedGame === "game8" ? S.g8TurnSeconds : null,
        g8Rounds: S.selectedGame === "game8" ? S.g8Rounds : null,
        g9GuessSeconds: S.selectedGame === "game9" ? S.g9GuessSeconds : null,
        g9Rounds: S.selectedGame === "game9" ? S.g9Rounds : null,
        g4Rounds: S.selectedGame === "game4" ? (S.selectedG4Rounds || 20) : null,
        g4Anonymous: S.selectedGame === "game4" ? (S.selectedG4Anonymous !== false) : null,
        g5Mode: S.selectedGame === "game5" ? (S.selectedG5Mode || "sentence") : null,
        g5Rounds: S.selectedGame === "game5" ? (S.selectedG5Rounds || null) : null
      })
    }).then((r) => r.json());

    if (!res.ok) throw new Error(res.error || "建立房間失敗。");

    await connectRoom(res.roomCode, "create");

  } catch (error) {
    showError(error.message);
  }
}

async function joinRoom() {
  try {
    if (!HTTP_BASE) {
      throw new Error("Worker 網址未設定，請檢查 config.js。");
    }

    const code = $("#joinCode")?.value.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      throw new Error("房間號要 6 位英數字。");
    }

    S.nickname = $("#joinName")?.value.trim() || "玩家";

    const saved = loadSession(code);

    if (saved?.token) {
      try {
        await connectRoom(code, "reconnect", saved);
        return;
      } catch {
        // 儲存住嘅身份已經失效（例如個房重開過），清走佢再當新玩家加入。
        clearSession(code);
      }
    }

    await connectRoom(code, "join");

  } catch (error) {
    showError(error.message);
  }
}

function teardown() {
  clearInterval(S.timer);
  S.timer = null;

  clearTimeout(S.reconnectTimer);
  S.reconnectTimer = null;

  S.intentionalClose = true;

  if (S.socket) {
    try { S.socket.close(); } catch {}
  }

  S.socket = null;
}

function openSocket(code, mode, saved) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${WS_BASE}/websocket?room=${code}`);
    let settled = false;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(
        mode === "reconnect"
          ? { type: "hello", mode: "reconnect", playerId: saved.playerId, token: saved.token, nickname: S.nickname }
          : { type: "hello", mode, nickname: S.nickname }
      ));
    });

    socket.addEventListener("message", (event) => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!settled) {
        if (message.type === "welcome") {
          settled = true;
          S.reconnectAttempts = 0;
          resolve(socket);
        } else if (message.type === "error") {
          settled = true;
          reject(new Error(message.message || "連線失敗。"));
          try { socket.close(); } catch {}
          return;
        }
      }

      handleServerMessage(message);
    });

    socket.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        reject(new Error("連線失敗，請再試一次。"));
        return;
      }

      // 呢個已經係舊 socket（已經被新連線取代咗），唔使再處理。
      if (S.socket !== socket) return;

      setConnectionStatus("CONNECTING", false);

      if (S.intentionalClose || !S.room) return;

      // 意外斷線就自動嘗試重連，逐次加長等待時間。
      S.reconnectAttempts = (S.reconnectAttempts || 0) + 1;
      const delay = Math.min(1000 * S.reconnectAttempts, 8000);
      const code2 = S.room.code;
      const savedSession = loadSession(code2);

      clearTimeout(S.reconnectTimer);
      S.reconnectTimer = setTimeout(() => {
        if (!S.room || S.room.code !== code2) return;
        connectRoom(code2, "reconnect", savedSession).catch((error) => {
          flash("重連失敗：" + error.message);
        });
      }, delay);
    });

    socket.addEventListener("error", () => {});
  });
}

async function connectRoom(code, mode, saved = null) {
  if (!HTTP_BASE) {
    throw new Error("Worker 網址未設定，請檢查 config.js。");
  }

  // teardown() 會標記 intentionalClose=true 同埋斷開舊嘅連線；
  // 呢個 flag 要留到新連線真正接手先解除，
  // 否則舊 socket 嘅 close 事件可能會同新連線嘅重連邏輯撞埋一齊。
  teardown();

  S.room = { code };
  S.chat = [];
  S.role = null;
  S.explanation = null;
  S.myVote = undefined;
  S.g1SelectedPair = undefined;
  S.g3RenderKey = null;
  S.g4RenderKey = null;
  S.g5RenderKey = null;

  document.documentElement.style.setProperty(
    "--game-accent",
    GAME_ACCENTS[S.selectedGame] || GAME_ACCENTS.game1
  );

  $("#roomPanel").innerHTML = "";
  $("#gamePanel").innerHTML = `
    <div class="eyebrow">
      CONNECTING
    </div>

    <p class="notice">
      連緊線……
    </p>
  `;

  setConnectionStatus("CONNECTING", false);
  showGame();

  const socket = await openSocket(code, mode, saved);
  S.socket = socket;
  S.intentionalClose = false;

  return null;
}

/* =========================
   Server messages
========================= */

function handleServerMessage(message) {

  if (message.type === "error") {
    flash(message.message);
    return;
  }

  if (message.type === "welcome") {
    S.playerId = message.playerId;
    S.token = message.token;
    S.room = message.room;
    S.chat = message.room?.chat || [];

    saveSession();

    document.documentElement.style.setProperty(
      "--game-accent",
      GAME_ACCENTS[message.room?.game] || GAME_ACCENTS.game1
    );
    applyGameTheme(message.room?.game);
    S.g6Key = null;
    S.g7Key = null;

    setConnectionStatus(
      "CONNECTED",
      true
    );

    renderRoom();
    renderGame();

    return;
  }

  if (message.type === "state") {
  const wasFinal = S.room?.gameState?.phase === "final";
  const isFinal = message.room.gameState?.phase === "final";

  if (isFinal && !wasFinal) {
    S.g1SelectedPair = undefined;
  }

  S.room = message.room;

  // 房間狀態入面嘅 chat 先係準嘅（例如新一題開始時伺服器會清空），
  // 每次 state 都由呢度重新同步，唔靠逐條 chat 訊息儲埋落嚟。
  if (message.room.chat) {
    S.chat = message.room.chat;
  }

  if (message.room.gameState?.phase === "vote") {
    if (
      message.room.gameState.myVote !== null &&
      message.room.gameState.myVote !== undefined
    ) {
      S.myVote = Number(
        message.room.gameState.myVote
      );
    }
  } else {
    S.myVote = undefined;
  }
    if (message.room.viewerRole) {
      S.role = message.room.viewerRole;
    }

    if (message.room.viewerExplanation) {
      S.explanation =
        message.room.viewerExplanation;
    }

    renderRoom();
    renderGame();

    return;
  }

  if (message.type === "private-role") {
    S.role = message.role;
    S.explanation =
      message.explanation || null;

    renderGame();

    return;
  }

  if (message.type === "chat") {
    S.chat.push(message.chat);

    S.chat = S.chat.slice(-100);

    // 唔用 renderGame() 成個畫面重畫，唔係就算得返你自己輸入緊嘅字都會被清空。
    // 淨係加返新一句落個聊天框，其他嘢（包括輸入框入面未send嘅字）唔郁。
    const chatBox = $("#chatBox");

    if (chatBox) {
      chatBox.insertAdjacentHTML(
        "beforeend",
        chatMsgHtml(message.chat)
      );

      scrollChat();
    }
  }
}

/* =========================
   UI
========================= */

function showGame() {
  $("#landing")?.classList.add("hidden");
  $("#gameShell")?.classList.remove("hidden");

  if (S.room?.code) {
    $("#roomLabel").textContent =
      S.room.code;
  }

  applyGameTheme(S.room?.game);
}

// 每隻 game 嘅主題色由 #gameShell 嘅 data-game 決定（見 style.css「新版遊戲畫面」）。
function applyGameTheme(game) {
  const shell = $("#gameShell");
  if (shell && game) shell.dataset.game = game;

  const label = $("#gameLabel");
  if (label) {
    label.textContent = GAME_NAMES[game] || "";
    label.classList.toggle("hidden", !GAME_NAMES[game]);
  }
}

function leaveRoom() {
  clearInterval(S.timer);

  if (S.socket && S.socket.readyState === WebSocket.OPEN) {
    try {
      S.socket.send(JSON.stringify({ type: "leave" }));
    } catch {}
  }

  teardown();

  clearSession();

  S.room = null;
  S.playerId = null;
  S.token = null;
  S.role = null;
  S.explanation = null;
  S.chat = [];

  showError("");

  $("#gameShell")?.classList.add("hidden");
  $("#landing")?.classList.remove("hidden");

  window.scrollTo(0, 0);
}

function setConnectionStatus(text, online) {
  const badge = $("#connBadge");

  if (!badge) return;

  badge.textContent = text;
  badge.classList.toggle("online", online);
}

function flash(text) {
  const panel = $("#gamePanel");

  if (!panel) return;

  panel.insertAdjacentHTML(
    "afterbegin",
    `<div class="status error g4-flash">${esc(text)}</div>`
  );

  const el = panel.querySelector(".g4-flash");
  if (el) {
    setTimeout(() => el.remove(), 2000);
  }
}

function send(message) {
  if (!S.socket || S.socket.readyState !== WebSocket.OPEN || !S.token) {
    flash("未連線，請等重連後再試。");
    return;
  }

  try {
    S.socket.send(JSON.stringify(message));
  } catch (error) {
    flash(error.message || "操作失敗。");
  }
}

/* =========================
   Room UI
========================= */

function renderRoom() {
  const room = S.room;

  if (!room?.players) return;

  const roomPanel = $("#roomPanel");

  const isPlaying =
    room.gameState &&
    room.gameState.phase &&
    room.gameState.phase !== "waiting";

  $("#gameShell")?.classList.toggle("is-playing", !!isPlaying);

  if (isPlaying) {
    roomPanel.classList.remove("hidden");
    renderScoreboard(room);
    return;
  }

  roomPanel.classList.remove("hidden");

  roomPanel.innerHTML = `
    <div
      class="row"
      style="justify-content:space-between;align-items:end"
    >
      <div>
        <div class="eyebrow">
          ROOM CODE
        </div>

        <div class="lobby-code">
          <strong>${esc(room.code)}</strong>
        </div>
      </div>

      <div>
        <div class="eyebrow">
          GAME
        </div>

        <b>
          ${GAME_NAMES[room.game] || "未知遊戲"}
        </b>
      </div>
    </div>

    ${
      room.game === "game1" && room.g1Settings
        ? `<p class="notice" style="margin:10px 0 0">
            投票 ${Math.round(room.g1Settings.voteMs / 1000)} 秒 ·
            ${room.g1Settings.rounds ? `${room.g1Settings.rounds} 輪` : "無限輪數（房主結算）"}
          </p>`
        : room.game === "game2" && room.g2Settings
        ? `<p class="notice" style="margin:10px 0 0">
            每人發言 ${Math.round(room.g2Settings.speakMs / 1000)} 秒 · ${room.g2Settings.rounds} 輪
          </p>`
        : ""
    }

    ${
      room.game === "game6" && room.g6Settings
        ? `<p class="notice" style="margin:10px 0 0">
            ${lz("每 round", "每回合")} ${Math.round(room.g6Settings.answerMs / 1000)} 秒 ·
            ${room.g6Settings.rounds} ${lz("round", "回合")} ·
            投票合併 ${Math.round(room.g6Settings.voteMs / 1000)} 秒 ·
            ${room.language === "zh" ? "台灣版" : "香港版"}
          </p>`
        : room.game === "game7" && room.g7Settings
        ? `<p class="notice" style="margin:10px 0 0">
            ${room.g7Settings.rounds} 個回合 ·
            ${lz("每次估數", "每次猜數")} ${Math.round(room.g7Settings.turnMs / 1000)} 秒 ·
            炸彈範圍 1–100 ·
            ${room.language === "zh" ? "台灣版" : "香港版"}
          </p>`
        : room.game === "game8" && room.g8Settings
        ? `<p class="notice" style="margin:10px 0 0">
            ${room.g8Settings.rounds} 輪 ·
            ${lz("每炮", "每砲")} ${Math.round(room.g8Settings.turnMs / 1000)} 秒 ·
            ${room.language === "zh" ? "台灣版" : "香港版"}
          </p>${g8LobbyHtml(room)}`
        : room.game === "game9" && room.g9Settings
        ? g9LobbyHtml(room)
        : ""
    }

    <div style="height:14px"></div>

   <div class="players">
  ${
    room.players.map(
      (player) => `
        <div
          class="player ${
            player.host
              ? "host"
              : ""
          }"
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:10px;
          "
        >
          <div>
            ${
              player.host
                ? `<span class="host-crown"><svg viewBox="0 0 24 24"><path d="M3 9 L7 12 L12 6 L17 12 L21 9 L19 16 L5 16 Z" fill="#F2D965"/><circle cx="3" cy="9" r="1.4" fill="#1f2740"/><circle cx="12" cy="6" r="1.4" fill="#1f2740"/><circle cx="21" cy="9" r="1.4" fill="#1f2740"/></svg></span>`
                : ""
            }

            <strong class="player-name">   ${esc(player.nickname)} </strong>

            ${
              player.id === S.playerId
                ? `<span class="you-tag">你</span>`
                : ""
            }

            <span style="opacity:.65">
              ${
                player.connected
                  ? "●"
                  : "○"
              }
            </span>

            ${
              player.score
                ? ` · ${player.score} 分`
                : ""
            }
          </div>
${
  player.host
    ? ""
    : `
      <span
        class="${
          player.ready
            ? "ready-label"
            : "not-ready-label"
        }"
      >
        ${
          player.ready
            ? "✓ Ready"
            : "未準備"
        }
      </span>
    `
}
        </div>
      `
    ).join("")
  }
</div>

 ${ 
  room.hostId === S.playerId &&
  (
    !room.gameState ||
    room.gameState.phase === "waiting"
  )
  ? (() => {
      const connectedPlayers =
  room.players.filter(
    (p) => p.connected
  );

const connectedCount =
  connectedPlayers.length;

const allReady =
  connectedCount >= 2 &&
  connectedPlayers
    .filter(
      (p) => !p.host
    )
    .every(
      (p) => p.ready
    );

const canStart =
  room.hostId === S.playerId &&
  allReady;

      return `
        <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap">
          <button
            id="startBtn"
            class="btn ${canStart ? "btn-green" : "btn-disabled"}"
            ${canStart ? "" : "disabled"}
          >
            START GAME
          </button>

          <button
            id="leaveBtn"
            class="btn btn-outline"
          >
            LEAVE ROOM
          </button>
        </div>
      `;
    })()
  : `
      <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap">
        <button
          id="readyBtn"
          class="btn ${
            room.players.find(p => p.id === S.playerId)?.ready
              ? "btn-green"
              : "btn-ready"
          }"
        >
          ${
            room.players.find(p => p.id === S.playerId)?.ready
              ? "✓ Ready"
              : "Ready？"
          }
        </button>

        <button
          id="leaveBtn"
          class="btn btn-outline"
        >
          LEAVE ROOM
        </button>
      </div>
    `
}

    <p class="notice">
      ${
        room.players
          .filter((p) => p.connected)
          .length
      }/6 人在線。
      ${lz("夠人就可以開始。", "人數足夠就可以開始。")}
    </p>
  `;

const currentPlayer =
  room.players.find(
    p => p.id === S.playerId
  );

$("#readyBtn")?.addEventListener(
  "click",
  () => {
    send({
      type: "ready",
      ready: !currentPlayer?.ready
    });
  }
);
  
const startBtn = $("#startBtn");

startBtn?.addEventListener("click", async () => {
  if (startBtn.disabled) return;

  const ok = await askConfirm(
    lz("肯定開始遊戲？", "確定開始遊戲？")
  );

  if (ok) {
    send({ type: "start" });
  }
});

$("#leaveBtn")?.addEventListener(
  "click",
  leaveRoom
);
}

function renderScoreboard(room) {
  const roomPanel = $("#roomPanel");
  if (!roomPanel) return;

  const raterId = room.gameState?.raterId || null;
  const nextRaterId = room.gameState?.nextRaterId || null;

  const sorted = [...room.players].sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );

  roomPanel.innerHTML = `
    <div class="sb-head">
      <div class="eyebrow">SCOREBOARD</div>
      <div class="eyebrow">${esc(room.code)}</div>
    </div>

    <div class="sb-list">
      ${sorted
        .map((p, index) => {
          const isHost = p.id === room.hostId;
          const isRater = raterId && p.id === raterId;
          const isNextRater = nextRaterId && p.id === nextRaterId;
          const isMe = p.id === S.playerId;
          const g7 = room.game === "game7" && room.gameState && room.gameState.phase !== "gameover" ? room.gameState : null;
          const g7Out = !!(g7 && Array.isArray(g7.alive) && !g7.alive.includes(p.id));
          const g7Turn = !!(g7 && g7.phase === "turn" && g7.currentId === p.id);
          const g8 = room.game === "game8" && room.gameState && room.gameState.phase !== "gameover" ? room.gameState : null;
          const g8Team = g8 && g8.mode === "team" ? (g8.teams?.navy || []).includes(p.id) ? "navy" : (g8.teams?.pirate || []).includes(p.id) ? "pirate" : "" : "";
          const g8Out = !!(g8 && g8.mode === "brawl" && g8.boards?.find((b) => b.id === p.id)?.dead);
          const g8Turn = !!(g8 && g8.phase === "turn" && g8.shooter === p.id);
          const g9 = room.game === "game9" && room.gameState && room.gameState.phase !== "gameover" ? room.gameState : null;
          const g9Psy = !!(g9 && g9.psychicId === p.id);
          const g9Locked = !!(g9 && g9.phase === "guess" && (g9.lockedIds || []).includes(p.id));

          return `
            <div class="sb-row ${isMe ? "me" : ""} ${g7Out || g8Out ? "g7-out" : ""} ${g7Turn || g8Turn || g9Psy ? "g7-turn" : ""}" style="opacity:${p.connected ? (g7Out || g8Out ? ".55" : "1") : ".5"}">
              <span class="sb-rank">${index + 1}</span>
              <span class="sb-name">
                ${
                  isHost
                    ? `<span class="host-crown"><svg viewBox="0 0 24 24"><path d="M3 9 L7 12 L12 6 L17 12 L21 9 L19 16 L5 16 Z" fill="#F2D965"/><circle cx="3" cy="9" r="1.4" fill="#1f2740"/><circle cx="12" cy="6" r="1.4" fill="#1f2740"/><circle cx="21" cy="9" r="1.4" fill="#1f2740"/></svg></span>`
                    : ""
                }${esc(p.nickname)}${isMe ? "（你）" : ""}
                ${isRater ? '<span class="sb-tag">莊家</span>' : ""}
                ${isNextRater ? '<span class="sb-tag">下一位莊家</span>' : ""}
                ${g7Out ? `<span class="sb-tag">${esc(g7T().outTag)}</span>` : ""}
                ${g7Turn ? `<span class="sb-tag">${esc(g7T().turnTag)}</span>` : ""}
                ${g8Team ? `<span class="sb-tag g8-sb-${g8Team}">${esc(g8T().teams[g8Team])}</span>` : ""}
                ${g8Out ? `<span class="sb-tag">${esc(g8T().out)}</span>` : ""}
                ${g8Turn ? `<span class="sb-tag">${esc(g8T().shooterTag)}</span>` : ""}
                ${g9Psy ? `<span class="sb-tag">${esc(g9T().tagPsy)}</span>` : ""}
                ${g9Locked ? `<span class="sb-tag">${esc(g9T().tagLocked)}</span>` : ""}
              </span>
              <b class="sb-score">${p.score || 0}</b>
            </div>
          `;
        })
        .join("")}
    </div>

    ${
      S.room?.game === "game6" &&
      room.hostId === S.playerId &&
      room.gameState?.phase !== "gameover"
        ? `<button
            class="btn btn-outline"
            style="margin-top:8px;font-size:13px;padding:10px"
            onclick="g6EndEarly()"
          >
            提前結算
          </button>`
        : ""
    }

    ${
      S.room?.game === "game8" &&
      room.hostId === S.playerId &&
      room.gameState?.phase !== "gameover"
        ? `<button
            class="btn btn-outline"
            style="margin-top:8px;font-size:13px;padding:10px"
            onclick="g8EndEarly()"
          >
            提前結算
          </button>`
        : ""
    }

    ${
      S.room?.game === "game9" &&
      room.hostId === S.playerId &&
      room.gameState?.phase !== "gameover"
        ? `<button
            class="btn btn-outline"
            style="margin-top:8px;font-size:13px;padding:10px"
            onclick="g9EndEarly()"
          >
            ${esc(g9T().endEarly)}
          </button>`
        : ""
    }

    ${
      S.room?.game === "game7" &&
      room.hostId === S.playerId &&
      room.gameState?.phase !== "gameover"
        ? `<button
            class="btn btn-outline"
            style="margin-top:8px;font-size:13px;padding:10px"
            onclick="g7EndEarly()"
          >
            提前結算
          </button>`
        : ""
    }

    ${
      S.room?.game === "game3" &&
      room.hostId === S.playerId &&
      room.gameState?.phase !== "gameover"
        ? `<button
            class="btn btn-outline"
            style="margin-top:8px;font-size:13px;padding:10px"
            onclick="g3EndEarly()"
          >
            提前結算
          </button>`
        : ""
    }

    ${
      S.room?.game === "game4" &&
      room.hostId === S.playerId &&
      room.gameState?.phase !== "gameover"
        ? `<button
            class="btn btn-outline"
            style="margin-top:8px;font-size:13px;padding:10px"
            onclick="g4EndEarly()"
          >
            提前結算
          </button>`
        : ""
    }

    <button
      class="btn btn-outline"
      style="margin-top:8px;font-size:13px;padding:10px"
      onclick="leaveRoom()"
    >
      LEAVE ROOM
    </button>
  `;
}

window.g3EndEarly = async () => {
  const ok = await askConfirm("肯定提前結算？之後就唔可以再繼續呢局。");
  if (!ok) return;
  send({ type: "g3:end" });
};

window.g4EndEarly = async () => {
  const ok = await askConfirm("肯定提前結算？之後就唔可以再繼續呢局。");
  if (!ok) return;
  send({ type: "g4:end" });
};

/* =========================
   Game state
========================= */

function renderGame() {
  const game =
    S.room?.gameState;

  if (S.room?.game !== "game8" || !game || game.phase === "waiting") {
    $("#gamePanel")?.classList.remove("g8-hot");
    const shell = $("#gameShell");
    if (shell) shell.dataset.g8team = "";
  }

  if (!game || game.phase === "waiting") {
    $("#gamePanel").innerHTML = `
      <div class="eyebrow">
        READY
      </div>

      <h2 class="title">
        WAIT FOR<br>
        <span>YOUR FRIENDS.</span>
      </h2>

      <p class="notice">
        ${lz("夠人數之後，房主就可以開始。", "人數足夠後，房主就可以開始。")}
      </p>
    `;

    return;
  }

  if (S.room.game === "game1") {
    renderGame1(game);
  } else if (S.room.game === "game3") {
    renderGame3(game);
  } else if (S.room.game === "game4") {
    renderGame4(game);
  } else if (S.room.game === "game5") {
    renderGame5(game);
  } else if (S.room.game === "game6") {
    renderGame6(game);
  } else if (S.room.game === "game7") {
    renderGame7(game);
  } else if (S.room.game === "game8") {
    renderGame8(game);
  } else if (S.room.game === "game9") {
    renderGame9(game);
  } else {
    renderGame2(game);
  }
}

function startTimer(element, endsAt) {
  clearInterval(S.timer);

  if (!element || !endsAt) return;

  // 圓形倒數：第一次見到呢個 endsAt 時嘅剩餘時間當做總長，重畫畫面都唔會由頭開始。
  S.timerTotals = S.timerTotals || {};
  if (!S.timerTotals[endsAt]) {
    S.timerTotals[endsAt] = Math.max(1000, endsAt - Date.now());
  }
  const total = S.timerTotals[endsAt];
  const C = 163.4;

  element.classList.add("timer-ring");
  element.innerHTML = `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle class="tr-track" cx="32" cy="32" r="26"></circle>
      <circle class="tr-bar" cx="32" cy="32" r="26" stroke-dasharray="${C}" transform="rotate(-90 32 32)"></circle>
    </svg>
    <span class="tr-num"></span>
  `;
  const bar = element.querySelector(".tr-bar");
  const num = element.querySelector(".tr-num");

  const update = () => {
    const remaining =
      Math.max(0, endsAt - Date.now());

    num.textContent = String(Math.ceil(remaining / 1000));
    bar.setAttribute("stroke-dashoffset", String(C * (1 - Math.min(1, remaining / total))));
    element.setAttribute("aria-label", `剩低 ${Math.ceil(remaining / 1000)} 秒`);
  };

  update();

  S.timer = setInterval(
    update,
    100
  );
}

/* =========================
   Game 1
========================= */

function categoryTagHtml(category) {
  if (!category) return "";
  return `<div class="q-tag" style="color:${categoryColor(category)}">#${esc(category)}</div>`;
}

function renderGame1(game) {

if (game.phase === "final") {
  renderGame1Final(game);
  return;
}

if (game.phase === "intro") {
  $("#gamePanel").innerHTML = `
    <div class="game-intro">
      <div class="eyebrow">
        ROUND ${game.round}${game.totalRounds ? ` / ${game.totalRounds}` : ""}
      </div>

      <h2>
        遊戲準備開始！
      </h2>

      <p>
        準備揀你嘅答案
      </p>
    </div>
  `;

  clearInterval(S.timer);

  return;
}

  if (game.phase === "vote") {

    const votes =
      game.votes || {};

    const myVote =
  S.myVote !== undefined
    ? S.myVote
    : (
        game.myVote !== null &&
        game.myVote !== undefined
          ? Number(game.myVote)
          : undefined
      );

    $("#gamePanel").innerHTML = `
      <div
        class="row"
        style="justify-content:space-between;align-items:end"
      >
        <div>
          <div class="eyebrow">
            ROUND ${game.round}${game.totalRounds ? ` / ${game.totalRounds}` : ""}
          </div>

          <h2 class="title">
            心有靈犀<br>
            <span>一點通</span>
          </h2>
        </div>

        <div
          id="time"
          class="timer"
        ></div>
      </div>

      <div class="question">
        ${esc(
          game.question.question
        )}
      </div>

      ${categoryTagHtml(game.question.category)}

      <div class="answers">
        ${
          game.question.options
            .map(
              (option, index) => `
                <button
  class="answer ${
    myVote === index
      ? "selected"
      : ""
  }"
  ${
    myVote !== undefined
      ? "disabled"
      : ""
  }
  onclick="vote1(${index})"
>
                  ${
                    String.fromCharCode(
                      65 + index
                    )
                  }
                  ·
                  ${esc(option)}
                </button>
              `
            )
            .join("")
        }
      </div>

      <p class="notice">
        ${Math.round((game.voteMs || 10000) / 1000)} 秒投票。
        ${
          myVote !== undefined
            ? "你已經投咗。"
            : "每人一票。"
        }
      </p>
    `;

    startTimer(
      $("#time"),
      game.endsAt
    );

    return;
  }

  const counts =
    game.votes || [0, 0];

  $("#gamePanel").innerHTML = `
    <div>
      <div class="eyebrow">
        RESULT · ROUND ${game.round}
      </div>

      <h2 class="title">
        WHAT DID<br>
        <span>EVERYONE CHOOSE?</span>
      </h2>
    </div>

    <div class="question">
      ${esc(
        game.question.question
      )}
    </div>

    ${categoryTagHtml(game.question.category)}

    <div class="bars">
  ${[0, 1]
    .map((index) => {
      const count = counts[index] || 0;
      const maxCount = Math.max(
        counts[0] || 0,
        counts[1] || 0,
        1
      );

      const width =
        count === 0
          ? 0
          : Math.max(
              10,
              (count / maxCount) * 100
            );

      const voters =
        game.voters?.[index] || [];

      const isMajority =
        game.winner === index;

      return `
        <div class="vote-result-row">
          <div class="vote-result-head">
            <strong>
              ${String.fromCharCode(65 + index)} · ${esc(game.question.options[index])}
            </strong>

            <strong>
              ${count} 票
            </strong>
          </div>

          <div class="vote-result-bar">
            <div
              class="vote-result-fill ${
                isMajority ? "majority" : ""
              }"
              style="width:${width}%"
            ></div>
          </div>

          <div class="vote-result-names">
            ${
              voters.length
                ? voters
                    .map(
                      (name) =>
                        `<span>${esc(name)}</span>`
                    )
                    .join("、")
                : "冇人揀呢個"
            }
          </div>
        </div>
      `;
    })
    .join("")}
</div>

    <div
      class="${
        game.winner === null
          ? "status"
          : "result"
      }"
    >
      ${
        game.winner === null
          ? "今題打和。"
          : "多數揀咗：" +
            String.fromCharCode(
              65 + game.winner
            ) +
            " · " +
            esc(
              game.question.options[
                game.winner
              ]
            )
      }
    </div>

    <div style="height:16px"></div>

    <div
      class="row"
      style="margin-top:10px"
    >
 ${
  S.room.hostId === S.playerId
    ? `
      <button
        class="btn btn-yellow"
        onclick="next1()"
      >
        NEXT QUESTION
      </button>

      <button
        class="btn btn-outline"
        onclick="finish1()"
      >
        結束並睇結算
      </button>
    `
    : `
      <button
        class="btn btn-outline"
        onclick="next1()"
      >
        準備好
      </button>
    `
}
    </div>

    <p class="notice">
      準備好下一題：
      ${game.nextReadyCount || 0}/
      ${
        S.room.players
          .filter((p) => p.connected)
          .length
      }
    </p>

    <div class="chat-panel">
      <div class="eyebrow">
        TALK IT OUT
      </div>

      <div
        class="row"
        style="margin-top:8px"
      >
        <input
          id="chat1"
          placeholder="講下你點諗…"
        >

        <button
          id="chat1Send"
          class="btn btn-send"
          disabled
          onclick="chat1()"
        >
          SEND
        </button>
      </div>

      <div
        id="chatBox"
        class="chat"
      >
        ${renderChatHtml()}
      </div>
    </div>
  `;
  const chatInput = $("#chat1");
  const chatSend = $("#chat1Send");

  if (chatInput && chatSend) {
    const updateSendButton = () => {
      const hasText =
        chatInput.value.trim().length > 0;

      chatSend.disabled = !hasText;

      chatSend.classList.toggle(
        "ready",
        hasText
      );
    };

    chatInput.addEventListener(
      "input",
      updateSendButton
    );

    updateSendButton();
  }

  scrollChat();
}

window.vote1 = async (index) => {
  const ok = await askConfirm(
    "肯定投呢個？"
  );

  if (!ok) return;

  S.myVote = index;
  renderGame();

  send({
    type: "g1:vote",
    option: index
  });
};

window.chat1 = () => {
  const input = $("#chat1");
  const button = $("#chat1Send");

  if (!input) return;

  const text =
    input.value.trim();

  if (!text) return;

  send({
    type: "g1:chat",
    text
  });

  input.value = "";

  if (button) {
    button.disabled = true;
    button.classList.remove("ready");
  }
};

window.next1 = () => {
  send({
    type: "g1:next"
  });
};

window.finish1 = async () => {
  const ok = await askConfirm(
    "結束呢輪，同大家睇結算？"
  );

  if (!ok) return;

  send({
    type: "g1:finish"
  });
};

window.selectPair1 = (index) => {
  S.g1SelectedPair = index;
  renderGame();
};

/* =========================
   Game 1 · 結算
========================= */

function renderGame1Final(game) {
  const results = game.results || { totalRounds: 0, pairs: [] };
  const pairs = results.pairs || [];

  if (!pairs.length) {
    $("#gamePanel").innerHTML = `
      <div class="eyebrow">
        RESULT · 心有靈犀指數
      </div>

      <h2 class="title">
        仲未夠數據<br>
        <span>計唔到默契指數</span>
      </h2>

      <p class="notice">
        要至少一條題目入面有兩位玩家都投咗票，先可以計算。
      </p>

      ${
        S.room.hostId === S.playerId
          ? `<button class="btn btn-yellow" onclick="next1()">再嚟一題</button>`
          : ""
      }
    `;
    return;
  }

  const selectedIndex =
    S.g1SelectedPair !== undefined && pairs[S.g1SelectedPair]
      ? S.g1SelectedPair
      : 0;

  const selectedPair = pairs[selectedIndex];

  const catRows = Object.entries(selectedPair.byCategory)
    .sort((a, b) => b[1].rate - a[1].rate)
    .map(([cat, stat]) =>
      barRowHtml(cat, stat.rate, `${stat.match}/${stat.shared}`, false, categoryColor(cat))
    )
    .join("");

  const radar = radarChartHtml(selectedPair.byCategory);

  const pairChips = pairs
    .map((p, index) => `
      <button
        type="button"
        class="filter-chip ${index === selectedIndex ? "active" : ""}"
        onclick="selectPair1(${index})"
      >
        ${esc(p.aName)} × ${esc(p.bName)} · ${p.rate}%
      </button>
    `)
    .join("");

  const leaderboardRows = pairs
    .map((p) =>
      barRowHtml(
        `${p.aName} × ${p.bName}`,
        p.rate,
        `${p.match}/${p.shared}`,
        p === pairs[0]
      )
    )
    .join("");

  $("#gamePanel").innerHTML = `
    <div class="eyebrow">
      RESULT · 心有靈犀指數
    </div>

    <h2 class="title">
      全場最有默契：<br>
      <span>${esc(pairs[0].aName)} × ${esc(pairs[0].bName)}</span>
    </h2>

    <div class="result">
      ${pairs[0].rate}% 一致（${pairs[0].match}/${pairs[0].shared} 題）
    </div>

    <p class="notice">
      得兩個選項嘅題目，亂咁揀都有 5 成機會啱，所以 5 成以上先算真係夾。
      一齊玩過嘅題越多，個數字就越準。（呢局一共問咗 ${results.totalRounds} 題）
    </p>

    <div style="height:18px"></div>

    <div class="eyebrow">
      揀一對玩家睇佢哋嘅分類細節
    </div>

    <div class="filter-box" style="margin-top:8px">
      ${pairChips}
    </div>

    <div style="height:10px"></div>

    ${radar ? `<div style="margin:8px 0">${radar}</div>` : ""}

    <div class="bars">
      ${catRows}
    </div>

    <div style="height:24px"></div>

    <div class="eyebrow">
      全部組合排名
    </div>

    <div class="bars" style="margin-top:8px">
      ${leaderboardRows}
    </div>

    ${flourishHtml(results)}

    ${
      S.room.hostId === S.playerId
        ? `
          <div style="height:16px"></div>
          <button class="btn btn-yellow" onclick="next1()">再嚟一題</button>
        `
        : ""
    }
  `;
}

function flourishHtml(results) {
  const maverick = results.maverick;
  const divisive = results.mostDivisive;
  const soulmates = results.soulmates;

  if (!maverick && !divisive && !soulmates) return "";

  const cards = `
    ${
      maverick
        ? `
          <div class="role-card">
            🎭 特立獨行獎
            <div class="title" style="font-size:22px;margin:6px 0 4px">${esc(maverick.name)}</div>
            ${maverick.count} / ${maverick.totalRounds} 題同全場多數意見唔同（${maverick.rate}%）
          </div>
        `
        : ""
    }
    ${
      divisive
        ? `
          <div class="role-card bluffer">
            💥 全場最撕裂一題
            <div class="title" style="font-size:20px;margin:6px 0 4px">${esc(divisive.question)}</div>
            ${esc(divisive.options?.[0] || "選項A")} ${divisive.countA} 票　vs　${esc(divisive.options?.[1] || "選項B")} ${divisive.countB} 票
          </div>
        `
        : ""
    }
  `;

  const soulmateRows = (soulmates || [])
    .map((s) => barRowHtml(`${s.name} 嘅拍檔`, s.rate, s.partnerName, false))
    .join("");

  return `
    <div style="height:24px"></div>
    <div class="eyebrow">花絮</div>

    ${
      cards.trim()
        ? `<div class="choice-grid" style="margin-top:8px">${cards}</div>`
        : ""
    }

    ${
      soulmateRows
        ? `
          <div style="height:16px"></div>
          <div class="eyebrow">你嘅心有靈犀拍檔</div>
          <div class="bars" style="margin-top:8px">${soulmateRows}</div>
        `
        : ""
    }
  `;
}

function barRowHtml(label, rate, fraction, highlight, color) {
  return `
    <div class="vote-result-row">
      <div class="vote-result-head">
        <strong>${esc(label)}</strong>
        <strong>${rate}%　·　${esc(fraction)}</strong>
      </div>

      <div class="vote-result-bar">
        <div
          class="vote-result-fill ${highlight ? "majority" : ""}"
          style="width:${Math.max(rate, 3)}%${color ? `;background:${color}` : ""}"
        ></div>
      </div>
    </div>
  `;
}

// 分類細節嘅雷達圖：8條分類（或者有幾多條算幾多條）做幾隻角，
// match% 做半徑，連成一個多邊形。每隻角嘅標籤用返嗰分類自己嘅顏色。
// 少於3條分類冚埋都畫唔成一個像樣嘅形狀，呢種情況由 caller 揀返用返長條圖。
function radarChartHtml(byCategory) {
  const cats = CATEGORY_ORDER.filter((c) => byCategory[c]);

  if (cats.length < 3) return "";

  // 幾個數字keep到分類標籤（最長5隻字）連埋百分比都唔會伸出SVG範圍以外，
  // 唔係嘅話標籤會被SVG自己嘅viewBox裁走一截，CSS scale落嚟都救唔返。
  const svgW = 480;
  const svgH = 440;
  const cx = svgW / 2;
  const cy = svgH / 2 - 10;
  const maxR = 88;
  const n = cats.length;
  const angleStep = (Math.PI * 2) / n;

  const pointFor = (i, rate) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const r = (rate / 100) * maxR;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  const ringPoints = (frac) =>
    cats
      .map((_, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        const r = frac * maxR;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      })
      .join(" ");

  const dataPoints = cats.map((c, i) => pointFor(i, byCategory[c].rate));
  const dataPolyStr = dataPoints.map((p) => p.join(",")).join(" ");

  let svg = `<svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%;max-width:400px;display:block;margin:0 auto">`;

  [0.25, 0.5, 0.75, 1].forEach((f) => {
    svg += `<polygon points="${ringPoints(f)}" fill="none" stroke="#e2e4ea" stroke-width="1"/>`;
  });

  cats.forEach((c, i) => {
    const [x, y] = pointFor(i, 100);
    svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e2e4ea" stroke-width="1"/>`;
  });

  svg += `<polygon points="${dataPolyStr}" fill="#929FC1" fill-opacity="0.35" stroke="#68779f" stroke-width="2.5"/>`;

  cats.forEach((c, i) => {
    const [x, y] = dataPoints[i];
    svg += `<circle cx="${x}" cy="${y}" r="4.5" fill="${categoryColor(c)}" stroke="#fff" stroke-width="1.5"/>`;
  });

  cats.forEach((c, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const cosA = Math.cos(angle);
    const lx = cx + (maxR + 42) * cosA;
    const ly = cy + (maxR + 42) * Math.sin(angle);
    const anchor = cosA > 0.35 ? "start" : cosA < -0.35 ? "end" : "middle";
    const color = categoryColor(c);
    const rate = byCategory[c].rate;

    svg += `
      <text x="${lx}" y="${ly - 4}" text-anchor="${anchor}" font-size="11" font-weight="900" fill="${color}">${esc(c)}</text>
      <text x="${lx}" y="${ly + 10}" text-anchor="${anchor}" font-size="10" font-weight="700" fill="${color}" opacity="0.75">${rate}%</text>
    `;
  });

  svg += `</svg>`;

  return svg;
}

/* =========================
   Game 2
========================= */

function roleBlock() {
  if (!S.role) return "";

  const label =
    S.role === "judge"
      ? lz("諗樣（公開）", "猜題者（公開）")
      : S.role === "truth"
        ? lz("老實人", "老實人")
        : "9upper";

  return `
    <div
      class="role ${S.role}"
    >
      <div class="eyebrow">
        YOUR ROLE
      </div>

      <strong
        style="font:700 30px 'Fredoka'"
      >
        ${label}
      </strong>

      ${
        S.explanation
          ? `
            <p>
              <b>${lz("正確解釋：", "正確解釋：")}</b>
              ${esc(S.explanation)}
            </p>
          `
          : ""
      }
    </div>
  `;
}

function renderGame2(game) {
  if (game.phase === "gameover") {
    const ranking = [...(S.room.players || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
    const isHost = S.room.hostId === S.playerId;
    $("#gamePanel").innerHTML = `
      <div class="eyebrow">GAME OVER · ${game.round} ROUNDS</div>
      <h2 class="title">瞎掰王<br><span>${lz("最終排名", "最終排名")}</span></h2>
      <div class="g6-rank">
        ${ranking.map((p, i) => `
          <div class="g6-rank-row ${i === 0 ? "first" : ""} ${p.id === S.playerId ? "me" : ""}">
            <span>${i + 1} · ${esc(p.nickname)}</span><b>${p.score || 0}</b>
          </div>
        `).join("")}
      </div>
      <div class="g6-end-actions">
        ${isHost ? `<button type="button" class="btn btn-yellow" onclick="restart2()">${lz("再玩一局", "再玩一局")}</button>` : `<p class="notice">${lz("等房主決定再玩一局定散 Band", "等房主決定要再玩一局還是解散")}</p>`}
        <button type="button" class="btn btn-outline" onclick="leaveRoom()">${lz("返大廳", "回大廳")}</button>
      </div>
    `;
    clearInterval(S.timer);
    return;
  }

  let html = `
    <div
      class="row"
      style="justify-content:space-between;align-items:end"
    >
      <div>
        <div class="eyebrow">
          9UPPER · ROUND ${game.round} / ${game.totalRounds}
        </div>

        <h2 class="title">
          瞎掰王<br>
          <span>
            ${esc(game.term || "")}
          </span>
        </h2>
      </div>

      ${
        game.endsAt
          ? `
            <div
              id="time"
              class="timer"
            ></div>
          `
          : ""
      }
    </div>

    ${roleBlock()}
  `;

  if (game.phase === "prep") {
    const myReady = !!game.myPrepReady;

    html += `
      <div class="status">
        ${lz("睇題目 30 秒。只有老實人收到正確解釋。", "看題目 30 秒。只有老實人會收到正確解釋。")}
      </div>

      <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button
          id="prepReadyBtn"
          class="btn ${myReady ? "btn-green" : "btn-ready"}"
          ${myReady ? "disabled" : ""}
          onclick="ready2()"
        >
          ${myReady ? "✓ Ready" : lz("準備好", "準備好了")}
        </button>

        <span class="notice">
          ${game.prepReadyCount || 0}/${game.prepTotal || 0} ${lz("人準備好，全部準備好就唔使等夠 30 秒。", "人準備好，全部準備好就不必等滿 30 秒。")}
        </span>
      </div>
    `;
  }

  if (game.phase === "picking") {
    const isJudge = game.judgeId === S.playerId;
    const left = (game.candidates || []).length;

    html += `
      <div
        class="eyebrow"
        style="margin-top:18px"
      >
        WHO SPEAKS NEXT
      </div>

      ${
        isJudge
          ? `
            <div class="status">
              ${lz("10 秒內揀下一位發言。唔揀就隨機。", "請在 10 秒內選出下一位發言者，不選就隨機。")}
            </div>

            <div class="choice-grid">
              ${
                (game.candidates || [])
                  .map(
                    (player) => `
                      <button
                        class="choice"
                        onclick="pick2('${player.id}')"
                      >
                        ${esc(player.nickname)}
                      </button>
                    `
                  )
                  .join("")
              }
            </div>
          `
          : `
            <div class="status">
              ${lz(`諗樣揀緊下一位發言（仲有 ${left} 位未講）。`, `猜題者正在選下一位發言者（還有 ${left} 位未發言）。`)}
            </div>
          `
      }
    `;
  }
    if (game.phase === "speaking") {
    const active =
      S.room.players.find(
        (player) =>
          player.id ===
          game.currentPlayerId
      );

    const mine =
      game.currentPlayerId ===
      S.playerId;

    html += `
      <div class="status">
        ${lz("而家發言：", "目前發言：")}
        <b>
          ${esc(
            active?.nickname || ""
          )}
        </b>

        ${
          mine
            ? lz(" · 輪到你喇，30 秒。", " · 輪到你了，30 秒。")
            : ""
        }

        <span class="muted">
          （${(game.spokenIds || []).length}/${(game.order || []).length} ${lz("已發言", "已發言")}）
        </span>
      </div>

      <div
        id="chatBox"
        class="chat"
      >
        ${renderChatHtml()}
      </div>

      <div
        class="row"
        style="margin-top:10px"
      >
        <input
          id="chat2"
          ${
            mine
              ? ""
              : "disabled"
          }
          placeholder="${
            mine
              ? lz("打你嘅解釋…", "輸入你的解釋…")
              : lz("等緊發言…", "等待發言中…")
          }"
        >

        <button
          id="chat2Send"
          class="btn btn-send"
          disabled
          onclick="chat2()"
        >
          SEND
        </button>
      </div>
    `;

    const chatInput = $("#chat2");
    const chatSend = $("#chat2Send");

    if (chatInput && chatSend) {
      const updateSendButton = () => {
        const hasText =
          chatInput.value.trim().length > 0;

        chatSend.disabled =
          !mine || !hasText;

        chatSend.classList.toggle(
          "ready",
          mine && hasText
        );
      };

      chatInput.addEventListener(
        "input",
        updateSendButton
      );

      updateSendButton();
    }

    scrollChat();
  }

  if (game.phase === "judge") {

    const isJudge =
      game.judgeId ===
      S.playerId;

    html += `
      <div
        class="eyebrow"
        style="margin-top:18px"
      >
        WHO IS THE ${lz("老實人", "老實人")}
      </div>

      ${
        isJudge
          ? `
            <div class="status">
              ${lz("2 分鐘內揀出你認為嘅老實人。唔揀就隨機。", "請在 2 分鐘內選出你認為的老實人，不選就隨機。")}
            </div>

            <div class="choice-grid">
              ${
                (game.choices || [])
                  .map(
                    (player) => `
                      <button
                        class="choice"
                        onclick="judge2('${player.id}')"
                      >
                        ${esc(
                          player.nickname
                        )}
                      </button>
                    `
                  )
                  .join("")
              }
            </div>
          `
          : `
            <div class="status">
              ${lz("諗樣有 2 分鐘揀出老實人。", "猜題者有 2 分鐘選出老實人。")}
            </div>
          `
      }
    `;
  }

  if (game.phase === "result") {

    html += `
      <div class="result">
        ${
          game.correct
            ? lz("✅ 諗樣估中咗！", "✅ 猜題者猜對了！")
            : lz("❌ 諗樣估錯咗！", "❌ 猜題者猜錯了！")
        }
      </div>

      <p class="notice">
        ${lz("真正嘅老實人：", "真正的老實人：")}
        <b>
          ${esc(
            game.truthNickname
          )}
        </b>
        <br>

        ${lz("正確解釋：", "正確解釋：")}
        ${esc(
          game.correctExplanation
        )}
      </p>

      ${
        S.room.hostId ===
        S.playerId
          ? `
            <button
              class="btn yellow"
              style="margin-top:15px"
              onclick="next2()"
            >
              ${game.round >= game.totalRounds ? lz("睇最終結果", "查看最終結果") : "NEXT ROUND"}
            </button>
          `
          : ""
      }
    `;
  }

  $("#gamePanel").innerHTML = html;

  if (game.endsAt) {
    startTimer(
      $("#time"),
      game.endsAt
    );
  }
}

window.chat2 = () => {
  const input = $("#chat2");
  const button = $("#chat2Send");

  if (!input) return;

  const text =
    input.value.trim();

  if (!text) return;

  send({
    type: "g2:chat",
    text
  });

  input.value = "";

  if (button) {
    button.disabled = true;
    button.classList.remove("ready");
  }
};

window.ready2 = () => {
  send({
    type: "g2:ready"
  });
};

window.pick2 = (targetId) => {
  send({
    type: "g2:pick",
    targetId
  });
};

window.judge2 = (targetId) => {
  send({
    type: "g2:judge",
    targetId
  });
};

window.next2 = () => {
  send({
    type: "g2:next"
  });
};

/* =========================
   Game 3 · He/She's a 10
========================= */

function renderGame3(game) {
  if (game.phase === "writing") return renderGame3Writing(game);
  if (game.phase === "rating") return renderGame3Rating(game);
  if (game.phase === "reveal") return renderGame3Reveal(game);
  if (game.phase === "gameover") return renderGame3Gameover(game);
}

function renderGame3Writing(game) {
  const renderKey = `writing-${game.round}`;

  // 淨係第一次入呢個phase先重畫成個畫面（等textarea唔會俾其他人交題觸發嘅
  // state 廣播打斷）；之後淨係update進度/timer呢啲細位。
  if (S.g3RenderKey === renderKey && $("#g3AnswerBox")) {
    const counter = $("#g3SubmitCount");
    if (counter) counter.textContent = `${lz("已交", "已提交")}：${game.submittedCount} / ${game.totalToSubmit}`;

    const btn = document.querySelector('[onclick="g3Submit()"]');
    if (btn && game.mySubmitted && btn.dataset.submitted !== "1") {
      btn.dataset.submitted = "1";
      btn.textContent = lz("✓ 你已交題", "✓ 你已提交");
      btn.classList.remove("btn-yellow");
      btn.classList.add("btn-green");
      btn.disabled = true;
    }
    return;
  }
  S.g3RenderKey = renderKey;

  if (game.isRater) {
    $("#gamePanel").innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:end">
        <div>
          <div class="eyebrow">ROUND ${game.round} / ${game.totalRounds}</div>
          <h2 class="title">He/She's<br><span>a 10.</span></h2>
        </div>
        <div id="time" class="timer"></div>
      </div>

      <p class="notice">
        ${lz("今輪你係莊家，唔使寫嘢。等緊其他人交題…", "這一輪你是莊家，不用寫。正在等其他人提交…")}
        <span id="g3SubmitCount">${lz("已交", "已提交")}：${game.submittedCount} / ${game.totalToSubmit}</span>
      </p>
    `;
  } else {
    $("#gamePanel").innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:end">
        <div>
          <div class="eyebrow">ROUND ${game.round} / ${game.totalRounds}</div>
          <h2 class="title">He/She's<br><span>a 10.</span></h2>
        </div>
        <div id="time" class="timer"></div>
      </div>

      <p class="notice">${lz("莊家", "莊家")}：${esc(game.raterNickname)}</p>

      <div class="question">
        ${lz("莊家心水數字係", "莊家心中的數字是")}
        <b class="g3-target">${game.myTarget}</b>
        ${lz("分。寫一句「佢係十分，但係___」，愈貼近呢個分，你嘅分數先會愈高。", "分。寫一句「他是十分，但是___」，越貼近這個分數，你的得分就越高。")}
      </div>

      <div class="answerbox">
        <textarea
          id="g3AnswerBox"
          maxlength="25"
          placeholder="${lz("佢係十分，但係……", "他是十分，但是……")}"
          oninput="g3UpdateCount()"
          ${game.mySubmitted ? "disabled" : ""}
        ></textarea>
      </div>

      <p class="notice">
        <span id="g3SubmitCount">${lz("已交", "已提交")}：${game.submittedCount} / ${game.totalToSubmit}</span>
        ·
        <span id="g3CharCount">0 / 25</span>
      </p>

      <button
        class="btn ${game.mySubmitted ? "btn-green" : "btn-yellow"} wide"
        onclick="g3Submit()"
        data-submitted="${game.mySubmitted ? "1" : "0"}"
        ${game.mySubmitted ? "disabled" : ""}
      >
        ${game.mySubmitted ? lz("✓ 你已交題", "✓ 你已提交") : lz("交題", "提交")}
      </button>
    `;
  }

  if (game.endsAt) startTimer($("#time"), game.endsAt);
}

function g3UpdateCount() {
  const box = $("#g3AnswerBox");
  const el = $("#g3CharCount");
  if (!box || !el) return;
  el.textContent = `${box.value.length} / 25`;
}

window.g3Submit = async () => {
  const btn = document.querySelector('[onclick="g3Submit()"]');

  if (btn?.dataset.submitted === "1") {
    return;
  }

  const box = $("#g3AnswerBox");
  if (!box) return;
  const text = box.value.trim();
  if (!text) return;

  const ok = await askConfirm(
    lz(`確定要交呢句？交咗就唔可以再改：「${text}」`, `確定要提交這句嗎？提交後就不能再修改：「${text}」`)
  );
  if (!ok) return;

  send({ type: "g3:submit", text });
  box.disabled = true;
};

function renderGame3Rating(game) {
  if (!game.isRater) {
    const idx = game.currentRatingIndex ?? 0;

    $("#gamePanel").innerHTML = `
      <div class="eyebrow">ROUND ${game.round} / ${game.totalRounds}</div>
      <h2 class="title">He/She's<br><span>a 10.</span></h2>

      ${
        game.ratingStage === "preview"
          ? `<p class="notice">${lz("莊家未開始評分，投一票你覺得最WTF嗰句：", "莊家還沒開始評分，投票選出你覺得最WTF的一句：")}</p>`
          : `<p class="notice">
              ${lz("莊家", "莊家")} ${esc(game.raterNickname)} ${lz("評緊分……", "正在評分……")} (${idx + 1} / ${game.totalAnswers})
            </p>`
      }

      <div class="answers" style="flex-direction:column;gap:10px">
        ${(game.answers || [])
          .map(
            (text, i) => `
              <div
                class="answerbox"
                style="text-align:left;display:flex;justify-content:space-between;align-items:center;gap:10px;${
                  game.ratingStage === "scoring" && i === idx
                    ? "border:2px solid var(--game-accent,#F2795F)"
                    : ""
                }"
              >
                <span>${esc(text)}</span>
                ${
                  game.ratingStage === "preview"
                    ? `<button
                        class="btn btn-outline"
                        style="padding:6px 10px;font-size:13px;flex-shrink:0;${
                          game.myWtfVote === i
                            ? "background:var(--game-accent);color:#fff;border-color:var(--game-accent)"
                            : ""
                        }"
                        onclick="g3Wtf(${i})"
                      >
                        ${game.myWtfVote === i ? "✓ 最WTF" : lz("投WTF", "投WTF")}
                      </button>`
                    : ""
                }
              </div>
            `
          )
          .join("")}
      </div>
    `;
    return;
  }

  const renderKey = `rating-${game.round}-${game.ratingStage}-${game.currentRatingIndex ?? 0}`;
  if (S.g3RenderKey === renderKey) return;
  S.g3RenderKey = renderKey;

  if (game.ratingStage === "preview") {
    $("#gamePanel").innerHTML = `
      <div class="eyebrow">ROUND ${game.round} / ${game.totalRounds}</div>
      <h2 class="title">${lz("評分時間", "評分時間")}<br><span>${lz("睇晒先評分。", "看完再評分。")}</span></h2>

      <div class="answers" style="flex-direction:column;gap:10px">
        ${(game.answers || [])
          .map(
            (text) => `
              <div class="answerbox" style="text-align:left">
                ${esc(text)}
              </div>
            `
          )
          .join("")}
      </div>

      <button class="btn btn-yellow wide" onclick="g3StartRating()">
        ${lz("開始逐句評分", "開始逐句評分")}
      </button>
    `;
    return;
  }

  // scoring
  const idx = game.currentRatingIndex ?? 0;
  const text = (game.answers || [])[idx] || "";

  $("#gamePanel").innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:end">
      <div>
        <div class="eyebrow">${lz("評分", "評分")} ${idx + 1} / ${game.totalAnswers}</div>
        <h2 class="title">${lz("呢句幾多分？", "這句幾分？")}</h2>
      </div>
      <div id="time" class="timer"></div>
    </div>

    <div class="question">${esc(text)}</div>

    <div class="scorerow" style="display:flex;align-items:center;gap:12px;margin:16px 0">
      <input
        type="range"
        id="g3ScoreRange"
        min="1"
        max="10"
        value="5"
        oninput="document.querySelector('#g3ScorePill').textContent=this.value"
        style="flex:1"
      >
      <span id="g3ScorePill" class="scorepill">5</span>
    </div>

    <button class="btn btn-yellow wide" onclick="g3Score(${idx})">
      ${lz("確認評分", "確認評分")}
    </button>
  `;

  if (game.endsAt) startTimer($("#time"), game.endsAt);
}

window.g3StartRating = () => {
  send({ type: "g3:rating-start" });
};

window.g3Wtf = (index) => {
  send({ type: "g3:wtf", index });
};

window.g3Score = (index) => {
  const range = $("#g3ScoreRange");
  if (!range) return;
  send({ type: "g3:score", index, score: Number(range.value) });
};

function renderGame3Reveal(game) {
  const renderKey = `reveal-${game.round}`;
  if (S.g3RenderKey === renderKey) return;
  S.g3RenderKey = renderKey;

  const results = game.results || [];

  $("#gamePanel").innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:end">
      <div>
        <div class="eyebrow">ROUND ${game.round} / ${game.totalRounds}</div>
        <h2 class="title">${lz("結果", "結果")}<br><span>${lz("揭曉。", "揭曉。")}</span></h2>
      </div>
      <div id="time" class="timer"></div>
    </div>

    <div id="g3ResultsList"></div>

    ${
      game.isFinalRound
        ? `<p class="notice">${lz("最後一round！結算緊……", "最後一回合！正在結算……")}</p>`
        : `<p class="notice">${lz("下一round就快開始……", "下一回合即將開始……")}</p>`
    }
  `;

  if (game.endsAt) startTimer($("#time"), game.endsAt);

  const list = $("#g3ResultsList");

  results.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "answercard";
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <div style="flex:1">
          <b>${i === 0 ? "★ " : ""}${esc(r.nickname)}</b>
          ${game.wtfWinnerId === r.playerId ? '<span class="notice" style="margin:0 0 0 6px">🤯 ' + lz("全場最WTF", "全場最WTF") + '</span>' : ""}
          <div class="notice" style="margin:2px 0">${esc(r.text)}</div>
          <div class="notice" style="margin:0">${lz("心水", "目標")} ${r.target} 分 · ${lz("莊家俾", "莊家給")} ${r.score} 分</div>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button
              class="btn btn-outline"
              style="padding:4px 10px;font-size:12px;${r.myReaction === "up" ? "background:var(--game-accent);color:#fff;border-color:var(--game-accent)" : ""}"
              onclick="g3React('${r.playerId}','up')"
            >
              👍 ${r.reactions?.up || 0}
            </button>
            <button
              class="btn btn-outline"
              style="padding:4px 10px;font-size:12px;${r.myReaction === "down" ? "background:var(--game-accent);color:#fff;border-color:var(--game-accent)" : ""}"
              onclick="g3React('${r.playerId}','down')"
            >
              👎 ${r.reactions?.down || 0}
            </button>
          </div>
        </div>
        <div class="slotnum" data-target="${r.roundPoints}" style="
          width:48px;height:48px;border-radius:12px;background:var(--yellow);
          display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:20px;flex-shrink:0;
        ">–</div>
      </div>
    `;
    list.appendChild(row);
  });

  document.querySelectorAll("#g3ResultsList .slotnum").forEach((el, idx) => {
    const target = parseInt(el.dataset.target, 10);
    let ticks = 0;
    const maxTicks = 12 + idx * 3;
    const iv = setInterval(() => {
      ticks++;
      if (ticks < maxTicks) {
        el.textContent = "+" + (1 + Math.floor(Math.random() * 10));
      } else {
        el.textContent = "+" + target;
        clearInterval(iv);
      }
    }, 70);
  });
}

window.g3React = (targetPlayerId, reaction) => {
  send({ type: "g3:react", playerId: targetPlayerId, reaction });
};

function renderGame3Gameover(game) {
  const renderKey = "gameover";
  if (S.g3RenderKey === renderKey) return;
  S.g3RenderKey = renderKey;

  const ranking = game.finalRanking || [];
  const history = game.history || [];
  const champion = game.champion;
  const wtfChampion = game.wtfChampion;

  S.g3HistoryIndex = history.length ? history.length - 1 : 0;

  $("#gamePanel").innerHTML = `
    <div class="eyebrow">GAME OVER</div>
    <h2 class="title">${lz("結算", "結算")}<br><span>He/She's a 10.</span></h2>

    ${
      champion
        ? `<div class="question" style="text-align:center">
            <div style="font-size:13px;opacity:.85">${lz("十分知己", "十分知己")}</div>
            <div style="font-family:'Fredoka';font-size:28px">${esc(champion.nickname)}</div>
            <div style="font-size:13px;opacity:.85">${lz("總分", "總分")} ${champion.score} 分</div>
          </div>`
        : ""
    }

    <div class="answerbox" style="text-align:center;margin-top:10px">
      <div style="font-size:13px;color:var(--game-accent)">${lz("全場最WTF", "全場最WTF")}</div>
      ${
        wtfChampion
          ? `<div style="font-family:'Fredoka';font-size:22px">${esc(wtfChampion.nickname)}</div>
             <div class="notice" style="margin:0">${lz("攞咗", "獲得")} ${wtfChampion.wtfCount} ${lz("次最WTF", "次最WTF")}</div>`
          : `<div class="notice" style="margin:6px 0 0">本局沒人玩WTF</div>`
      }
    </div>

    <div class="players" style="margin-top:16px">
      ${ranking
        .map(
          (r, i) => `
            <div class="player ${i === 0 ? "host" : ""}">
              <div>${i === 0 ? "👑 " : `${i + 1}. `}${esc(r.nickname)}</div>
              <b>${r.score} 分</b>
            </div>
          `
        )
        .join("")}
    </div>

    ${
      history.length
        ? `
          <div class="eyebrow" style="margin-top:20px">${lz("逐ROUND回顧", "逐回合回顧")}</div>

          <div class="tabs" style="margin:8px 0" id="g3HistoryTabs">
            ${history
              .map(
                (h, i) => `
                  <button
                    type="button"
                    class="filter-chip ${i === S.g3HistoryIndex ? "active" : ""}"
                    onclick="g3ShowHistory(${i})"
                  >
                    ROUND ${h.round}
                  </button>
                `
              )
              .join("")}
          </div>

          <div id="g3HistoryDetail"></div>
        `
        : ""
    }
  `;

  if (history.length) {
    S.g3HistoryData = history;
    renderGame3HistoryDetail(S.g3HistoryIndex);
  }
}

function renderGame3HistoryDetail(index) {
  const history = S.g3HistoryData || [];
  const h = history[index];
  const detail = $("#g3HistoryDetail");
  if (!h || !detail) return;

  detail.innerHTML = `
    <p class="notice">${lz("莊家", "莊家")}：${esc(h.raterNickname)} · ${lz("心水數字", "目標數字")} ${h.target} 分</p>

    ${h.results
      .map(
        (r) => `
          <div class="answercard">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="flex:1">
                <b>${esc(r.nickname)}</b>
                ${h.wtfWinnerId === r.playerId ? '<span class="notice" style="margin:0 0 0 6px">🤯 最WTF</span>' : ""}
                <div class="notice" style="margin:2px 0">${esc(r.text)}</div>
                <div class="notice" style="margin:0">
                  ${lz("莊家俾", "莊家給")} ${r.score} 分 · ${lz("貼近度", "貼近度")} +${r.roundPoints}
                  · 👍 ${r.reactions?.up || 0} 👎 ${r.reactions?.down || 0}
                </div>
              </div>
            </div>
          </div>
        `
      )
      .join("")}
  `;
}

window.g3ShowHistory = (index) => {
  S.g3HistoryIndex = index;

  document
    .querySelectorAll("#g3HistoryTabs .filter-chip")
    .forEach((el, i) => el.classList.toggle("active", i === index));

  renderGame3HistoryDetail(index);
};

/* =========================
   Game 4 · 誰最有可能
========================= */

const G4_AVATAR_SHAPES = [
  (c) => `<circle cx="8" cy="8" r="3" fill="${c}"/><circle cx="16" cy="16" r="3" fill="${c}" opacity=".55"/>`,
  (c) => `<path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="${c}"/>`,
  (c) => `<rect x="5" y="5" width="6" height="6" rx="2" fill="${c}"/><rect x="13" y="13" width="6" height="6" rx="2" fill="${c}" opacity=".55"/>`,
  (c) => `<path d="M12 20C7 16 3 12.5 3 8.8C3 6.4 5 4.5 7.3 4.5C9.1 4.5 10.5 5.6 12 7.2C13.5 5.6 14.9 4.5 16.7 4.5C19 4.5 21 6.4 21 8.8C21 12.5 17 16 12 20Z" fill="${c}"/>`,
  (c) => `<polygon points="12,3 21,20 3,20" fill="${c}"/>`,
  (c) => `<circle cx="12" cy="12" r="8" fill="none" stroke="${c}" stroke-width="3"/>`
];

const G4_AVATAR_COLORS = [
  "#929FC1", "#F2D965", "#004643", "#F2795F",
  "#7B57CE", "#58a04f", "#c46fa3", "#e2884a"
];

function g4AvatarSvg(seat) {
  const shapeFn = G4_AVATAR_SHAPES[(seat || 0) % G4_AVATAR_SHAPES.length];
  const color = G4_AVATAR_COLORS[(seat || 0) % G4_AVATAR_COLORS.length];
  return { svg: shapeFn("#fff"), bg: color };
}

function renderGame4(game) {
  if (game.phase === "voting") return renderGame4Voting(game);
  if (game.phase === "reveal") return renderGame4Reveal(game);
  if (game.phase === "gameover") return renderGame4Gameover(game);
}

function renderGame4Voting(game) {
  // 如果自己已經投咗，就唔重畫成個畫面（避免其他人陸續投票觸發嘅
  // state 廣播打斷咗你嘅畫面），淨係update「已投」人數。
  const renderKey = `g4-voting-${game.round}`;
  if (S.g4RenderKey === renderKey && game.myVote) {
    const counter = $("#g4VotedCount");
    if (counter) counter.textContent = `已投：${game.votedCount} / ${game.totalToVote}`;
    return;
  }
  S.g4RenderKey = renderKey;

  const players = S.room.players || [];
  const voted = !!game.myVote;

  const avatarButtons = players.map((p) => {
    const { svg, bg } = g4AvatarSvg(p.seat);
    const isMine = game.myVote === p.id;
    return `
      <button
        type="button"
        class="g4-avatar-btn ${isMine ? "picked" : ""}"
        style="opacity:${p.connected ? "1" : ".45"}"
        onclick="g4Vote('${p.id}', '${esc(p.nickname)}')"
        ${voted ? "disabled" : ""}
      >
        <span class="g4-avatar" style="background:${bg}">
          <svg viewBox="0 0 24 24">${svg}</svg>
          ${isMine ? '<span class="g4-avatar-check">✓</span>' : ""}
        </span>
        <span class="g4-avatar-name">${esc(p.nickname)}</span>
      </button>
    `;
  }).join("");

  $("#gamePanel").innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:end">
      <div>
        <div class="eyebrow">ROUND ${game.round} / ${game.totalRounds}</div>
        <h2 class="title">誰最有<br><span>可能……</span></h2>
      </div>
      <div id="time" class="timer"></div>
    </div>

    <div class="question">${esc(game.question)}</div>

    ${
      voted
        ? `<div class="g4-voted-banner">✓ 你已投票，等緊其他人</div>`
        : `<p class="notice" style="font-weight:800">👇 撳頭像投俾你覺得最似嘅人</p>`
    }

    <div class="g4-avatar-grid">
      ${avatarButtons}
    </div>

    <div class="g4-special-row">
      <button
        type="button"
        class="btn btn-outline g4-special-btn ${game.myVote === "everyone" ? "active" : ""}"
        onclick="g4Vote('everyone', '大家都有可能')"
        ${voted ? "disabled" : ""}
      >
        大家都有可能
      </button>
      <button
        type="button"
        class="btn btn-outline g4-special-btn ${game.myVote === "abstain" ? "active" : ""}"
        onclick="g4Vote('abstain', '棄權')"
        ${voted ? "disabled" : ""}
      >
        棄權
      </button>
    </div>

    <p class="notice" id="g4VotedCount">已投：${game.votedCount} / ${game.totalToVote}</p>
  `;

  if (game.endsAt) startTimer($("#time"), game.endsAt);
}

window.g4Vote = async (target, label) => {
  if (S.g4Voting) return;

  const alreadyVoted = !!S.room?.gameState?.myVote;
  if (alreadyVoted) {
    flash("你已投票！");
    return;
  }

  const ok = await askConfirm(`確定要投「${label}」？投咗就唔可以再改。`);
  if (!ok) return;

  S.g4Voting = true;
  send({ type: "g4:vote", target });
};

function renderGame4Reveal(game) {
  const renderKey = `g4-reveal-${game.round}`;
  if (S.g4RenderKey === renderKey) return;
  S.g4RenderKey = renderKey;
  S.g4Voting = false;

  const r = game.results || {};
  const tally = r.tally || [];
  const maxCount = Math.max(1, ...tally.map((t) => t.count), r.everyoneCount || 0);

  function voterLine(names) {
    if (!names || !names.length) return "";
    return `<div class="g4-bar-voters">${names.map(esc).join("、")}</div>`;
  }

  const bars = tally.map((t) => {
    const isWinner = t.playerId === r.winnerId;
    return `
    <div class="g4-bar-row-wrap">
      <div class="g4-bar-row">
        <div class="g4-bar-label">${isWinner ? "★ " : ""}${esc(t.nickname)}</div>
        <div class="g4-bar-track">
          <div class="g4-bar-fill" style="width:${(t.count / maxCount) * 100}%;background:${isWinner ? "var(--yellow)" : "var(--game-accent)"}"></div>
        </div>
        <div class="g4-bar-count">${t.count}</div>
      </div>
      ${voterLine(t.voters)}
    </div>
  `;
  }).join("");

  const everyoneRow = r.everyoneCount ? `
    <div class="g4-bar-row-wrap">
      <div class="g4-bar-row">
        <div class="g4-bar-label">大家都有可能</div>
        <div class="g4-bar-track">
          <div class="g4-bar-fill" style="width:${(r.everyoneCount / maxCount) * 100}%;background:#aaa"></div>
        </div>
        <div class="g4-bar-count">${r.everyoneCount}</div>
      </div>
      ${voterLine(r.everyoneVoters)}
    </div>
  ` : "";

  $("#gamePanel").innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:end">
      <div>
        <div class="eyebrow">ROUND ${game.round} / ${game.totalRounds}</div>
        <h2 class="title">結果<br><span>揭曉。</span></h2>
      </div>
      <div id="time" class="timer"></div>
    </div>

    <div class="question">${esc(game.question)}</div>

    <div class="g4-bar-list">
      ${bars || '<p class="notice">呢輪冇人俾人投中。</p>'}
      ${everyoneRow}
      ${r.abstainCount ? `<p class="notice">棄權：${r.abstainCount} 人</p>` : ""}
    </div>

    <p class="notice">下一round就快開始……</p>
  `;

  if (game.endsAt) startTimer($("#time"), game.endsAt);
}

function renderGame4Gameover(game) {
  const renderKey = "g4-gameover";
  if (S.g4RenderKey === renderKey) return;
  S.g4RenderKey = renderKey;

  const ranking = game.finalRanking || [];
  const champion = game.champion;
  const maxScore = Math.max(1, ...ranking.map((r) => r.score));

  $("#gamePanel").innerHTML = `
    <div class="eyebrow">GAME OVER</div>
    <h2 class="title">結算<br><span>誰最有可能。</span></h2>

    ${champion ? `
      <div class="question" style="text-align:center">
        <div style="font-size:13px;opacity:.85">全場總冠軍</div>
        <div style="font-family:'Fredoka';font-size:26px">${esc(champion.nickname)}</div>
        <div style="font-size:13px;opacity:.85">俾人投中 ${champion.score} 次</div>
      </div>
    ` : ""}

    <div class="g4-bar-list" style="margin-top:16px">
      ${ranking.map((r) => `
        <div class="g4-bar-row">
          <div class="g4-bar-label">${esc(r.nickname)}</div>
          <div class="g4-bar-track">
            <div class="g4-bar-fill" style="width:${(r.score / maxScore) * 100}%;background:var(--game-accent)"></div>
          </div>
          <div class="g4-bar-count">${r.score}</div>
        </div>
      `).join("")}
    </div>

    <div class="eyebrow" style="margin-top:20px">各人嘅代表作</div>
    <div style="margin-top:8px">
      ${ranking.filter((r) => r.signature).map((r) => `
        <div class="answercard">
          <b>${esc(r.nickname)}</b>
          <div class="notice" style="margin:2px 0">${esc(r.signature.question)}</div>
          <div class="notice" style="margin:0">第 ${r.signature.round} round，${r.signature.votes} 票</div>
        </div>
      `).join("") || '<p class="notice">呢局冇乜代表作。</p>'}
    </div>
  `;
}

/* =========================
   Game 5 · 故事接龍
========================= */

function renderGame5(game) {
  if (game.phase === "writing") return renderGame5Writing(game);
  if (game.phase === "gameover") return renderGame5Gameover(game);
}

const G5_DOT_COLORS = [
  "#929FC1", "#F2795F", "#58a04f", "#c46fa3",
  "#e2884a", "#7B57CE", "#004643", "#d16b63"
];

function g5StoryHtml(story) {
  return (story || [])
    .map((s, i) => {
      if (i === 0) {
        return `<span class="g5-story-part">${esc(s.text)}</span>`;
      }
      const color = G5_DOT_COLORS[i % G5_DOT_COLORS.length];
      return `
        <span
          class="g5-story-part g5-story-tap"
          data-author="${esc(s.authorNickname)}"
          onclick="g5ShowAuthor(this)"
        >${esc(s.text)}<span class="g5-story-dot" style="background:${color}"></span></span>
      `;
    })
    .join(" ");
}

window.g5ShowAuthor = (el) => {
  const name = el?.dataset?.author || "";
  if (name) flash(`呢個係 ${name} 寫嘅`);
};

function renderGame5Writing(game) {
  const renderKey = `g5-writing-${game.round}`;
  if (S.g5RenderKey === renderKey) return;
  S.g5RenderKey = renderKey;

  const storyHtml = g5StoryHtml(game.story);

  if (game.isMyTurn) {
    $("#gamePanel").innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:end">
        <div>
          <div class="eyebrow">ROUND ${game.round} / ${game.totalRounds}</div>
          <h2 class="title">輪到<br><span>你接落去。</span></h2>
        </div>
        <div id="time" class="timer"></div>
      </div>

      <div class="question g5-story-box">${storyHtml}</div>

      <div class="answerbox" style="display:flex;align-items:center;gap:8px">
        <input
          id="g5Input"
          type="text"
          maxlength="${game.maxLen}"
          placeholder="${game.mode === "char" ? "打一至幾個字……" : "接一句（最多15字）……"}"
          oninput="g5UpdateCount()"
          style="flex:1;border:none;outline:none;font-size:16px;background:transparent"
        >
        ${
          game.mode === "char"
            ? `
              <button type="button" class="btn btn-outline" style="padding:8px 10px" onclick="g5AddPunct('，')">，</button>
              <button type="button" class="btn btn-outline" style="padding:8px 10px" onclick="g5AddPunct('。')">。</button>
            `
            : ""
        }
      </div>

      <p class="notice"><span id="g5Count">0 / ${game.maxLen}</span></p>

      <button class="btn btn-yellow wide" onclick="g5Submit()">交出去</button>
    `;
  } else {
    $("#gamePanel").innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:end">
        <div>
          <div class="eyebrow">ROUND ${game.round} / ${game.totalRounds}</div>
          <h2 class="title">故事<br><span>接緊龍。</span></h2>
        </div>
        <div id="time" class="timer"></div>
      </div>

      <div class="question g5-story-box">${storyHtml}</div>

      <p class="notice">等緊${esc(game.currentTurnNickname)}接落去……</p>
    `;
  }

  if (game.endsAt) startTimer($("#time"), game.endsAt);
}

function g5UpdateCount() {
  const input = $("#g5Input");
  const el = $("#g5Count");
  if (!input || !el) return;
  el.textContent = `${input.value.length} / ${input.maxLength}`;
}

window.g5AddPunct = (mark) => {
  const input = $("#g5Input");
  if (!input) return;
  if (input.value.length >= input.maxLength) return;
  input.value += mark;
  g5UpdateCount();
};

window.g5Submit = async () => {
  const input = $("#g5Input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const ok = await askConfirm(`確定要交「${text}」？交咗就唔可以再改。`);
  if (!ok) return;

  send({ type: "g5:submit", text });
  input.disabled = true;
};

window.g5EndEarly = async () => {
  const ok = await askConfirm("肯定提前結算？故事會就咁停低，之後就唔可以再繼續。");
  if (!ok) return;
  send({ type: "g5:end" });
};

function renderGame5Gameover(game) {
  const renderKey = "g5-gameover";
  if (S.g5RenderKey === renderKey) return;
  S.g5RenderKey = renderKey;

  const storyHtml = g5StoryHtml(game.story);

  $("#gamePanel").innerHTML = `
    <div class="eyebrow">GAME OVER</div>
    <h2 class="title">故事<br><span>完成喇。</span></h2>

    <div class="question g5-story-box">${storyHtml}</div>

    <button
      class="btn btn-outline wide"
      style="margin-top:12px"
      onclick="g5CopyStory()"
    >
      複製成個故事
    </button>
  `;

  S.g5FullStory = game.fullStory || "";
}

window.g5CopyStory = () => {
  if (!S.g5FullStory) return;
  navigator.clipboard?.writeText(S.g5FullStory).then(
    () => flash("已複製到剪貼簿！"),
    () => flash("複製失敗，麻煩自己手動複製。")
  );
};

function chatMsgHtml(message) {
  return `
    <div class="msg">
      <b>
        ${esc(message.nickname)}
      </b>
      ：
      ${esc(message.text)}
    </div>
  `;
}

function renderChatHtml() {
  return S.chat.map(chatMsgHtml).join("");
}

function scrollChat() {
  const box = $("#chatBox");

  if (box) {
    box.scrollTop =
      box.scrollHeight;
  }
}


function askConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");

    overlay.className = "confirm-overlay";

    overlay.innerHTML = `
      <div class="confirm-card">
        <div class="eyebrow">
          CONFIRM
        </div>

        <h3>
          ${esc(message)}
        </h3>

        <div class="confirm-actions">
          <button
            class="btn btn-green"
            data-confirm="yes"
          >
            是
          </button>

          <button
            class="btn btn-outline"
            data-confirm="no"
          >
            取消
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };

    overlay
      .querySelector('[data-confirm="yes"]')
      .addEventListener(
        "click",
        () => finish(true)
      );

    overlay
      .querySelector('[data-confirm="no"]')
      .addEventListener(
        "click",
        () => finish(false)
      );
  });
}

/* =========================
   Game 6 · Sync 唔 Sync
   （介面跟房間語言：yue = 香港版廣東話，zh = 台灣版書面語）
========================= */

const G6_TEXT = {
  yue: {
    answerTitle: "諗到咩，打咩！",
    answerSub: "同其他人撞啱同一個字就 Sync 咗",
    yourAnswer: "你嘅答案",
    placeholder: "第一個諗到嘅字",
    limit: "中文最多 7 字 · 英文最多 15 個字元",
    lock: "鎖定答案",
    lockNote: "交咗就唔可以改",
    locked: "已鎖定",
    waitOthers: "等緊其他人交答案……",
    answered: "已作答",
    tooLong: "太長喇：中文最多 7 字，英文最多 15 個字元",
    empty: "打個字先",
    mergeTitle: "有冇答案應該算同一個？",
    mergeHint: "揀兩個你覺得意思一樣嘅答案，再撳「提議合併」。完全相同嘅已經自動歸埋一齊。",
    slotEmpty: "揀答案",
    propose: "提議合併",
    pairQ: "呢兩個答案算唔算同一個？",
    pairNote: "過半數話「算」就會合併",
    picked: "已揀",
    mine: "你嘅答案",
    proposeBy: (n) => `${n} 提議合併`,
    agree: "算同一個",
    disagree: "唔算",
    notEligible: "你今次唔使投",
    youVoted: (v) => (v ? "你投咗：算同一個" : "你投咗：唔算"),
    passed: "✓ 已合併",
    failed: "✗ 唔合併",
    skip: "冇嘢要合併",
    skipped: "你揀咗冇嘢要合併",
    skipCount: (a, b) => `${a} / ${b} 人話冇嘢要合併，全部人撳咗就即刻揭曉`,
    reveal: "揭曉",
    fastest: "最快 SYNC",
    noSync: "今 round 冇人 Sync 到",
    others: "其他答案",
    sec: (t) => `${(t / 1000).toFixed(1)} 秒`,
    slower: "慢咗，冇分",
    later: "第三個或之後，冇分",
    merged: "投票合併",
    sync1: "默契 +1",
    noAnswer: (names) => `冇作答：${names}`,
    nextRound: "準備入下一 round",
    lastRound: "準備結算",
    bestPair: "最 Sync 拍檔：",
    noPair: "今局冇人 Sync 過",
    radarTitle: (n) => `${n} 同邊個最 Sync`,
    radarUnit: "同步 round 數",
    pairRank: "最佳拍檔排名",
    pairCount: (c, r) => `${c} / ${r} round 同步`,
    twoPlayer: (p) => `你哋嘅默契度：${p}%`,
    endedEarly: "房主提前結算",
    again: "再玩一局",
    lobby: "返大廳",
    waitHost: "等房主決定再玩一局定散 Band",
    ranking: "總分",
    attemptPill: (a, m) => `第 ${a} / ${m} 次`,
    historyTitle: "之前估過",
    attemptN: (a) => `第 ${a} 次`,
    successTitle: "恭喜！成功 Sync 到",
    successSub: (a) => `第 ${a} 次就估中`,
    voidTitle: "呢 round 作廢",
    voidSub: (m) => `${m} 次都冇人 Sync 到`,
    nextBtn: "下一 round",
    lastBtn: "睇結算",
    nextWait: (a, b) => `${a} / ${b} 人準備好，全部人撳咗就即刻開始`,
    nextDone: "你準備好喇，等緊其他人",
    capHint: "可以 cap 圖留念",
    fastestTitle: "最快一次 Sync",
    fastestSub: (r, a) => `Round ${r} · 第 ${a} 次`,
    pairPick: "揀一對睇默契",
    axes: ["同步率", "一擊即中", "速度", "得分", "效率"],
    pairRadarTitle: (a, b) => `${a} × ${b} 默契雷達`,
    roundsUnit: "round",
    logTitle: "睇返紀錄",
    logHint: "撳每個 round 睇返大家估過咩",
    logRound: (r) => `Round ${r}`,
    logSuccess: (a) => `第 ${a} 次 Sync 到`,
    logVoid: "作廢",
    allSync: "全部人都算 Sync",
    allSyncQ: "全部答案算同一個？",
    allSyncHint: "大家寫得好接近？一鍵提議全部合併",
    roundRecord: "呢輪紀錄"
  },
  zh: {
    answerTitle: "想到什麼，就打什麼！",
    answerSub: "和其他人寫出同一個詞就 Sync 了",
    yourAnswer: "你的答案",
    placeholder: "第一個想到的詞",
    limit: "中文最多 7 字 · 英文最多 15 個字元",
    lock: "鎖定答案",
    lockNote: "送出後就不能修改",
    locked: "已鎖定",
    waitOthers: "等待其他人送出答案……",
    answered: "已作答",
    tooLong: "太長了：中文最多 7 字，英文最多 15 個字元",
    empty: "請先輸入",
    mergeTitle: "有沒有答案應該算同一個？",
    mergeHint: "選兩個你覺得意思相同的答案，再按「提議合併」。完全相同的已自動歸在一起。",
    slotEmpty: "選答案",
    propose: "提議合併",
    pairQ: "這兩個答案算不算同一個？",
    pairNote: "過半數說「算」就會合併",
    picked: "已選",
    mine: "你的答案",
    proposeBy: (n) => `${n} 提議合併`,
    agree: "算同一個",
    disagree: "不算",
    notEligible: "你這次不用投票",
    youVoted: (v) => (v ? "你投了：算同一個" : "你投了：不算"),
    passed: "✓ 已合併",
    failed: "✗ 不合併",
    skip: "沒有要合併",
    skipped: "你選了沒有要合併",
    skipCount: (a, b) => `${a} / ${b} 人表示沒有要合併，全部人按下就立即揭曉`,
    reveal: "揭曉",
    fastest: "最快 SYNC",
    noSync: "這一回合沒有人 Sync",
    others: "其他答案",
    sec: (t) => `${(t / 1000).toFixed(1)} 秒`,
    slower: "比較慢，沒有得分",
    later: "第三位或之後，沒有得分",
    merged: "投票合併",
    sync1: "默契 +1",
    noAnswer: (names) => `沒有作答：${names}`,
    nextRound: "準備進入下一回合",
    lastRound: "準備結算",
    bestPair: "最 Sync 拍檔：",
    noPair: "這局沒有人 Sync 過",
    radarTitle: (n) => `${n} 和誰最 Sync`,
    radarUnit: "同步回合數",
    pairRank: "最佳拍檔排名",
    pairCount: (c, r) => `${c} / ${r} 回合同步`,
    twoPlayer: (p) => `你們的默契度：${p}%`,
    endedEarly: "房主提前結算",
    again: "再玩一局",
    lobby: "返回大廳",
    waitHost: "等待房主決定是否再玩一局",
    ranking: "總分",
    attemptPill: (a, m) => `第 ${a} / ${m} 次`,
    historyTitle: "之前猜過",
    attemptN: (a) => `第 ${a} 次`,
    successTitle: "恭喜！成功 Sync",
    successSub: (a) => `第 ${a} 次就猜中`,
    voidTitle: "這一回合作廢",
    voidSub: (m) => `${m} 次都沒有人 Sync`,
    nextBtn: "下一回合",
    lastBtn: "看結算",
    nextWait: (a, b) => `${a} / ${b} 人準備好，全部人按下就立即開始`,
    nextDone: "你準備好了，等待其他人",
    capHint: "可以截圖留念",
    fastestTitle: "最快一次 Sync",
    fastestSub: (r, a) => `第 ${r} 回合 · 第 ${a} 次`,
    pairPick: "選一對看默契",
    axes: ["同步率", "一擊即中", "速度", "得分", "效率"],
    pairRadarTitle: (a, b) => `${a} × ${b} 默契雷達`,
    roundsUnit: "回合",
    logTitle: "查看紀錄",
    logHint: "點選每個回合查看大家猜過什麼",
    logRound: (r) => `第 ${r} 回合`,
    logSuccess: (a) => `第 ${a} 次 Sync`,
    logVoid: "作廢",
    allSync: "所有人都算 Sync",
    allSyncQ: "所有答案算同一個？",
    allSyncHint: "大家寫得很接近？一鍵提議全部合併",
    roundRecord: "本回合紀錄"
  }
};

function g6T() {
  return G6_TEXT[S.room?.language === "zh" ? "zh" : "yue"];
}

// 中文字算 15 個單位、英文字元算 7 個，上限 105（即中文 7 字、英文 15 字元；同伺服器一樣計法）。
function g6Units(text) {
  let units = 0;
  for (const ch of String(text || "").replace(/\s+/g, "")) {
    units += /[\u0000-ɏ]/.test(ch) ? 7 : 15;
  }
  return units;
}

function g6CountLabel(text) {
  const clean = String(text || "").replace(/\s+/g, "");
  const units = g6Units(clean);
  const hasCjk = [...clean].some((ch) => !/[\u0000-ɏ]/.test(ch));
  return hasCjk ? `${Math.ceil(units / 15)} / 7` : `${clean.length} / 15`;
}

function g6Head(game, extraPill = "") {
  const t = g6T();
  return `
    <div class="g6-head">
      <div>
        <div class="eyebrow">ROUND ${game.round} / ${game.totalRounds}</div>
        ${extraPill || `<span class="g6-pill-dark">${esc(t.attemptPill(game.attempt || 1, game.maxAttempts || 5))}</span>`}
      </div>
      ${game.endsAt ? `<div id="time" class="timer"></div>` : ""}
    </div>
  `;
}

// 之前幾次估咗咩：新嘅放上面。
function g6HistoryHtml(game, opts = {}) {
  const t = g6T();
  const history = game.history || [];
  if (!history.length) return "";
  const rows = opts.chronological ? history : [...history].reverse();
  return `
    <div class="g6-history ${opts.cls || ""}">
      <div class="eyebrow">${esc(opts.title || t.historyTitle)}</div>
      ${rows.map((h) => `
        <div class="g6-hist-row">
          <span class="g6-hist-n">${esc(t.attemptN(h.attempt))}</span>
          <span class="g6-chips">
            ${h.entries.map((e) => `<span class="g6-chip ${e.id === S.playerId ? "mine" : ""}">${esc(e.nickname)} · ${esc(e.text)}</span>`).join("")}
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderGame6(game) {
  if (game.phase === "answering") return renderGame6Answering(game);
  if (game.phase === "merging") return renderGame6Merging(game);
  if (game.phase === "reveal") return renderGame6Reveal(game);
  if (game.phase === "gameover") return renderGame6Gameover(game);
}

function renderGame6Answering(game) {
  const t = g6T();
  const key = `g6-answer-${game.round}-${game.attempt}-${game.mySubmitted ? "done" : "open"}`;

  // 其他人交答案會觸發 state 廣播：只更新人數，唔好重畫，免得洗走你打緊嘅字。
  if (S.g6Key === key) {
    const count = $("#g6Count");
    if (count) count.textContent = `${game.submittedCount} / ${game.totalCount}`;
    return;
  }
  S.g6Key = key;
  S.g6Pick = [];

  $("#gamePanel").innerHTML = `
    ${g6Head(game)}
    <h2 class="g6-big">${esc(t.answerTitle)}</h2>
    <p class="g6-sub">${esc(t.answerSub)}</p>

    ${
      game.mySubmitted
        ? `
          <div class="g6-locked">
            <span class="g6-locked-label">${esc(t.locked)}</span>
            <strong>${esc(game.myAnswer || "")}</strong>
          </div>
          <p class="g6-sub">${esc(t.waitOthers)}</p>
        `
        : `
          <label class="g6-field">
            <span>${esc(t.yourAnswer)}</span>
            <span class="g6-input-row">
              <input id="g6Input" type="text" maxlength="15" autocomplete="off" placeholder="${esc(t.placeholder)}">
              <button id="g6Submit" type="button" class="btn btn-dark g6-lock-btn" disabled>${esc(t.lock)}</button>
            </span>
            <span class="g6-hint">
              <span id="g6Limit">${esc(t.limit)} · ${esc(t.lockNote)}</span>
              <span id="g6Units">0 / 7</span>
            </span>
          </label>
        `
    }

    <div class="g6-status">
      <span>${esc(t.answered)}</span>
      <strong id="g6Count">${game.submittedCount} / ${game.totalCount}</strong>
    </div>
    ${g6HistoryHtml(game)}
  `;

  const input = $("#g6Input");
  const button = $("#g6Submit");
  if (input && button) {
    const update = () => {
      const clean = input.value.replace(/\s+/g, "");
      const units = g6Units(clean);
      const tooLong = units > 105;
      $("#g6Units").textContent = g6CountLabel(input.value);
      $("#g6Limit").textContent = tooLong ? t.tooLong : `${t.limit} · ${t.lockNote}`;
      $("#g6Limit").classList.toggle("g6-warn", tooLong);
      button.disabled = !clean || tooLong;
    };
    const submit = () => {
      const value = input.value.trim();
      if (!value) return flash(t.empty);
      if (g6Units(value) > 105) return flash(t.tooLong);
      button.disabled = true;
      send({ type: "g6:submit", text: value });
    };
    input.addEventListener("input", update);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) submit();
    });
    button.addEventListener("click", submit);
    input.focus();
  }

  if (game.endsAt) startTimer($("#time"), game.endsAt);
}

function g6Words(words) {
  return (words || []).map(esc).join(" / ");
}

function renderGame6Merging(game) {
  const t = g6T();
  S.g6Key = `g6-merge-${game.round}`;
  if (S.g6PickRound !== `${game.round}-${game.attempt}`) {
    S.g6Pick = [];
    S.g6PickRound = `${game.round}-${game.attempt}`;
  }
  const groupIds = new Set((game.groups || []).map((g) => g.id));
  S.g6Pick = (S.g6Pick || []).filter((id) => groupIds.has(id));

  if (game.autoPair) return renderGame6Pair(game);

  const groupsHtml = (game.groups || []).map((g) => {
    const picked = S.g6Pick.includes(g.id);
    return `
      <button type="button" class="g6-group ${picked ? "picked" : ""}" onclick="g6PickGroup('${g.id}')">
        <strong>${g6Words(g.words)}</strong>
        <span>${g.count} 人${picked ? ` · ${esc(t.picked)}` : ""}${g.id === game.myGroupId ? ` · ${esc(t.mine)}` : ""}</span>
      </button>
    `;
  }).join("");

  const proposalsHtml = (game.proposals || []).map((pr) => {
    let action = "";
    if (pr.status === "passed") action = `<p class="g6-pr-result">${esc(t.passed)}</p>`;
    else if (pr.status === "failed") action = `<p class="g6-pr-result">${esc(t.failed)}</p>`;
    else if (!pr.myEligible) action = `<p class="g6-pr-note">${esc(t.notEligible)}</p>`;
    else if (pr.myVote !== null && pr.myVote !== undefined) action = `<p class="g6-pr-note">${esc(t.youVoted(pr.myVote))}</p>`;
    else action = `
      <div class="g6-pr-actions">
        <button type="button" class="btn btn-yellow" onclick="g6VoteMerge('${pr.id}', true)">${esc(t.agree)}</button>
        <button type="button" class="btn g6-ghost" onclick="g6VoteMerge('${pr.id}', false)">${esc(t.disagree)}</button>
      </div>
    `;
    return `
      <div class="g6-proposal ${pr.status}">
        <div class="eyebrow">${esc(t.proposeBy(pr.byNickname))}</div>
        <div class="g6-pr-words">
          ${
            pr.kind === "all"
              ? `${pr.wordsA.map((w) => `<span>${esc(w)}</span>`).join("<b>=</b>")}<b>？</b>`
              : `<span>${g6Words(pr.wordsA)}</span><b>=</b><span>${g6Words(pr.wordsB)}</span><b>？</b>`
          }
        </div>
        ${action}
        <div class="g6-pr-count">已投 ${pr.yes + pr.no} / ${pr.eligibleCount}</div>
      </div>
    `;
  }).join("");

  $("#gamePanel").innerHTML = `
    ${g6Head(game)}
    <h2 class="g6-mid">${esc(t.mergeTitle)}</h2>
    <div class="g6-groups">${groupsHtml}</div>
    <p class="g6-sub">${esc(t.mergeHint)}</p>
    <div class="g6-pickbar">
      ${[0, 1].map((i) => {
        const g = (game.groups || []).find((x) => x.id === S.g6Pick[i]);
        return g
          ? `<button type="button" class="g6-slot filled" onclick="g6PickGroup('${g.id}')">${g6Words(g.words)}</button>`
          : `<span class="g6-slot">${esc(t.slotEmpty)}</span>`;
      }).join('<b class="g6-eq">=</b>')}
      <button type="button" class="btn btn-dark g6-propose" onclick="g6ProposePick()" ${S.g6Pick.length === 2 ? "" : "disabled"}>${esc(t.propose)}</button>
    </div>
    ${
      (game.groups || []).length >= 3 && !(game.proposals || []).some((p) => p.kind === "all" && p.status === "open")
        ? `<div class="g6-allsync">
            <small>${esc(t.allSyncHint)}</small>
            <button type="button" class="btn btn-yellow" onclick="g6ProposeAll()">${esc(t.allSync)}</button>
          </div>`
        : ""
    }
    ${proposalsHtml}
    <div class="g6-status">
      ${
        game.mySkip
          ? `<span>${esc(t.skipped)}</span>`
          : `<button type="button" class="btn g6-ghost" onclick="g6Skip()">${esc(t.skip)}</button>`
      }
      <small>${esc(t.skipCount(game.skipCount, game.totalCount))}</small>
    </div>
    ${g6HistoryHtml(game)}
  `;

  if (game.endsAt) startTimer($("#time"), game.endsAt);
}

window.g6PickGroup = (id) => {
  const game = S.room?.gameState;
  if (!game || game.phase !== "merging") return;
  if (S.g6Pick.includes(id)) {
    S.g6Pick = S.g6Pick.filter((x) => x !== id);
  } else {
    // 最多揀兩個；揀第三個就換走最早揀嗰個。
    S.g6Pick = [...S.g6Pick, id].slice(-2);
  }
  renderGame6Merging(game);
};

window.g6ProposeAll = () => {
  send({ type: "g6:propose-all" });
};

window.g6ProposePick = () => {
  const game = S.room?.gameState;
  if (!game || game.phase !== "merging" || S.g6Pick.length !== 2) return;
  const [a, b] = S.g6Pick;
  S.g6Pick = [];
  send({ type: "g6:propose", a, b });
};

// 得兩個答案（例如二人局）：直接問「呢兩個算唔算同一個？」
function renderGame6Pair(game) {
  const t = g6T();
  const pr = (game.proposals || [])[0];
  if (!pr) return;
  let action = "";
  if (pr.status === "passed") action = `<p class="g6-pr-result">${esc(t.passed)}</p>`;
  else if (pr.status === "failed") action = `<p class="g6-pr-result">${esc(t.failed)}</p>`;
  else if (!pr.myEligible) action = "";
  else if (pr.myVote !== null && pr.myVote !== undefined) action = `<p class="g6-pr-note">${esc(t.youVoted(pr.myVote))}</p>`;
  else action = `
    <div class="g6-pr-actions">
      <button type="button" class="btn btn-yellow" onclick="g6VoteMerge('${pr.id}', true)">${esc(t.agree)}</button>
      <button type="button" class="btn g6-ghost" onclick="g6VoteMerge('${pr.id}', false)">${esc(t.disagree)}</button>
    </div>
  `;
  $("#gamePanel").innerHTML = `
    ${g6Head(game)}
    <h2 class="g6-mid">${esc(t.pairQ)}</h2>
    <div class="g6-proposal g6-pair">
      <div class="g6-pr-words g6-pair-words">
        <span>${g6Words(pr.wordsA)}</span><b>=</b><span>${g6Words(pr.wordsB)}</span><b>？</b>
      </div>
      ${action}
      <div class="g6-pr-count">已投 ${pr.yes + pr.no} / ${pr.eligibleCount} · ${esc(t.pairNote)}</div>
    </div>
    ${g6HistoryHtml(game)}
  `;
  if (game.endsAt) startTimer($("#time"), game.endsAt);
}

window.g6VoteMerge = (proposalId, agree) => {
  send({ type: "g6:vote", proposalId, agree });
};

window.g6Skip = () => {
  send({ type: "g6:skip" });
};

window.g6EndEarly = async () => {
  const ok = await askConfirm("肯定提前結算？之後就唔可以再繼續呢局。");
  if (!ok) return;
  send({ type: "g6:end" });
};

window.g6Restart = () => {
  send({ type: "g6:restart" });
};

function g6NextHtml(game) {
  const t = g6T();
  const last = game.round >= game.totalRounds;
  return `
    <div class="g6-status">
      ${
        game.myNext
          ? `<span>${esc(t.nextDone)}</span>`
          : `<button type="button" class="btn btn-dark" onclick="g6Next()">${esc(last ? t.lastBtn : t.nextBtn)}</button>`
      }
      <small>${esc(t.nextWait(game.nextCount || 0, game.totalCount || 0))}</small>
    </div>
  `;
}

window.g6Next = () => {
  send({ type: "g6:next" });
};

function renderGame6Reveal(game) {
  const t = g6T();
  const result = game.result || { groups: [] };

  if (!result.success) {
    $("#gamePanel").innerHTML = `
      ${g6Head(game, `<span class="g6-pill-dark">${esc(t.voidTitle)}</span>`)}
      <div class="g6-win g6-void">
        <div class="g6-win-word g6-none">${esc(t.voidTitle)}</div>
        <p class="g6-sub" style="text-align:center">${esc(t.voidSub(game.maxAttempts || 5))}</p>
        ${g6HistoryHtml(game, { chronological: true, title: t.roundRecord, cls: "g6-record" })}
      </div>
      ${g6NextHtml(game)}
    `;
    if (game.endsAt) startTimer($("#time"), game.endsAt);
    return;
  }

  const winner = result.groups.find((g) => g.id === result.winnerGroupId) || null;
  const winnerIds = new Set(result.winnerIds || []);
  const memberChip = (m) => `
    <span class="g6-chip ${m.merged ? "merged" : ""}">
      ${esc(m.nickname)} · ${esc(m.text)} · ${esc(t.sec(m.t))}${m.merged ? ` · ${esc(t.merged)}` : ""}
    </span>
  `;

  const othersHtml = result.groups
    .filter((g) => !winner || g.id !== winner.id)
    .map((g) => `
      <div class="g6-other">
        <div class="g6-other-head">
          <strong>${g6Words(g.words)}</strong>
          ${g.syncAt !== null ? `<small>${esc(t.sec(g.syncAt))} Sync · ${esc(t.slower)}</small>` : ""}
        </div>
        <div class="g6-chips">${g.members.map(memberChip).join("")}</div>
        ${g.syncAt !== null ? `<small class="g6-other-note">${esc(t.sync1)}</small>` : ""}
      </div>
    `).join("");

  $("#gamePanel").innerHTML = `
    ${g6Head(game, `<span class="g6-pill-dark">${esc(t.successSub(result.attempt))}</span>`)}
    <div class="g6-win g6-success">
      <div class="g6-congrats">${esc(t.successTitle)}</div>
      <div class="g6-win-word">${g6Words(winner.words)}</div>
      <div class="g6-win-pair">
        ${winner.members.filter((m) => winnerIds.has(m.id)).map((m) => `
          <div class="g6-win-player">
            <b>${esc(m.nickname)}</b>
            <small>${esc(m.text)} · ${esc(t.sec(m.t))}</small>
            <strong>+${result.points}</strong>
          </div>
        `).join("")}
      </div>
      ${winner.members.filter((m) => !winnerIds.has(m.id)).map((m) => `
        <div class="g6-win-extra">
          <span>${esc(m.nickname)}「${esc(m.text)}」· ${esc(t.sec(m.t))}${m.merged ? ` · ${esc(t.merged)}` : ""} · ${esc(t.later)}</span>
          <span>${esc(t.sync1)}</span>
        </div>
      `).join("")}
      <small class="g6-cap">${esc(t.capHint)} · ${esc(t.sec(winner.syncAt))} Sync</small>
      ${g6HistoryHtml(game, { chronological: true, title: t.roundRecord, cls: "g6-record" })}
    </div>
    ${g6NextHtml(game)}
    ${othersHtml ? `<div class="eyebrow g6-section-label">${esc(t.others)}</div>${othersHtml}` : ""}
    ${result.noAnswer?.length ? `<p class="g6-sub">${esc(t.noAnswer(result.noAnswer.join("、")))}</p>` : ""}
  `;

  if (game.endsAt) startTimer($("#time"), game.endsAt);
}

function g6PairMap(pairs) {
  const map = {};
  for (const p of pairs || []) {
    map[`${p.a}|${p.b}`] = p.count;
    map[`${p.b}|${p.a}`] = p.count;
  }
  return map;
}

// 通用雷達圖：axes = [{label, sub, value(0–1)}]
function g6RadarSvg(axes, ariaLabel) {
  const k = axes.length;
  const cx = 165, cy = 135, R = 92;
  const pt = (i, f) => {
    const a = (-90 + (360 / k) * i) * Math.PI / 180;
    return [cx + R * f * Math.cos(a), cy + R * f * Math.sin(a)];
  };
  const ring = (f) => axes.map((_, i) => pt(i, f).map((v) => v.toFixed(1)).join(",")).join(" ");
  const spokes = axes.map((_, i) => {
    const [x, y] = pt(i, 1);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
  }).join("");
  const poly = axes.map((ax, i) => pt(i, Math.max(0, Math.min(1, ax.value))).map((v) => v.toFixed(1)).join(",")).join(" ");
  const labels = axes.map((ax, i) => {
    const a = (-90 + (360 / k) * i) * Math.PI / 180;
    const x = cx + (R + 24) * Math.cos(a);
    const y = cy + (R + 20) * Math.sin(a);
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
    return `
      <text x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="${anchor}" class="g6-rl-name">${esc(ax.label)}</text>
      <text x="${x.toFixed(1)}" y="${(y + 13).toFixed(1)}" text-anchor="${anchor}" class="g6-rl-val">${esc(ax.sub)}</text>
    `;
  }).join("");
  return `
    <svg class="g6-radar" viewBox="0 0 330 270" role="img" aria-label="${esc(ariaLabel)}">
      <g class="g6-grid">
        <polygon points="${ring(1)}" class="outer"></polygon>
        <polygon points="${ring(0.75)}"></polygon>
        <polygon points="${ring(0.5)}"></polygon>
        <polygon points="${ring(0.25)}"></polygon>
        ${spokes}
      </g>
      <polygon points="${poly}" class="g6-poly"></polygon>
      ${labels}
    </svg>
  `;
}

// 二／三人局：用 5 項默契指標畫一對玩家嘅雷達圖。
function g6PairAxes(pair, rounds, maxAttempts) {
  const t = g6T();
  const r = Math.max(1, rounds);
  const pct = (v) => `${Math.round(v * 100)}%`;
  const eff = pair.count ? (maxAttempts + 1 - pair.attemptsAvg) / maxAttempts : 0;
  const vals = [
    pair.count / r,
    pair.first / r,
    pair.speedAvg,
    pair.scored / r,
    eff
  ];
  const subs = [
    `${pair.count} / ${rounds}`,
    `${pair.first} / ${rounds}`,
    pct(pair.speedAvg),
    `${pair.scored} / ${rounds}`,
    pair.count ? `${pair.attemptsAvg.toFixed(1)} 次` : "—"
  ];
  return t.axes.map((label, i) => ({ label, sub: subs[i], value: vals[i] }));
}

function renderGame6Gameover(game) {
  const t = g6T();
  S.g6Key = "g6-over";
  const players = S.room.players || [];
  const ranking = game.ranking || [];
  const pairs = game.pairs || [];
  const rounds = Math.max(1, game.playedRounds || 0);
  const counts = g6PairMap(pairs);
  const top = pairs[0] && pairs[0].count > 0 ? pairs[0] : null;
  const isHost = S.room.hostId === S.playerId;
  const maxAttempts = game.maxAttempts || 5;

  let chartHtml = "";
  if (players.length >= 4) {
    if (!S.g6RadarSel || !players.some((p) => p.id === S.g6RadarSel)) {
      S.g6RadarSel = players.some((p) => p.id === S.playerId) ? S.playerId : players[0]?.id;
    }
    const sel = players.find((p) => p.id === S.g6RadarSel) || players[0];
    const axes = players.filter((p) => p.id !== sel.id).map((p) => {
      const c = counts[`${sel.id}|${p.id}`] || 0;
      return { label: p.nickname, sub: `${c} / ${rounds}`, value: c / rounds };
    });
    chartHtml = `
      <div class="g6-chart">
        <div class="g6-chart-head">
          <strong>${esc(t.radarTitle(sel.nickname))}</strong>
          <small>${esc(t.radarUnit)} / ${rounds}</small>
        </div>
        <div class="g6-radar-chips">
          ${players.map((p) => `
            <button type="button" class="g6-rchip ${p.id === sel.id ? "active" : ""}" onclick="g6RadarPick('${p.id}')">${esc(p.nickname)}</button>
          `).join("")}
        </div>
        ${g6RadarSvg(axes, `${sel.nickname} 同其他玩家嘅同步雷達圖`)}
      </div>
    `;
  } else if (pairs.length) {
    const keyOf = (p) => `${p.a}|${p.b}`;
    if (!S.g6PairSel || !pairs.some((p) => keyOf(p) === S.g6PairSel)) S.g6PairSel = keyOf(pairs[0]);
    const pair = pairs.find((p) => keyOf(p) === S.g6PairSel) || pairs[0];
    chartHtml = `
      <div class="g6-chart">
        <div class="g6-chart-head">
          <strong>${esc(t.pairRadarTitle(pair.aNickname, pair.bNickname))}</strong>
          ${players.length === 2 ? `<small>${esc(t.twoPlayer(Math.round((pair.count / rounds) * 100)))}</small>` : `<small>${esc(t.pairPick)}</small>`}
        </div>
        ${
          pairs.length > 1
            ? `<div class="g6-radar-chips">
                ${pairs.map((p) => `
                  <button type="button" class="g6-rchip ${keyOf(p) === keyOf(pair) ? "active" : ""}" onclick="g6PairPick('${keyOf(p)}')">${esc(p.aNickname)} × ${esc(p.bNickname)}</button>
                `).join("")}
              </div>`
            : ""
        }
        ${g6RadarSvg(g6PairAxes(pair, game.playedRounds || 0, maxAttempts), `${pair.aNickname} 同 ${pair.bNickname} 嘅默契雷達圖`)}
      </div>
    `;
  }

  const fastest = game.fastest;
  const fastestHtml = fastest
    ? `
      <div class="g6-fastest">
        <div class="eyebrow">${esc(t.fastestTitle)}</div>
        <div class="g6-fastest-main">
          <strong>${g6Words(fastest.words)}</strong>
          <span class="g6-pill-dark">${esc(t.sec(fastest.t))}</span>
        </div>
        <small>${esc(fastest.aNickname)} × ${esc(fastest.bNickname)} · ${esc(t.fastestSub(fastest.round, fastest.attempt))}</small>
      </div>
    `
    : "";

  const log = game.log || [];
  const logHtml = log.length
    ? `
      <details class="g6-log">
        <summary class="g6-chart-head g6-log-head">
          <strong>${esc(t.logTitle)}</strong>
          <small>${esc(t.logHint)}</small>
        </summary>
        ${log.map((r) => `
          <details class="g6-log-round">
            <summary>
              <span class="g6-log-r">${esc(t.logRound(r.round))}</span>
              ${
                r.success
                  ? `<span class="g6-log-word">${g6Words(r.words)}</span>
                     <span class="g6-log-meta">${esc(r.winners.join(" × "))} · ${esc(t.logSuccess(r.attempt))} · ${esc(t.sec(r.syncAt))} · +${r.points}</span>`
                  : `<span class="g6-log-meta">${esc(t.logVoid)}</span>`
              }
            </summary>
            ${(r.history || []).map((h) => `
              <div class="g6-hist-row">
                <span class="g6-hist-n">${esc(t.attemptN(h.attempt))}</span>
                <span class="g6-chips">
                  ${h.entries.map((e) => `<span class="g6-chip ${e.id === S.playerId ? "mine" : ""}">${esc(e.nickname)} · ${esc(e.text)}</span>`).join("")}
                </span>
              </div>
            `).join("")}
          </details>
        `).join("")}
      </details>
    `
    : "";

  $("#gamePanel").innerHTML = `
    <div class="eyebrow">GAME OVER · ${game.playedRounds || 0} ROUNDS${game.endedEarly ? ` · ${esc(t.endedEarly)}` : ""}</div>
    <h2 class="g6-mid">
      ${top ? `${esc(t.bestPair)}<span>${esc(top.aNickname)} × ${esc(top.bNickname)}</span>` : esc(t.noPair)}
    </h2>

    <div class="g6-rank">
      ${ranking.map((r, i) => `
        <div class="g6-rank-row ${i === 0 ? "first" : ""} ${r.id === S.playerId ? "me" : ""}">
          <span>${i + 1} · ${esc(r.nickname)}</span><b>${r.score}</b>
        </div>
      `).join("")}
    </div>

    ${fastestHtml}

    ${chartHtml}

    ${
      pairs.length > 1
        ? `
          <div class="eyebrow g6-section-label">${esc(t.pairRank)}</div>
          <div class="g6-pairs">
            ${pairs.slice(0, 3).map((p, i) => `
              <div class="g6-pair-row ${i === 0 && p.count > 0 ? "first" : ""}">
                <span>${esc(p.aNickname)} × ${esc(p.bNickname)}</span>
                <b>${esc(t.pairCount(p.count, rounds))}</b>
              </div>
            `).join("")}
          </div>
        `
        : ""
    }

    ${logHtml}

    <div class="g6-end-actions">
      ${isHost ? `<button type="button" class="btn btn-yellow" onclick="g6Restart()">${esc(t.again)}</button>` : `<p class="g6-sub">${esc(t.waitHost)}</p>`}
      <button type="button" class="btn btn-outline" onclick="leaveRoom()">${esc(t.lobby)}</button>
    </div>
  `;
  clearInterval(S.timer);
}

window.g6RadarPick = (id) => {
  S.g6RadarSel = id;
  if (S.room?.gameState?.phase === "gameover") renderGame6Gameover(S.room.gameState);
};

window.g6PairPick = (key) => {
  S.g6PairSel = key;
  if (S.room?.gameState?.phase === "gameover") renderGame6Gameover(S.room.gameState);
};

window.restart2 = () => {
  send({ type: "g2:restart" });
};

/* =========================
   Game 7 · 數字炸彈
========================= */

const G7_TEXT = {
  yue: {
    roundLabel: (r, t) => `ROUND ${r} / ${t}`,
    bombInfo: (n, alive) => `第 ${n} 個炸彈 · 剩 ${alive} 人`,
    yourTurn: "輪到你！",
    turnOf: (n) => `輪到 ${n}`,
    thinking: (n) => `${n} 諗緊…`,
    rangeLabel: "炸彈喺呢個範圍入面",
    onlyBomb: "淨係剩返炸彈一個數字！",
    guess: "估！",
    inputLabel: "你估嘅數字",
    low: "太細",
    high: "太大",
    boom: "爆咗",
    auto: "（超時）",
    guessed: (n, v) => `${n} 估 ${v}`,
    used: (n, c) => `${n} 用咗「${c}」`,
    assigned: (n, t) => `${n} 用「指定」掟俾 ${t}`,
    offlineOut: (n) => `${n} 斷線出局`,
    skillTag: "技能",
    outTag: "出局",
    turnTag: "估緊",
    you: "你",
    cards: { skip: "跳過", reverse: "反轉", assign: "指定" },
    cardDesc: {
      skip: "唔使估，交俾下一位",
      reverse: "方向倒轉，交返俾上一位",
      assign: "揀一個人代你估"
    },
    yourCard: "你嘅技能卡",
    use: "使用",
    cardUsed: "呢個回合張卡已經用咗",
    cardWait: "輪到你先用得",
    viaAssign: (by) => `${by} 指定咗你！`,
    viaSkip: (by) => `${by} 跳過咗，輪到你`,
    viaReverse: (by) => `${by} 反轉咗方向，輪到你`,
    assignEyebrow: "使用技能卡 · 指定",
    assignTitle: "掟俾邊個？",
    nowRange: "而家範圍",
    assignHint: "被指定嘅人如果有卡，可以即刻再掟出去",
    cancel: "取消",
    assignTo: (n) => `指定${n}`,
    pickFirst: "揀一個人先",
    spectateEyebrow: "你已出局 · 觀戰中",
    onlyOut: "只有出局嘅人睇到",
    bombIs: "今次個炸彈係",
    markerNote: "紅線係炸彈位置",
    revive: "下個回合開始時你會復活",
    boomTitle: (n) => `${n} 爆咗！`,
    bombWas: "炸彈係",
    viaAssignBoom: (by, n) => `${by} 用「指定」掟咗俾 ${n}`,
    autoBoom: "超時，系統幫佢估中咗",
    left: (n) => `仲剩 ${n} 人`,
    newBomb: "新炸彈 1–100",
    startBy: (n) => `由 ${n} 開始`,
    roundWin: (n) => `${n} 贏咗呢個回合！`,
    nextRound: (r) => `第 ${r} 回合準備開始`,
    lastRound: "最後一個回合完結",
    roundsDone: (n) => `${n} 個回合完結`,
    endedEarly: "提前結算",
    tieTitle: "並列贏家！",
    winTitle: "贏家！",
    noWinner: "未有人贏到回合",
    survived: (n) => `生存到最後 ${n} 次`,
    perRound: "每回合贏家",
    ranking: "排名",
    again: "再玩一場",
    waitHost: "等房主決定再玩一場",
    lobby: "返大廳",
    confirmEnd: "肯定提前結算？之後就唔可以再繼續呢局。"
  },
  zh: {
    roundLabel: (r, t) => `ROUND ${r} / ${t}`,
    bombInfo: (n, alive) => `第 ${n} 顆炸彈 · 剩 ${alive} 人`,
    yourTurn: "輪到你了！",
    turnOf: (n) => `輪到 ${n}`,
    thinking: (n) => `${n} 思考中…`,
    rangeLabel: "炸彈就在這個範圍裡",
    onlyBomb: "只剩下炸彈一個數字了！",
    guess: "猜！",
    inputLabel: "你猜的數字",
    low: "太小",
    high: "太大",
    boom: "爆炸",
    auto: "（逾時）",
    guessed: (n, v) => `${n} 猜 ${v}`,
    used: (n, c) => `${n} 使用了「${c}」`,
    assigned: (n, t) => `${n} 用「指定」丟給 ${t}`,
    offlineOut: (n) => `${n} 斷線出局`,
    skillTag: "技能",
    outTag: "出局",
    turnTag: "猜數中",
    you: "你",
    cards: { skip: "跳過", reverse: "反轉", assign: "指定" },
    cardDesc: {
      skip: "不用猜，直接交給下一位",
      reverse: "方向反轉，交回給上一位",
      assign: "選一個人替你猜"
    },
    yourCard: "你的技能卡",
    use: "使用",
    cardUsed: "本回合的卡已經用掉",
    cardWait: "輪到你才能使用",
    viaAssign: (by) => `${by} 指定了你！`,
    viaSkip: (by) => `${by} 跳過了，輪到你`,
    viaReverse: (by) => `${by} 反轉了方向，輪到你`,
    assignEyebrow: "使用技能卡 · 指定",
    assignTitle: "丟給誰？",
    nowRange: "目前範圍",
    assignHint: "被指定的人如果有卡，可以馬上再丟出去",
    cancel: "取消",
    assignTo: (n) => `指定${n}`,
    pickFirst: "請先選一個人",
    spectateEyebrow: "你已出局 · 觀戰中",
    onlyOut: "只有出局的人看得到",
    bombIs: "這次的炸彈是",
    markerNote: "紅線是炸彈的位置",
    revive: "下個回合開始時你會復活",
    boomTitle: (n) => `${n} 爆炸了！`,
    bombWas: "炸彈是",
    viaAssignBoom: (by, n) => `${by} 用「指定」丟給了 ${n}`,
    autoBoom: "逾時，系統替他猜中了",
    left: (n) => `還剩 ${n} 人`,
    newBomb: "新炸彈 1–100",
    startBy: (n) => `由 ${n} 開始`,
    roundWin: (n) => `${n} 贏得這個回合！`,
    nextRound: (r) => `第 ${r} 回合準備開始`,
    lastRound: "最後一個回合結束",
    roundsDone: (n) => `${n} 個回合結束`,
    endedEarly: "提前結算",
    tieTitle: "並列贏家！",
    winTitle: "贏家！",
    noWinner: "還沒有人贏得回合",
    survived: (n) => `撐到最後 ${n} 次`,
    perRound: "每回合贏家",
    ranking: "排名",
    again: "再玩一場",
    waitHost: "等房主決定要不要再玩一場",
    lobby: "回大廳",
    confirmEnd: "確定提前結算？之後就不能再繼續這一局。"
  }
};

function g7T() {
  return G7_TEXT[S.room?.language === "zh" ? "zh" : "yue"];
}

function g7Nick(id) {
  if (id && id === S.playerId) return g7T().you;
  return S.room?.players?.find((p) => p.id === id)?.nickname || "玩家";
}

const G7_CARD_ICONS = {
  skip: '<path d="M5 6l6 6-6 6M13 6l6 6-6 6"></path>',
  reverse: '<path d="M4 9h13l-3-3M20 15H7l3 3"></path>',
  assign: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>'
};

function g7CardIcon(card, size = 24) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${G7_CARD_ICONS[card] || ""}</svg>`;
}

function g7Head(game, eyebrow) {
  return `
    <div class="g7-head">
      <div>
        <div class="eyebrow">${esc(g7T().roundLabel(game.round, game.totalRounds))}</div>
        <span class="g7-pill">${esc(eyebrow)}</span>
      </div>
      ${game.phase === "turn" && game.endsAt ? `<div id="time" class="timer"></div>` : ""}
    </div>
  `;
}

function g7RangeHtml(game, opts = {}) {
  const t = g7T();
  const low = game.low;
  const high = game.high;
  const left = ((low - 1) / 100) * 100;
  const width = ((high - low + 1) / 100) * 100;
  const marker = opts.bomb !== null && opts.bomb !== undefined
    ? `<div class="g7-marker" style="left:${((opts.bomb - 0.5) / 100) * 100}%"></div>`
    : "";
  return `
    <div class="g7-range ${low === high ? "g7-range-last" : ""}">
      ${opts.hideLabel ? "" : `<div class="g7-range-label">${esc(low === high ? t.onlyBomb : t.rangeLabel)}</div>`}
      <div class="g7-range-nums">
        ${low === high
          ? `<span>${low}</span>`
          : `<span>${low}</span><b>—</b><span>${high}</span>`}
      </div>
      <div class="g7-bar" role="img" aria-label="${low}–${high}">
        <div class="g7-bar-fill" style="left:${left}%;width:${width}%"></div>
        ${marker}
      </div>
      <div class="g7-bar-ends"><span>1</span><span>100</span></div>
      ${opts.note ? `<p class="g7-range-note">${esc(opts.note)}</p>` : ""}
    </div>
  `;
}

function g7HistoryHtml(game, limit = 3) {
  const t = g7T();
  const rows = [...(game.history || [])].reverse().slice(0, limit);
  if (!rows.length) return "";
  return `
    <div class="g7-hist">
      ${rows.map((h) => {
        if (h.kind === "card") {
          const label = h.card === "assign"
            ? t.assigned(g7Nick(h.id), g7Nick(h.targetId))
            : t.used(g7Nick(h.id), t.cards[h.card] || h.card);
          return `<div class="g7-hist-row"><span>${esc(label)}</span><span class="g7-tag">${esc(t.skillTag)}</span></div>`;
        }
        if (h.kind === "out") {
          return `<div class="g7-hist-row"><span>${esc(t.offlineOut(g7Nick(h.id)))}</span><span class="g7-tag">${esc(t.outTag)}</span></div>`;
        }
        const res = h.result === "low" ? t.low : h.result === "high" ? t.high : t.boom;
        return `<div class="g7-hist-row ${h.id === S.playerId ? "mine" : ""}"><span>${esc(t.guessed(g7Nick(h.id), h.value))}${h.auto ? esc(t.auto) : ""}</span><span class="g7-tag">${esc(res)}</span></div>`;
      }).join("")}
    </div>
  `;
}

function g7CardHtml(game, isMyTurn) {
  const t = g7T();
  const card = game.myCard;
  if (!card) {
    return `<div class="g7-card g7-card-empty"><span>${esc(t.cardUsed)}</span></div>`;
  }
  return `
    <div class="g7-card">
      <div class="g7-card-face">${g7CardIcon(card)}</div>
      <div class="g7-card-text">
        <div class="g7-card-eyebrow">${esc(t.yourCard)}</div>
        <strong>${esc(t.cards[card])}</strong>
        <p>${esc(t.cardDesc[card])}</p>
      </div>
      ${isMyTurn
        ? `<button type="button" class="g7-card-btn" onclick="g7UseCard()">${esc(t.use)}</button>`
        : `<span class="g7-card-wait">${esc(t.cardWait)}</span>`}
    </div>
  `;
}

function renderGame7(game) {
  const me = S.playerId;
  const alive = game.alive || [];
  const isAlive = alive.includes(me);
  const isMyTurn = game.phase === "turn" && game.currentId === me;

  if (!isMyTurn || game.myCard !== "assign") S.g7Picking = false;

  const key = JSON.stringify([
    game.phase, game.round, game.bombIndex, game.turnSeq, alive.length,
    game.myCard, !!S.g7Picking, S.g7Picking ? S.g7Pick : null, S.room?.language,
    game.phase === "gameover" ? (game.ranking || []).map((p) => p.id + p.score).join() : ""
  ]);
  if (S.g7Key === key && $("#gamePanel .g7-root")) return;
  S.g7Key = key;

  if (game.phase === "gameover") return renderGame7Gameover(game);
  if (game.phase === "boom") return renderGame7Boom(game);
  if (!isAlive) return renderGame7Spectate(game);
  if (isMyTurn && S.g7Picking) return renderGame7Assign(game);
  return renderGame7Turn(game, isMyTurn);
}

function renderGame7Turn(game, isMyTurn) {
  const t = g7T();
  const viaLine = isMyTurn && game.via
    ? (game.via.card === "assign" ? t.viaAssign(g7Nick(game.via.by))
      : game.via.card === "reverse" ? t.viaReverse(g7Nick(game.via.by))
      : t.viaSkip(g7Nick(game.via.by)))
    : "";

  $("#gamePanel").innerHTML = `
    <div class="g7-root ${isMyTurn ? "g7-my-turn" : ""}">
      ${g7Head(game, t.bombInfo(game.bombIndex, (game.alive || []).length))}
      <h2 class="g7-big">${esc(isMyTurn ? t.yourTurn : t.thinking(g7Nick(game.currentId)))}</h2>
      ${viaLine ? `<p class="g7-via">${esc(viaLine)}</p>` : ""}
      ${g7RangeHtml(game)}
      ${g7HistoryHtml(game)}
      ${isMyTurn ? `
        <form class="g7-guess" onsubmit="event.preventDefault();g7Guess()">
          <label class="g7-guess-field">
            <span class="sr-only">${esc(t.inputLabel)}</span>
            <input id="g7Input" type="number" inputmode="numeric" min="${game.low}" max="${game.high}" step="1"
              placeholder="${game.low}–${game.high}" ${game.low === game.high ? `value="${game.low}"` : ""} autocomplete="off">
          </label>
          <button type="submit" class="btn btn-dark g7-guess-btn">${esc(t.guess)}</button>
        </form>
      ` : ""}
      ${g7CardHtml(game, isMyTurn)}
    </div>
  `;

  startTimer($("#time"), game.endsAt);
  if (isMyTurn) {
    const input = $("#g7Input");
    if (input && window.matchMedia("(pointer:fine)").matches) input.focus();
  }
}

function renderGame7Assign(game) {
  const t = g7T();
  const choices = (game.alive || []).filter((id) => id !== S.playerId);
  const outIds = (game.order || []).filter((id) => !(game.alive || []).includes(id));
  const pick = choices.includes(S.g7Pick) ? S.g7Pick : null;

  $("#gamePanel").innerHTML = `
    <div class="g7-root">
      ${g7Head(game, t.assignEyebrow)}
      <h2 class="g7-big">${esc(t.assignTitle)}</h2>
      <div class="g7-nowrange"><span>${esc(t.nowRange)}</span><strong>${game.low === game.high ? game.low : `${game.low} — ${game.high}`}</strong></div>
      <div class="g7-who-grid">
        ${choices.map((id) => `
          <button type="button" class="g7-who ${pick === id ? "picked" : ""}" onclick="g7PickTarget('${id}')">
            <span class="g7-av">${esc([...g7Nick(id)][0] || "?")}</span>${esc(g7Nick(id))}
          </button>
        `).join("")}
        ${outIds.map((id) => `
          <button type="button" class="g7-who" disabled>
            <span class="g7-av">${esc([...g7Nick(id)][0] || "?")}</span>${esc(g7Nick(id))} · ${esc(t.outTag)}
          </button>
        `).join("")}
      </div>
      <p class="g7-note">${esc(t.assignHint)}</p>
      <div class="g7-actions">
        <button type="button" class="btn btn-outline" onclick="g7CancelAssign()">${esc(t.cancel)}</button>
        <button type="button" class="btn btn-dark" onclick="g7ConfirmAssign()" ${pick ? "" : "disabled"}>${esc(pick ? t.assignTo(g7Nick(pick)) : t.pickFirst)}</button>
      </div>
    </div>
  `;
  startTimer($("#time"), game.endsAt);
}

function renderGame7Spectate(game) {
  const t = g7T();
  const waiting = game.phase === "turn";
  $("#gamePanel").innerHTML = `
    <div class="g7-root">
      ${g7Head(game, t.spectateEyebrow)}
      <h2 class="g7-big">${esc(waiting ? t.thinking(g7Nick(game.currentId)) : "")}</h2>
      ${game.bomb !== null && game.bomb !== undefined ? `
        <div class="g7-secret">
          ${g7BombSvg(40)}
          <div class="g7-secret-text">
            <div class="g7-card-eyebrow">${esc(t.onlyOut)}</div>
            <span>${esc(t.bombIs)}</span>
          </div>
          <strong>${game.bomb}</strong>
        </div>
      ` : ""}
      ${g7RangeHtml(game, { hideLabel: true, bomb: game.bomb, note: t.markerNote })}
      ${g7HistoryHtml(game)}
      <p class="g7-note g7-push">${esc(t.revive)}</p>
    </div>
  `;
  startTimer($("#time"), game.endsAt);
}

function g7BombSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 56 56" aria-hidden="true"><circle cx="25" cy="33" r="18" fill="#FFD3DD"/><rect x="19" y="11" width="12" height="7" rx="2" fill="#F7577A"/><path d="M25 11 C25 4 33 2 38 6" fill="none" stroke="#FFD3DD" stroke-width="2.5" stroke-linecap="round"/><polygon points="41,1 43,6 48,5 44,9 47,13 42,11 39,15 39,10 34,9 39,7" fill="#F2D965"/><text x="25" y="40" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="17" fill="#1f2740">?</text></svg>`;
}

function g7BurstSvg() {
  const pts = (cx, cy, ro, ri, n) => {
    const out = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? ri : ro;
      const a = (-90 + (i * 180) / n) * Math.PI / 180;
      out.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return out.join(" ");
  };
  const sparks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 + 15) * Math.PI / 180;
    const x1 = 130 + 112 * Math.cos(a), y1 = 130 + 112 * Math.sin(a);
    const x2 = 130 + 128 * Math.cos(a), y2 = 130 + 128 * Math.sin(a);
    return `<path class="g7-spark" style="--i:${i}" d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"></path>`;
  }).join("");
  return `
    <svg class="g7-burst" viewBox="0 0 260 260" aria-hidden="true">
      <g class="g7-sparks" fill="none" stroke="#F2D965" stroke-width="7" stroke-linecap="round">${sparks}</g>
      <polygon class="g7-burst-outer" points="${pts(130, 130, 118, 64, 16)}" fill="#F2D965" stroke="#1f2740" stroke-width="4" stroke-linejoin="round"></polygon>
      <polygon class="g7-burst-mid" points="${pts(130, 130, 92, 52, 14)}" fill="#F7577A" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"></polygon>
      <polygon class="g7-burst-inner" points="${pts(130, 130, 66, 40, 12)}" fill="#FFD3DD" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"></polygon>
      <text x="130" y="145" text-anchor="middle" textLength="128" lengthAdjust="spacingAndGlyphs" class="g7-burst-text">BOOM</text>
    </svg>
  `;
}

function renderGame7Boom(game) {
  const t = g7T();
  const b = game.lastBoom || {};
  const isBomb = b.kind !== "offline";
  const name = g7Nick(b.id);
  const winner = game.roundWinnerId;
  const alive = game.alive || [];

  const viaLine = isBomb && b.via?.card === "assign"
    ? t.viaAssignBoom(g7Nick(b.via.by), name)
    : isBomb && b.auto ? t.autoBoom : "";

  const footer = winner
    ? `
      <div class="g7-next g7-next-win">
        <span>${esc(t.roundWin(g7Nick(winner)))}<br><small>${esc(game.round >= game.totalRounds ? t.lastRound : t.nextRound(game.round + 1))}</small></span>
        <strong id="g7Count"></strong>
      </div>
    `
    : `
      <div class="g7-left-label">${esc(t.left(alive.length))}</div>
      <div class="g7-alive">${alive.map((id) => `<span>${esc(g7Nick(id))}</span>`).join("")}</div>
      <div class="g7-next">
        <span>${esc(t.newBomb)}<br><small>${esc(t.startBy(g7Nick(game.nextStartId)))}</small></span>
        <strong id="g7Count"></strong>
      </div>
    `;

  $("#gamePanel").innerHTML = `
    <div class="g7-root g7-boom ${isBomb ? "" : "g7-boom-offline"}">
      <div class="eyebrow g7-boom-eyebrow">${esc(t.roundLabel(game.round, game.totalRounds))} · ${esc(t.bombInfo(b.bombIndex || game.bombIndex, alive.length).split(" · ")[0])}</div>
      ${isBomb ? `<div class="g7-burst-wrap">${g7BurstSvg()}</div>` : ""}
      <h2 class="g7-big">${esc(isBomb ? t.boomTitle(name) : t.offlineOut(name))}</h2>
      ${isBomb ? `<div class="g7-bomb-was"><span>${esc(t.bombWas)}</span><strong>${b.bomb}</strong></div>` : ""}
      ${viaLine ? `<p class="g7-via">${esc(viaLine)}</p>` : ""}
      <div class="g7-boom-foot">${footer}</div>
    </div>
  `;

  clearInterval(S.timer);
  const count = $("#g7Count");
  const tick = () => {
    if (!count) return;
    const left = Math.max(0, Math.ceil(((game.endsAt || 0) - Date.now()) / 1000));
    count.textContent = String(left);
  };
  tick();
  S.timer = setInterval(tick, 200);
}

function renderGame7Gameover(game) {
  const t = g7T();
  clearInterval(S.timer);
  const ranking = game.ranking || [];
  const top = ranking.length ? ranking[0].score : 0;
  const winners = top > 0 ? ranking.filter((p) => p.score === top) : [];
  const isHost = S.room.hostId === S.playerId;
  const rankOf = (score) => 1 + ranking.filter((p) => p.score > score).length;
  const rounds = game.winners || [];
  const crown = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7A1030" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"></path></svg>';

  $("#gamePanel").innerHTML = `
    <div class="g7-root g7-result">
      <div class="g7-result-head">
        <div class="eyebrow">${esc(game.endedEarly ? t.endedEarly : t.roundsDone(rounds.length))}</div>
        <h2 class="g7-big">${esc(winners.length > 1 ? t.tieTitle : winners.length ? t.winTitle : t.noWinner)}</h2>
      </div>
      ${winners.length ? `
        <div class="g7-winners ${winners.length === 1 ? "single" : ""}">
          ${winners.map((p) => `
            <div class="g7-win">
              ${crown}
              <strong>${esc(g7Nick(p.id))}</strong>
              <small>${esc(t.survived(p.score))}</small>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${rounds.length ? `
        <div class="g7-section">
          <div class="eyebrow">${esc(t.perRound)}</div>
          <div class="g7-rounds">
            ${rounds.map((r) => `<div class="g7-rd">R${r.round}<span>${esc(g7Nick(r.id))}</span></div>`).join("")}
          </div>
        </div>
      ` : ""}
      <div class="g7-section">
        <div class="eyebrow">${esc(t.ranking)}</div>
        <div class="g7-rank">
          ${ranking.map((p) => `
            <div class="g7-rank-row ${winners.some((w) => w.id === p.id) ? "first" : ""} ${p.id === S.playerId ? "me" : ""}">
              <span>${rankOf(p.score)}</span><span class="g7-rank-name">${esc(p.nickname)}${p.id === S.playerId ? `（${esc(t.you)}）` : ""}</span><b>${p.score}</b>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="g7-actions">
        <button type="button" class="btn btn-outline" onclick="leaveRoom()">${esc(t.lobby)}</button>
        ${isHost ? `<button type="button" class="btn btn-dark" onclick="g7Restart()">${esc(t.again)}</button>` : `<p class="g7-note">${esc(t.waitHost)}</p>`}
      </div>
    </div>
  `;
}

window.g7Guess = () => {
  const game = S.room?.gameState;
  const input = $("#g7Input");
  if (!game || !input) return;
  const n = Number(input.value);
  if (!input.value || !Number.isInteger(n) || n < game.low || n > game.high) {
    flash(`請輸入 ${game.low}–${game.high} 之間嘅整數。`);
    input.focus();
    return;
  }
  send({ type: "g7:guess", value: n });
};

window.g7UseCard = () => {
  const game = S.room?.gameState;
  if (!game || game.currentId !== S.playerId || !game.myCard) return;
  if (game.myCard === "assign") {
    S.g7Picking = true;
    S.g7Pick = null;
    renderGame7(game);
    return;
  }
  send({ type: "g7:card" });
};

window.g7PickTarget = (id) => {
  S.g7Pick = id;
  renderGame7(S.room.gameState);
};

window.g7CancelAssign = () => {
  S.g7Picking = false;
  S.g7Pick = null;
  renderGame7(S.room.gameState);
};

window.g7ConfirmAssign = () => {
  if (!S.g7Pick) return;
  send({ type: "g7:card", targetId: S.g7Pick });
  S.g7Picking = false;
};

window.g7Restart = () => {
  send({ type: "g7:restart" });
};

window.g7EndEarly = async () => {
  const ok = await askConfirm(g7T().confirmEnd);
  if (!ok) return;
  send({ type: "g7:end" });
};

/* =========================
   Game 8 · Battleship 海戰棋
========================= */

const G8_TEXT = {
  yue: {
    modes: { duel: "1v1 對決", brawl: "大亂鬥", team: "分隊" },
    modeDesc: {
      duel: "兩個人對打，先打沉晒對方艦隊就贏",
      brawl: "每人一塊板，打沉晒就出局，剩最後一個贏",
      team: "系統隨機分隊，每隊共用一塊板，輪流做炮手"
    },
    onlyTwo: "只限 2 人",
    needFour: "要 4 人或以上",
    pickMode: "揀模式",
    hostPicks: "房主揀緊模式",
    nowPlayers: (n) => `而家 ${n} 人`,
    teams: { navy: "海軍", pirate: "海盜" },
    vs: "對",
    roundLabel: (r, t) => `ROUND ${r} / ${t}`,
    cycleHint: (c, h) => `第 ${c} 輪 · 第 ${h} 輪起白熱化`,
    hotBanner: "白熱化 · 思考時間減半 · 每輪完結空襲",
    placeTitle: "擺好你嘅船",
    placeTeamTitle: "擺好你負責嘅船",
    placeHint: "撳船揀選，再撳格仔擺位；撳「旋轉」轉方向",
    rotate: "旋轉",
    random: "隨機擺",
    ready: "準備好",
    unready: "取消準備",
    readyCount: (a, b) => `${a} / ${b} 準備好 · 全部準備好就即刻開始`,
    teammateShip: (n) => `${n} 負責`,
    picked: "揀咗",
    yourTurn: "輪到你開炮！",
    yourShooter: "輪到你做炮手！",
    shooterIs: (n) => `${n} 做炮手`,
    thinking: (n) => `${n} 諗緊…`,
    enemyFiring: (t) => `${t} 開緊炮…`,
    whoTarget: "打邊個？",
    waters: (n) => `${n} 嘅海域`,
    yourWaters: "你嘅海域",
    teamWaters: (t) => `${t} 嘅海域（你哋隊）`,
    viewOwn: "睇自己塊板",
    viewEnemy: "睇對手塊板",
    fire: (cell) => `開炮 ${cell}`,
    fireCard: (card, cell) => `用${card} ${cell}`,
    pickCell: "揀一格先",
    pickRow: "揀一行",
    pingHint: "撳格仔標記想打嘅位，淨係隊友睇到",
    pingLegend: "隊友標記",
    pinged: (n, cell) => `${n} 標咗 ${cell}`,
    cards: { radar: "雷達", cross: "十字炮", torpedo: "魚雷" },
    cardDesc: { radar: "睇 3×3 範圍有幾多格有船", cross: "一次打 5 格", torpedo: "揀一行，打到中為止" },
    yourCard: "你嘅技能卡",
    teamCards: "隊伍技能卡 · 炮手先用得",
    noCard: "呢輪張卡已經用咗",
    use: "使用",
    cancel: "取消",
    shipsLeft: (a, b) => `剩 ${a} / ${b} 隻`,
    out: "出局",
    sunkTag: "已擊沉",
    myFleet: "你嘅艦隊",
    lastShot: (n, cell, res) => `${n} 打 ${cell} · ${res}`,
    lastCard: (n, card, cell) => `${n} 用${card}打 ${cell}`,
    lastRadar: (n, cell, k) => `${n} 用雷達掃 ${cell} 附近：${k} 格有船`,
    lastRadarOther: (n) => `${n} 用咗雷達`,
    res: { hit: "打中", miss: "射空" },
    sunk: (s) => `擊沉${s}！`,
    auto: "（超時）",
    air: (n) => `空襲炸中 ${n} 嘅船！`,
    airMiss: "空襲冇炸中任何船",
    roundWin: (n) => `${n} 贏咗呢輪！`,
    roundDraw: "同歸於盡！呢輪平手",
    drawChip: "平手",
    roundWinTeam: (t) => `${t} 贏咗呢輪！`,
    nextRound: (r) => `第 ${r} 輪準備開始`,
    lastRound: "最後一輪完結",
    roundsDone: (n) => `${n} 輪完結`,
    endedEarly: "提前結算",
    winTitle: "贏家！",
    tieTitle: "並列贏家！",
    teamWin: (t) => `${t}勝利！`,
    teamTie: "平手！",
    noWinner: "未有人贏到任何一輪",
    roundsWon: (n) => `贏咗 ${n} 輪`,
    perRound: "每輪贏家",
    ranking: "排名",
    titles: { sharp: "神射手", sinker: "擊沉王", unlucky: "最唔好彩" },
    titleVal: { sharp: (p) => `命中率 ${p}%`, sinker: (n) => `擊沉 ${n} 隻`, unlucky: (n) => `被空襲中 ${n} 次` },
    youAre: (t) => `你係${t}`,
    yourTeamWon: "你嘅隊伍贏咗！",
    revenge: "下次報仇！",
    again: "再玩一場",
    waitHost: "等房主決定再玩一場",
    lobby: "返大廳",
    you: "你",
    shooterTag: "炮手",
    confirmEnd: "肯定提前結算？之後就唔可以再繼續呢局。",
    settingsNote: "每輪大約 5–10 分鐘，人越多越耐"
  },
  zh: {
    modes: { duel: "1v1 對決", brawl: "大亂鬥", team: "分隊" },
    modeDesc: {
      duel: "兩人對戰，先擊沉對方整支艦隊就贏",
      brawl: "每人一塊海域，船全沉就出局，撐到最後的人獲勝",
      team: "系統隨機分隊，每隊共用一塊海域，輪流當砲手"
    },
    onlyTwo: "限 2 人",
    needFour: "需要 4 人以上",
    pickMode: "選擇模式",
    hostPicks: "房主正在選擇模式",
    nowPlayers: (n) => `目前 ${n} 人`,
    teams: { navy: "海軍", pirate: "海盜" },
    vs: "對",
    roundLabel: (r, t) => `ROUND ${r} / ${t}`,
    cycleHint: (c, h) => `第 ${c} 輪 · 第 ${h} 輪起白熱化`,
    hotBanner: "白熱化 · 思考時間減半 · 每輪結束空襲",
    placeTitle: "擺好你的船",
    placeTeamTitle: "擺好你負責的船",
    placeHint: "點船選取，再點格子放置；按「旋轉」改方向",
    rotate: "旋轉",
    random: "隨機擺放",
    ready: "準備好了",
    unready: "取消準備",
    readyCount: (a, b) => `${a} / ${b} 準備好 · 全部準備好就馬上開始`,
    teammateShip: (n) => `${n} 負責`,
    picked: "已選",
    yourTurn: "輪到你開砲！",
    yourShooter: "輪到你當砲手！",
    shooterIs: (n) => `${n} 當砲手`,
    thinking: (n) => `${n} 思考中…`,
    enemyFiring: (t) => `${t} 正在開砲…`,
    whoTarget: "要打誰？",
    waters: (n) => `${n} 的海域`,
    yourWaters: "你的海域",
    teamWaters: (t) => `${t} 的海域（你們隊）`,
    viewOwn: "看自己的海域",
    viewEnemy: "看對手的海域",
    fire: (cell) => `開砲 ${cell}`,
    fireCard: (card, cell) => `用${card} ${cell}`,
    pickCell: "先選一格",
    pickRow: "選一行",
    pingHint: "點格子標記想打的位置，只有隊友看得到",
    pingLegend: "隊友標記",
    pinged: (n, cell) => `${n} 標記了 ${cell}`,
    cards: { radar: "雷達", cross: "十字砲", torpedo: "魚雷" },
    cardDesc: { radar: "看 3×3 範圍內有幾格有船", cross: "一次打 5 格", torpedo: "選一行，打到命中為止" },
    yourCard: "你的技能卡",
    teamCards: "隊伍技能卡 · 只有砲手能用",
    noCard: "這輪的卡已經用掉",
    use: "使用",
    cancel: "取消",
    shipsLeft: (a, b) => `剩 ${a} / ${b} 艘`,
    out: "出局",
    sunkTag: "已擊沉",
    myFleet: "你的艦隊",
    lastShot: (n, cell, res) => `${n} 打 ${cell} · ${res}`,
    lastCard: (n, card, cell) => `${n} 用${card}打 ${cell}`,
    lastRadar: (n, cell, k) => `${n} 用雷達掃描 ${cell} 附近：${k} 格有船`,
    lastRadarOther: (n) => `${n} 使用了雷達`,
    res: { hit: "命中", miss: "落空" },
    sunk: (s) => `擊沉${s}！`,
    auto: "（逾時）",
    air: (n) => `空襲炸中 ${n} 的船！`,
    airMiss: "空襲沒有炸中任何船",
    roundWin: (n) => `${n} 贏得這一輪！`,
    roundDraw: "同歸於盡！這一輪平手",
    drawChip: "平手",
    roundWinTeam: (t) => `${t} 贏得這一輪！`,
    nextRound: (r) => `第 ${r} 輪準備開始`,
    lastRound: "最後一輪結束",
    roundsDone: (n) => `${n} 輪結束`,
    endedEarly: "提前結算",
    winTitle: "贏家！",
    tieTitle: "並列贏家！",
    teamWin: (t) => `${t}勝利！`,
    teamTie: "平手！",
    noWinner: "還沒有人贏得任何一輪",
    roundsWon: (n) => `贏了 ${n} 輪`,
    perRound: "每輪贏家",
    ranking: "排名",
    titles: { sharp: "神射手", sinker: "擊沉王", unlucky: "最倒楣" },
    titleVal: { sharp: (p) => `命中率 ${p}%`, sinker: (n) => `擊沉 ${n} 艘`, unlucky: (n) => `被空襲命中 ${n} 次` },
    youAre: (t) => `你是${t}`,
    yourTeamWon: "你的隊伍贏了！",
    revenge: "下次再報仇！",
    again: "再玩一場",
    waitHost: "等房主決定要不要再玩一場",
    lobby: "回大廳",
    you: "你",
    shooterTag: "砲手",
    confirmEnd: "確定提前結算？之後就不能再繼續這一局。",
    settingsNote: "每輪大約 5–10 分鐘，人越多越久"
  }
};

const G8_LETTERS = "ABCDEFGH";
const G8_ICONS = {
  anchor: '<circle cx="12" cy="5" r="2.5"></circle><path d="M12 7.5V21M7 11h10M4 14c0 4 4 7 8 7s8-3 8-7"></path>',
  skull: '<path d="M12 3c-4 0-6.5 2.6-6.5 6 0 2 1 3.4 2.5 4.2V16h8v-2.8c1.5-.8 2.5-2.2 2.5-4.2 0-3.4-2.5-6-6.5-6z"></path><circle cx="9.5" cy="9.5" r="1.3" fill="currentColor"></circle><circle cx="14.5" cy="9.5" r="1.3" fill="currentColor"></circle><path d="M10 16v2M14 16v2M4 19l16 2M20 19L4 21"></path>',
  radar: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="4"></circle><path d="M12 12l6-6"></path>',
  cross: '<path d="M12 3v18M3 12h18"></path>',
  torpedo: '<path d="M3 12h14M13 8l4 4-4 4M20 9v6"></path>',
  aim: '<circle cx="12" cy="12" r="6"></circle><path d="M12 2v5M12 17v5M2 12h5M17 12h5"></path>',
  x: '<path d="M6 6l12 12M18 6L6 18"></path>',
  fire: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"></path>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"></path>',
  shuffle: '<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"></path>'
};
const G8_MEDALS = {
  sharp: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1f2740" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2" fill="#1f2740"></circle><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"></path></svg>',
  sinker: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1f2740" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 14.5L16 7l2.2 3.6-12.5 7.5z"></path><path d="M18.2 10.6l1.6-1-2.2-3.6-1.6 1"></path><circle cx="8" cy="17" r="3.5"></circle><circle cx="8" cy="17" r="1" fill="#1f2740"></circle><path d="M13 21H3"></path><circle cx="21" cy="3.5" r="1.6" fill="#1f2740"></circle></svg>',
  unlucky: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="14" r="7.5" fill="#1f2740"></circle><rect x="13" y="4.8" width="5" height="3.8" rx="1" transform="rotate(40 15.5 6.7)" fill="#1f2740"></rect><path d="M17.2 4.6c.9-1.9 2.7-2.4 4.2-1.5" fill="none" stroke="#1f2740" stroke-width="1.8" stroke-linecap="round"></path><circle cx="21.4" cy="3.1" r="1.5" fill="#FF7A59"></circle><circle cx="8.2" cy="11.2" r="1.7" fill="#FEFEF2" opacity=".75"></circle></svg>'
};

function g8T() {
  return G8_TEXT[S.room?.language === "zh" ? "zh" : "yue"];
}

function g8Icon(name, size = 20, extra = "") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${G8_ICONS[name] || ""}</svg>`;
}

function g8Nick(id) {
  if (id && id === S.playerId) return g8T().you;
  return S.room?.players?.find((p) => p.id === id)?.nickname || "玩家";
}

function g8KeyName(game, key) {
  if (game.mode === "team") return g8T().teams[key] || key;
  return g8Nick(key);
}

function g8Cell(r, c) {
  return `${G8_LETTERS[c]}${r + 1}`;
}

function g8Badge(team, size = 30) {
  return `<span class="g8-badge g8-badge-${team}" style="width:${size}px;height:${size}px">${g8Icon(team === "navy" ? "anchor" : "skull", Math.round(size * 0.6))}</span>`;
}

// 一塊板：shots／船／標記／雷達；clickable 決定撳格會做咩。
function g8BoardHtml(game, board, opts = {}) {
  const n = game.size;
  const state = {};
  for (const [r, c, res, air] of board.shots || []) state[r + "," + c] = { res, air: !!air };
  const shipAt = {};
  for (const s of board.ships || []) for (const [r, c] of s.cells || []) shipAt[r + "," + c] = s;
  const pingAt = {};
  for (const p of opts.pings || []) (pingAt[p.r + "," + p.c] ||= []).push(p.id);
  const radarCenter = {};
  const radarArea = new Set();
  for (const x of opts.radar || []) {
    if (x.board !== board.id) continue;
    radarCenter[x.r + "," + x.c] = x.count;
    for (let r = x.r - 1; r <= x.r + 1; r++) for (let c = x.c - 1; c <= x.c + 1; c++) radarArea.add(r + "," + c);
  }
  const preview = new Set(opts.preview || []);
  const cells = [];
  if (!opts.small) {
    cells.push('<span class="g8-lab"></span>');
    for (let c = 0; c < n; c++) cells.push(`<span class="g8-lab">${G8_LETTERS[c]}</span>`);
  }
  for (let r = 0; r < n; r++) {
    if (!opts.small) cells.push(`<span class="g8-lab">${r + 1}</span>`);
    for (let c = 0; c < n; c++) {
      const k = r + "," + c;
      const st = state[k];
      const ship = shipAt[k];
      const cls = ["g8-c"];
      let inner = "";
      if (st?.res === "hit") {
        cls.push(ship?.sunk ? "sunk" : "hit");
        inner = g8Icon("x", opts.small ? 10 : 16, 'stroke-width="4"');
      } else if (st?.res === "miss") {
        cls.push("miss");
        inner = '<i class="g8-dot"></i>';
      } else if (ship) {
        cls.push(ship.sunk ? "sunk" : "ship");
        if (opts.mineOwner && ship.owner && ship.owner !== opts.mineOwner) cls.push("mate");
        if (opts.selShip && ship.id === opts.selShip) cls.push("sel");
      }
      if (st?.air) cls.push("air");
      if (radarArea.has(k)) cls.push("radar");
      if (preview.has(k)) cls.push("preview");
      if (opts.aim && opts.aim.r === r && opts.aim.c === c) {
        cls.push("aim");
        inner = g8Icon("aim", opts.small ? 12 : 20);
      } else if (opts.aimRow !== undefined && opts.aimRow === r && !st) {
        cls.push("aimrow");
      }
      if (pingAt[k] && !st) {
        cls.push("ping");
        if (!inner) inner = `<b class="g8-ping-n">${esc([...g8Nick(pingAt[k][0])][0] || "?")}</b>`;
      }
      if (radarCenter[k] !== undefined) inner += `<b class="g8-radar-n">${radarCenter[k]}</b>`;
      const label = `${g8Cell(r, c)}${st ? " " + g8T().res[st.res] : ""}`;
      if (opts.click) {
        cells.push(`<button type="button" class="${cls.join(" ")}" aria-label="${esc(label)}" onclick="g8CellClick('${board.id}',${r},${c})">${inner}</button>`);
      } else {
        cells.push(`<span class="${cls.join(" ")}">${inner}</span>`);
      }
    }
  }
  const cols = opts.small ? n : n + 1;
  return `<div class="g8-board ${opts.small ? "small" : ""} ${opts.dim ? "dim" : ""}" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${cells.join("")}</div>`;
}

function g8ShipStrip(board, game) {
  const t = g8T();
  const defs = game.size === 6 ? [3, 2, 2] : [4, 3, 3, 2];
  const sunk = (board.ships || []).filter((s) => s.sunk);
  const names = game.size === 6 ? ["巡洋艦", "驅逐艦", "巡邏艇"] : ["戰艦", "巡洋艦", "潛艇", "驅逐艦"];
  const sunkLeft = [...sunk];
  return `<div class="g8-fleet">${defs.map((len, i) => {
    const idx = sunkLeft.findIndex((s) => s.len === len);
    const dead = idx >= 0;
    if (dead) sunkLeft.splice(idx, 1);
    return `<span class="g8-fl ${dead ? "dead" : ""}"><span class="g8-seg">${"<i></i>".repeat(len)}</span>${esc(names[i])}${dead ? " · " + esc(t.sunkTag) : ""}</span>`;
  }).join("")}</div>`;
}

function g8Head(game, eyebrow, title) {
  const t = g8T();
  const teamLine = game.mode === "team" && game.myKey
    ? `<div class="g8-vs">${g8Badge(game.myKey)}<span>${esc(t.teams[game.myKey])}</span><span class="g8-vs-x">${esc(t.vs)}</span>${g8Badge(game.myKey === "navy" ? "pirate" : "navy")}<span>${esc(t.teams[game.myKey === "navy" ? "pirate" : "navy"])}</span></div>`
    : "";
  return `
    <div class="g8-head">
      <div>
        ${teamLine}
        <div class="eyebrow">${esc(eyebrow)}</div>
        <h2 class="g8-big">${esc(title)}</h2>
      </div>
      ${game.endsAt && game.phase !== "gameover" ? `<div id="time" class="timer"></div>` : ""}
    </div>
  `;
}

function g8LastHtml(game) {
  const t = g8T();
  const L = game.last;
  const rows = [];
  if (L) {
    const who = g8Nick(L.by);
    let text;
    if (L.card === "radar") {
      text = L.key === game.myKey ? t.lastRadar(who, g8Cell(L.r, L.c), L.radar) : t.lastRadarOther(who);
    } else if (L.card) {
      text = t.lastCard(who, t.cards[L.card], g8Cell(L.r, L.c));
    } else {
      const res = L.cells?.[0]?.res;
      text = t.lastShot(who, g8Cell(L.r, L.c), res ? t.res[res] : "");
    }
    if (game.mode === "brawl" && L.target) text += ` → ${g8KeyName(game, L.target)}`;
    const sunk = (L.cells || []).filter((x) => x.sunk).map((x) => x.sunk);
    const hits = (L.cells || []).filter((x) => x.res === "hit").length;
    const tag = sunk.length ? t.sunk(sunk.join("、")) : L.card && L.card !== "radar" ? `${hits} ${t.res.hit}` : "";
    rows.push(`<div class="g8-log ${sunk.length ? "boom" : ""}"><span>${esc(text)}${L.auto ? esc(t.auto) : ""}</span>${tag ? `<b>${esc(tag)}</b>` : ""}</div>`);
  }
  if (game.airLog) {
    const hit = game.airLog.filter((x) => x.res === "hit");
    rows.push(`<div class="g8-log air"><span>${esc(hit.length ? t.air(hit.map((x) => g8KeyName(game, x.board)).join("、")) : t.airMiss)}</span>${g8Icon("fire", 16)}</div>`);
  }
  return rows.join("");
}

function renderGame8(game) {
  const shell = $("#gameShell");
  const panel = $("#gamePanel");
  const t = g8T();
  let team = "";
  if (game.mode === "team") {
    if (game.phase === "gameover") {
      const w = game.teamWins || {};
      team = (w.navy || 0) > (w.pirate || 0) ? "navy" : (w.pirate || 0) > (w.navy || 0) ? "pirate" : "tie";
    } else team = game.myKey || "";
  }
  if (shell) shell.dataset.g8team = team;
  panel?.classList.toggle("g8-hot", !!game.hot && game.phase === "turn");

  if (game.phase === "placing") return renderGame8Placing(game);
  if (game.phase === "turn") return renderGame8Turn(game);
  if (game.phase === "roundover") return renderGame8RoundOver(game);
  if (game.phase === "gameover") return renderGame8Gameover(game);
}

function renderGame8Placing(game) {
  const t = g8T();
  const myBoard = game.boards.find((b) => b.id === game.myKey);
  if (!myBoard) {
    $("#gamePanel").innerHTML = `<div class="g8-root">${g8Head(game, t.roundLabel(game.round, game.totalRounds), t.placeTitle)}</div>`;
    startTimer($("#time"), game.endsAt);
    return;
  }
  const mine = (myBoard.myShips || []).filter((s) => s.owner === S.playerId);
  if (!mine.some((s) => s.id === S.g8Sel)) S.g8Sel = (mine.find((s) => !s.placed) || mine[0])?.id || null;
  if (S.g8Horiz === undefined) S.g8Horiz = true;
  const eyebrow = `${t.roundLabel(game.round, game.totalRounds)} · ${t.modes[game.mode]}`;
  const tray = (myBoard.myShips || []).map((s) => {
    const isMine = s.owner === S.playerId;
    const sel = isMine && s.id === S.g8Sel;
    const status = !isMine ? t.teammateShip(g8Nick(s.owner)) : sel ? t.picked : s.placed ? "✓" : "";
    return `<button type="button" class="g8-ship ${sel ? "sel" : ""} ${isMine ? "" : "mate"}" ${isMine ? `onclick="g8PickShip('${s.id}')"` : "disabled"}>
      <span class="g8-seg">${"<i></i>".repeat(s.len)}</span><span class="g8-ship-name">${esc(s.name)}</span><span>${esc(status)}</span>
    </button>`;
  }).join("");

  $("#gamePanel").innerHTML = `
    <div class="g8-root">
      ${g8Head(game, eyebrow, game.mode === "team" ? t.placeTeamTitle : t.placeTitle)}
      <p class="g8-note">${esc(t.placeHint)}</p>
      ${g8BoardHtml(game, myBoard, { click: !game.myReady, selShip: S.g8Sel, mineOwner: game.mode === "team" ? S.playerId : null })}
      <div class="g8-tray ${game.mode === "team" ? "team" : ""}">${tray}</div>
      <div class="g8-tools">
        <button type="button" class="g8-tool" onclick="g8Rotate()" ${game.myReady ? "disabled" : ""}>${g8Icon("rotate", 18)}${esc(t.rotate)} · ${S.g8Horiz ? "↔" : "↕"}</button>
        <button type="button" class="g8-tool" onclick="g8Random()" ${game.myReady ? "disabled" : ""}>${g8Icon("shuffle", 18)}${esc(t.random)}</button>
      </div>
      <div class="g8-bottom">
        <p class="g8-note center">${esc(t.readyCount(game.readyCount, game.readyTotal))}</p>
        <button type="button" class="btn ${game.myReady ? "btn-outline" : "btn-yellow"} g8-main-btn" onclick="g8Ready(${game.myReady ? "false" : "true"})">${esc(game.myReady ? t.unready : t.ready)}</button>
      </div>
    </div>
  `;
  startTimer($("#time"), game.endsAt);
}

function g8DefaultView(game) {
  const me = game.myKey;
  if (game.mode === "brawl") {
    const opps = game.order.filter((k) => k !== me);
    const alive = opps.filter((k) => !game.boards.find((b) => b.id === k)?.dead);
    if (!opps.includes(S.g8Target) || (game.cur === me && !alive.includes(S.g8Target))) {
      S.g8Target = alive[0] || opps[0] || null;
    }
    return S.g8Target;
  }
  const enemy = game.order.find((k) => k !== me) || game.order[0];
  if (S.g8ViewSeq !== game.turnSeq) {
    S.g8ViewSeq = game.turnSeq;
    S.g8ShowOwn = !!me && game.cur !== me;
  }
  return S.g8ShowOwn && me ? me : enemy;
}

function renderGame8Turn(game) {
  const t = g8T();
  const me = game.myKey;
  const isShooter = game.shooter === S.playerId;
  const myTurn = !!me && game.cur === me;
  if (S.g8AimSeq !== game.turnSeq) {
    S.g8AimSeq = game.turnSeq;
    S.g8Aim = null;
    S.g8Card = null;
  }
  const viewId = g8DefaultView(game);
  const board = game.boards.find((b) => b.id === viewId);
  const myBoard = game.boards.find((b) => b.id === me);
  const viewingEnemy = viewId !== me;
  const meOut = game.mode === "brawl" && myBoard?.dead;

  let title;
  if (isShooter) title = game.mode === "team" ? t.yourShooter : t.yourTurn;
  else if (game.mode === "team" && myTurn) title = t.shooterIs(g8Nick(game.shooter));
  else if (game.mode === "team") title = t.enemyFiring(t.teams[game.cur]);
  else title = t.thinking(g8Nick(game.shooter));
  if (isShooter && game.mode === "brawl") title = t.whoTarget;

  let eyebrow = `${t.roundLabel(game.round, game.totalRounds)} · ${t.modes[game.mode]}`;
  if (meOut) eyebrow += ` · ${t.out}`;

  const hotBanner = game.hot
    ? `<div class="g8-hotbar">${g8Icon("fire", 20, 'class="g8-flick"')}<span>${esc(t.hotBanner)}</span></div>`
    : "";
  const cycleHint = !game.hot && game.hotAt ? `<span class="g8-cycle">${esc(t.cycleHint(game.cycle, game.hotAt))}</span>` : "";

  const teamChips = game.mode === "team" && me
    ? `<div class="g8-mems">${(game.teams?.[me] || []).map((id) => `<span class="g8-mem ${myTurn && id === game.shooter ? "shoot" : ""}">${esc(g8Nick(id))}${myTurn && id === game.shooter ? " · " + esc(t.shooterTag) : ""}</span>`).join("")}${cycleHint}</div>`
    : cycleHint ? `<div class="g8-mems">${cycleHint}</div>` : "";

  const tabs = game.mode === "brawl"
    ? `<div class="g8-tabs">${game.order.filter((k) => k !== me).map((k) => {
        const b = game.boards.find((x) => x.id === k);
        return `<button type="button" class="g8-tab ${k === viewId ? "on" : ""}" ${b.dead ? "disabled" : ""} onclick="g8PickTarget('${k}')">${esc(g8Nick(k))}<small>${esc(b.dead ? t.out : t.shipsLeft(b.shipsLeft, b.shipsTotal))}</small></button>`;
      }).join("")}</div>`
    : "";

  const canAim = isShooter && viewingEnemy && !board.dead;
  const canPing = game.mode === "team" && myTurn && !isShooter && viewingEnemy;
  const aim = canAim ? S.g8Aim && S.g8Aim.board === viewId ? S.g8Aim : null : null;
  const preview = [];
  let aimRow;
  if (aim && S.g8Card === "cross") for (const [r, c] of [[aim.r - 1, aim.c], [aim.r + 1, aim.c], [aim.r, aim.c - 1], [aim.r, aim.c + 1]]) preview.push(r + "," + c);
  if (aim && S.g8Card === "radar") for (let r = aim.r - 1; r <= aim.r + 1; r++) for (let c = aim.c - 1; c <= aim.c + 1; c++) preview.push(r + "," + c);
  if (aim && S.g8Card === "torpedo") aimRow = aim.r;

  const boardTitle = viewingEnemy
    ? (game.mode === "team" ? `${g8Badge(viewId, 24)}<span>${esc(t.waters(t.teams[viewId]))}</span>` : `<span>${esc(t.waters(g8Nick(viewId)))}</span>`)
    : (game.mode === "team" ? `${g8Badge(me, 24)}<span>${esc(t.teamWaters(t.teams[me]))}</span>` : `<span>${esc(t.yourWaters)}</span>`);

  const toggle = game.mode !== "brawl" && me
    ? `<button type="button" class="g8-link" onclick="g8ToggleView()">${esc(viewingEnemy ? t.viewOwn : t.viewEnemy)}</button>`
    : "";

  const pings = game.pings || [];
  const pingLine = game.mode === "team" && myTurn
    ? `<div class="g8-pingline"><span class="g8-pingkey"></span>${esc(t.pingLegend)}${pings.length ? " · " + pings.map((p) => t.pinged(g8Nick(p.id), g8Cell(p.r, p.c))).map(esc).join(" · ") : ""}</div>`
    : "";

  const cards = game.cards || [];
  let cardBar = "";
  if (me && !meOut) {
    const usable = isShooter;
    const label = game.mode === "team" ? t.teamCards : t.yourCard;
    cardBar = cards.length
      ? `<div class="g8-cards"><div class="eyebrow g8-cards-lbl">${esc(label)}</div><div class="g8-cards-row ${cards.length > 1 ? "multi" : ""}">${cards.map((c, i) => `
          <div class="g8-card ${S.g8Card === c ? "on" : ""}">
            <span class="g8-card-face">${g8Icon(c, 18)}</span>
            <span class="g8-card-text"><strong>${esc(t.cards[c])}</strong><small>${esc(t.cardDesc[c])}</small></span>
            ${usable ? `<button type="button" onclick="g8UseCard('${c}')">${esc(S.g8Card === c ? t.cancel : t.use)}</button>` : ""}
          </div>`).join("")}</div></div>`
      : `<div class="g8-cards"><div class="g8-card empty">${esc(t.noCard)}</div></div>`;
  }

  const fireLabel = !aim ? (S.g8Card === "torpedo" ? t.pickRow : t.pickCell)
    : S.g8Card ? t.fireCard(t.cards[S.g8Card], S.g8Card === "torpedo" ? `${aim.r + 1}` : g8Cell(aim.r, aim.c))
    : t.fire(g8Cell(aim.r, aim.c));
  const fireBtn = canAim
    ? `<button type="button" class="btn btn-yellow g8-main-btn" ${aim ? "" : "disabled"} onclick="g8Fire()">${esc(fireLabel)}</button>`
    : "";

  const miniOwn = game.mode === "brawl" && myBoard
    ? `<div class="g8-mini">${g8BoardHtml(game, myBoard, { small: true })}<div><div class="eyebrow">${esc(t.myFleet)}</div><strong>${esc(myBoard.dead ? t.out : t.shipsLeft(myBoard.shipsLeft, myBoard.shipsTotal))}</strong></div></div>`
    : "";

  $("#gamePanel").innerHTML = `
    <div class="g8-root">
      ${hotBanner}
      ${g8Head(game, eyebrow, title)}
      ${teamChips}
      ${g8LastHtml(game)}
      ${tabs}
      ${canPing ? `<p class="g8-note g8-hint">${esc(t.pingHint)}</p>` : ""}
      <div class="g8-board-head">${boardTitle}${toggle}</div>
      ${g8BoardHtml(game, board, {
        click: canAim || canPing,
        aim, aimRow, preview,
        pings: viewingEnemy ? pings : [],
        radar: game.radar || []
      })}
      ${pingLine}
      ${g8ShipStrip(board, game)}
      ${canAim && S.g8Card ? `<p class="g8-note g8-hint">${esc(t.cards[S.g8Card])}：${esc(t.cardDesc[S.g8Card])}</p>` : ""}
      ${fireBtn}
      ${miniOwn}
      ${cardBar}
    </div>
  `;
  startTimer($("#time"), game.endsAt);
}

function renderGame8RoundOver(game) {
  const t = g8T();
  const w = game.roundWinners || [];
  const title = !w.length ? t.roundDraw
    : game.mode === "team" ? t.roundWinTeam(t.teams[w[0]])
    : t.roundWin(w.map((k) => g8Nick(k)).join("、"));
  const boards = game.boards.map((b) => `
    <div class="g8-reveal">
      <div class="g8-board-head">${game.mode === "team" ? g8Badge(b.id, 22) : ""}<span>${esc(g8KeyName(game, b.id))}${b.dead ? " · " + esc(t.out) : ""}</span></div>
      ${g8BoardHtml(game, b, { small: true })}
    </div>`).join("");
  $("#gamePanel").innerHTML = `
    <div class="g8-root">
      <div class="g8-head">
        <div>
          <div class="eyebrow">${esc(t.roundLabel(game.round, game.totalRounds))}</div>
          <h2 class="g8-big">${esc(title)}</h2>
        </div>
      </div>
      <div class="g8-reveals">${boards}</div>
      <div class="g8-next"><span>${esc(game.round >= game.totalRounds ? t.lastRound : t.nextRound(game.round + 1))}</span><strong id="g8Count"></strong></div>
    </div>
  `;
  clearInterval(S.timer);
  const count = $("#g8Count");
  const tick = () => { if (count) count.textContent = String(Math.max(0, Math.ceil(((game.endsAt || 0) - Date.now()) / 1000))); };
  tick();
  S.timer = setInterval(tick, 200);
}

function g8Titles(game) {
  const stats = game.stats || {};
  const ids = (game.ranking || []).map((p) => p.id);
  const pick = (score, min = 1) => {
    let best = null;
    for (const id of ids) {
      const v = score(stats[id] || {});
      if (v === null || v < min) continue;
      if (!best || v > best.v) best = { id, v };
    }
    return best;
  };
  const sharp = pick((s) => (s.cells >= 5 ? Math.round((s.hits / s.cells) * 100) : null), 0);
  const sinker = pick((s) => s.sinks || 0);
  const unlucky = pick((s) => s.airHit || 0);
  return [
    sharp && { key: "sharp", ...sharp },
    sinker && { key: "sinker", ...sinker },
    unlucky && { key: "unlucky", ...unlucky }
  ].filter(Boolean);
}

function renderGame8Gameover(game) {
  const t = g8T();
  clearInterval(S.timer);
  const ranking = game.ranking || [];
  const isHost = S.room.hostId === S.playerId;
  const rankOf = (score) => 1 + ranking.filter((p) => p.score > score).length;
  const titles = g8Titles(game);
  const rounds = game.winners || [];
  let hero;
  if (game.mode === "team") {
    const w = game.teamWins || { navy: 0, pirate: 0 };
    const win = w.navy > w.pirate ? "navy" : w.pirate > w.navy ? "pirate" : null;
    const lose = win === "navy" ? "pirate" : "navy";
    hero = `
      <div class="g8-hero">
        <div class="eyebrow">${esc(game.endedEarly ? t.endedEarly : t.roundsDone(rounds.length))} · ${esc(t.modes.team)}</div>
        ${win ? g8Badge(win, 72) : `<span class="g8-hero-tie">${g8Badge("navy", 48)}${g8Badge("pirate", 48)}</span>`}
        <h2 class="g8-big">${esc(win ? t.teamWin(t.teams[win]) : t.teamTie)}</h2>
        <div class="g8-score">${win ? `<span>${esc(t.teams[win])}</span><strong>${w[win]} : ${w[lose]}</strong><span>${esc(t.teams[lose])}</span>` : `<span>${esc(t.teams.navy)}</span><strong>${w.navy} : ${w.pirate}</strong><span>${esc(t.teams.pirate)}</span>`}</div>
        ${win ? `<div class="g8-crew">${(game.teams?.[win] || []).map((id) => `<span>${esc(g8Nick(id))}</span>`).join("")}</div>` : ""}
        ${game.myKey ? `<p class="g8-note center">${esc(t.youAre(t.teams[game.myKey]))} · ${esc(win === game.myKey ? t.yourTeamWon : win ? t.revenge : t.teamTie)}</p>` : ""}
      </div>`;
  } else {
    const top = ranking.length ? ranking[0].score : 0;
    const winners = top > 0 ? ranking.filter((p) => p.score === top) : [];
    hero = `
      <div class="g8-hero">
        <div class="eyebrow">${esc(game.endedEarly ? t.endedEarly : t.roundsDone(rounds.length))} · ${esc(t.modes[game.mode])}</div>
        <h2 class="g8-big">${esc(winners.length > 1 ? t.tieTitle : winners.length ? t.winTitle : t.noWinner)}</h2>
        ${winners.length ? `<div class="g8-winners">${winners.map((p) => `<div class="g8-win"><strong>${esc(g8Nick(p.id))}</strong><small>${esc(t.roundsWon(p.score))}</small></div>`).join("")}</div>` : ""}
      </div>`;
  }
  const titleHtml = titles.length ? `<div class="g8-titles">${titles.map((x) => `
    <div class="g8-stat"><span class="g8-medal">${G8_MEDALS[x.key]}</span><small>${esc(t.titles[x.key])}</small><strong>${esc(g8Nick(x.id))}</strong><span>${esc(t.titleVal[x.key](x.v))}</span></div>`).join("")}</div>` : "";
  const roundsHtml = rounds.length ? `
    <div class="g8-section"><div class="eyebrow">${esc(t.perRound)}</div>
      <div class="g8-rounds">${rounds.map((r) => !r.keys.length
        ? `<div class="g8-rd">R${r.round} · ${esc(t.drawChip)}</div>`
        : game.mode === "team"
        ? `<div class="g8-rd team-${r.keys[0]}">R${r.round} · ${esc(t.teams[r.keys[0]])}</div>`
        : `<div class="g8-rd">R${r.round} · ${esc(r.keys.map((k) => g8Nick(k)).join("、"))}</div>`).join("")}</div>
    </div>` : "";
  const rankHtml = game.mode === "team" ? "" : `
    <div class="g8-section"><div class="eyebrow">${esc(t.ranking)}</div>
      <div class="g8-rank">${ranking.map((p, i) => `<div class="g8-rank-row ${p.score === ranking[0].score && p.score > 0 ? "first" : ""} ${p.id === S.playerId ? "me" : ""}"><span>${rankOf(p.score)}</span><span class="g8-rank-name">${esc(g8Nick(p.id))}</span><b>${p.score}</b></div>`).join("")}</div>
    </div>`;

  $("#gamePanel").innerHTML = `
    <div class="g8-root g8-result">
      ${hero}
      ${titleHtml}
      ${roundsHtml}
      ${rankHtml}
      <div class="g8-actions">
        <button type="button" class="btn btn-outline" onclick="leaveRoom()">${esc(t.lobby)}</button>
        ${isHost ? `<button type="button" class="btn btn-yellow" onclick="g8Restart()">${esc(t.again)}</button>` : `<p class="g8-note center">${esc(t.waitHost)}</p>`}
      </div>
    </div>
  `;
}

window.g8CellClick = (boardId, r, c) => {
  const game = S.room?.gameState;
  if (!game) return;
  if (game.phase === "placing") {
    const board = game.boards.find((b) => b.id === boardId);
    const own = (board?.ships || []).find((s) => s.owner === S.playerId && s.cells?.some(([a, b]) => a === r && b === c));
    if (own && own.id !== S.g8Sel) {
      S.g8Sel = own.id;
      renderGame8(game);
      return;
    }
    if (!S.g8Sel) return;
    send({ type: "g8:place", shipId: S.g8Sel, r, c, horiz: S.g8Horiz !== false });
    const mine = (board?.myShips || []).filter((s) => s.owner === S.playerId && !s.placed && s.id !== S.g8Sel);
    S.g8Sel = mine[0]?.id || S.g8Sel;
    return;
  }
  if (game.phase !== "turn") return;
  if (game.shooter === S.playerId) {
    S.g8Aim = { board: boardId, r, c };
    renderGame8(game);
    return;
  }
  if (game.mode === "team" && game.cur === game.myKey) send({ type: "g8:ping", r, c });
};

window.g8PickShip = (id) => { S.g8Sel = id; renderGame8(S.room.gameState); };
window.g8Rotate = () => { S.g8Horiz = !(S.g8Horiz !== false); renderGame8(S.room.gameState); };
window.g8Random = () => send({ type: "g8:random" });
window.g8Ready = (ready) => send({ type: "g8:ready", ready });
window.g8PickTarget = (id) => { S.g8Target = id; S.g8Aim = null; renderGame8(S.room.gameState); };
window.g8ToggleView = () => { S.g8ShowOwn = !S.g8ShowOwn; renderGame8(S.room.gameState); };
window.g8UseCard = (card) => { S.g8Card = S.g8Card === card ? null : card; renderGame8(S.room.gameState); };
window.g8Fire = () => {
  const game = S.room?.gameState;
  if (!game || !S.g8Aim) return;
  send({ type: "g8:fire", target: S.g8Aim.board, r: S.g8Aim.r, c: S.g8Aim.c, card: S.g8Card || null });
  S.g8Aim = null;
  S.g8Card = null;
};
window.g8SetMode = (mode) => send({ type: "g8:mode", mode });
window.g8Restart = () => send({ type: "g8:restart" });
window.g8EndEarly = async () => {
  const ok = await askConfirm(g8T().confirmEnd);
  if (!ok) return;
  send({ type: "g8:end" });
};

function g8AllowedModes(count) {
  if (count <= 2) return ["duel"];
  if (count === 3) return ["brawl"];
  return ["brawl", "team"];
}

function g8LobbyHtml(room) {
  const t = g8T();
  const count = room.players.filter((p) => p.connected).length;
  const allowed = g8AllowedModes(count);
  const chosen = allowed.includes(room.g8Settings?.mode) ? room.g8Settings.mode : allowed[0];
  const isHost = room.hostId === S.playerId;
  const teamLabel = count >= 4 ? `${t.modes.team} ${Math.ceil(count / 2)}v${Math.floor(count / 2)} · ${t.teams.navy} ${t.vs} ${t.teams.pirate}` : t.modes.team;
  const modes = ["duel", "brawl", "team"].map((m) => {
    const ok = allowed.includes(m);
    const note = !ok ? (m === "duel" ? t.onlyTwo : m === "team" ? t.needFour : "") : t.modeDesc[m];
    return `<button type="button" class="g8-mode ${chosen === m ? "on" : ""}" ${ok && isHost ? `onclick="g8SetMode('${m}')"` : "disabled"}>
      <strong>${esc(m === "team" ? teamLabel : t.modes[m])}</strong><small>${esc(note || t.modeDesc[m])}</small>
    </button>`;
  }).join("");
  return `
    <div class="g8-lobby">
      <div class="label-row"><span>${esc(isHost ? t.pickMode : t.hostPicks)}</span><span class="notice" style="margin:0">${esc(t.nowPlayers(count))}</span></div>
      <div class="g8-modes">${modes}</div>
    </div>
  `;
}

/* =========================
   Game 9 · 心中有數
========================= */

const G9_TEXT = {
  yue: {
    roundLabel: (r, t) => `ROUND ${r} / ${t}`,
    turnLabel: (i, n) => `第 ${i} / ${n} 位出題`,
    tagPsy: "出題人",
    tagLocked: "已鎖定",
    youPsy: "你係出題人",
    secret: "只有你見到目標位置，唔好俾人偷睇",
    hintLabel: "你嘅提示",
    hintSub: "一個字詞或者一句",
    hintPh: "例如：沙律加芝士醬",
    hintHelp: (l, r) => `諗一樣嘢，喺「${l} ↔ ${r}」之間啱啱好落喺藍色 4 分位`,
    send: "送出提示",
    swap: "換題",
    thinking: (n) => `${n} 諗緊提示…`,
    waitHint: "等出題人出提示，可以先諗吓呢條光譜",
    hintOf: (n) => `${n} 嘅提示`,
    dragHelp: "拖個指針去你覺得啱嘅位置",
    fine: "微調",
    lock: "鎖定答案",
    lockedTitle: "已鎖定",
    lockCount: (a, b) => `已鎖定 ${a} / ${b}`,
    psyWatch: "大家估緊，睇吓佢哋有幾明你",
    sliderLabel: (l, r) => `指針位置，0 係「${l}」，100 係「${r}」`,
    target: "目標",
    reveal: "揭曉",
    diffLine: (v, d) => `${v} · 差 ${d}`,
    verdict: { 4: "正中紅心", 3: "好近", 2: "擦邊", 0: "差太遠" },
    noGuess: "冇估到",
    psyGets: (n) => `出題人 ${n} · 攞全隊平均`,
    skipped: "出題人夠鐘都未出提示，呢題跳過",
    nextPsy: (n, i, t) => `下個出題人：${n}（第 ${i} / ${t} 位）`,
    nextRound: (r, n) => `入 Round ${r} · 下個出題人：${n}`,
    last: "最後一題，準備結算",
    you: "你",
    endedEarly: "提前結算",
    done: (n) => `一共玩咗 ${n} 題`,
    winTitle: "心中最有數！",
    tieTitle: "心中一樣咁有數！",
    noWinner: "今局冇人得分",
    ranking: "排名",
    bulls: (n) => `正中紅心 ${n} 次`,
    lobby: "返大堂",
    again: "再玩一局",
    waitHost: "等房主決定再玩定散",
    endEarly: "提前結算",
    confirmEnd: "肯定提前結算？之後就唔可以再繼續呢局。",
    errEmpty: "打咗提示先。",
    errLong: "提示最多 20 個字。",
    lobbyLine: (r, s) => `${r} round · 估 ${s} 秒 · 出提示 45 秒 · 香港版`,
    lobbyCount: (n, q, a, b) => `而家 ${n} 人：共 ${q} 題 · 約 ${a}–${b} 分鐘`,
    lobbyNote: "每個 round 入面，每人輪流做一次出題人",
    preview: (q, a, b) => `例如 4 個人玩：共 ${q} 題 · 約 ${a}–${b} 分鐘`
  },
  zh: {
    roundLabel: (r, t) => `ROUND ${r} / ${t}`,
    turnLabel: (i, n) => `第 ${i} / ${n} 位出題`,
    tagPsy: "出題人",
    tagLocked: "已鎖定",
    youPsy: "你是出題人",
    secret: "只有你看得到目標位置，別讓其他人偷看",
    hintLabel: "你的提示",
    hintSub: "一個詞語或一句話",
    hintPh: "例如：沙拉加起司醬",
    hintHelp: (l, r) => `想一樣事物，在「${l} ↔ ${r}」之間剛好落在藍色 4 分區`,
    send: "送出提示",
    swap: "換題",
    thinking: (n) => `${n} 正在想提示…`,
    waitHint: "等待出題人給提示，可以先想想這條光譜",
    hintOf: (n) => `${n} 的提示`,
    dragHelp: "把指針拖到你認為正確的位置",
    fine: "微調",
    lock: "鎖定答案",
    lockedTitle: "已鎖定",
    lockCount: (a, b) => `已鎖定 ${a} / ${b}`,
    psyWatch: "大家正在猜，看看他們有多懂你",
    sliderLabel: (l, r) => `指針位置，0 是「${l}」，100 是「${r}」`,
    target: "目標",
    reveal: "揭曉",
    diffLine: (v, d) => `${v} · 相差 ${d}`,
    verdict: { 4: "正中紅心", 3: "非常接近", 2: "擦邊", 0: "相差太遠" },
    noGuess: "沒有作答",
    psyGets: (n) => `出題人 ${n} · 獲得全隊平均分`,
    skipped: "出題人超時未給提示，本題跳過",
    nextPsy: (n, i, t) => `下一位出題人：${n}（第 ${i} / ${t} 位）`,
    nextRound: (r, n) => `進入 Round ${r} · 下一位出題人：${n}`,
    last: "最後一題，準備結算",
    you: "你",
    endedEarly: "提前結算",
    done: (n) => `共進行了 ${n} 題`,
    winTitle: "心中最有數！",
    tieTitle: "心中同樣有數！",
    noWinner: "本局沒有人得分",
    ranking: "排名",
    bulls: (n) => `正中紅心 ${n} 次`,
    lobby: "返回大廳",
    again: "再玩一局",
    waitHost: "等待房主決定是否再玩",
    endEarly: "提前結算",
    confirmEnd: "確定要提前結算嗎？結算後無法繼續本局。",
    errEmpty: "請先輸入提示。",
    errLong: "提示最多 20 個字。",
    lobbyLine: (r, s) => `${r} 回合 · 猜測 ${s} 秒 · 出提示 45 秒 · 台灣版`,
    lobbyCount: (n, q, a, b) => `目前 ${n} 人：共 ${q} 題 · 約 ${a}–${b} 分鐘`,
    lobbyNote: "每一回合中，每人輪流擔任一次出題人",
    preview: (q, a, b) => `以 4 人為例：共 ${q} 題 · 約 ${a}–${b} 分鐘`
  }
};

const G9_HINT_MAX = 20;
const G9_ZONES = [
  { from: -10, to: -6, pts: 2, fill: "#F5B82E" },
  { from: -6, to: -2, pts: 3, fill: "#F26A3D" },
  { from: -2, to: 2, pts: 4, fill: "#5FA8C6" },
  { from: 2, to: 6, pts: 3, fill: "#F26A3D" },
  { from: 6, to: 10, pts: 2, fill: "#F5B82E" }
];

function g9T(lang) {
  const key = lang || (S.room?.language === "zh" ? "zh" : "yue");
  return G9_TEXT[key === "zh" ? "zh" : "yue"];
}

// 揭曉轉盤上面嘅名牌：用名嘅第一個字；同其他人撞（例如「阿明」「阿詩」）就用最後一個字，再撞就用頭兩個字。
function g9Initial(id) {
  const chars = (n) => [...(n || "?")];
  const players = S.room?.players || [];
  const mine = chars(players.find((p) => p.id === id)?.nickname);
  const others = players.filter((p) => p.id !== id).map((p) => chars(p.nickname));
  const first = mine[0];
  if (!others.some((o) => o[0] === first)) return first;
  const last = mine[mine.length - 1];
  if (mine.length > 1 && !others.some((o) => o[0] === last || o[o.length - 1] === last)) return last;
  return mine.slice(0, 2).join("");
}

function g9Nick(id) {
  if (id && id === S.playerId) return g9T().you;
  return S.room?.players?.find((p) => p.id === id)?.nickname || "玩家";
}

// 每題大約 1–1.5 分鐘（出提示 ≤45 秒 + 估 + 揭曉）。
function g9Estimate(questions) {
  return [questions, Math.ceil(questions * 1.5)];
}

function renderG9Preview() {
  const box = $("#g9Preview");
  if (!box) return;
  const t = g9T(S.selectedLanguage === "zh" ? "zh" : "yue");
  const q = 4 * (S.g9Rounds || 2);
  const [a, b] = g9Estimate(q);
  box.textContent = t.preview(q, a, b);
}

function g9LobbyHtml(room) {
  const t = g9T();
  const st = room.g9Settings;
  const n = room.players.filter((p) => p.connected).length;
  const q = n * st.rounds;
  const [a, b] = g9Estimate(q);
  return `
    <p class="notice" style="margin:10px 0 0">${esc(t.lobbyLine(st.rounds, Math.round(st.guessMs / 1000)))}</p>
    <div class="g9-lobby">
      <strong>${esc(t.lobbyCount(n, q, a, b))}</strong>
      <small>${esc(t.lobbyNote)}</small>
    </div>
  `;
}

/* ---- 轉盤 ---- */

function g9Pt(v, r) {
  const a = Math.PI * (1 - v / 100);
  return [+(170 + r * Math.cos(a)).toFixed(2), +(170 - r * Math.sin(a)).toFixed(2)];
}

function g9Sector(v1, v2) {
  const a = Math.max(0, Math.min(100, v1));
  const b = Math.max(0, Math.min(100, v2));
  if (b - a <= 0) return "";
  const [x1, y1] = g9Pt(a, 156);
  const [x2, y2] = g9Pt(b, 156);
  return `M170 170 L${x1} ${y1} A156 156 0 0 1 ${x2} ${y2} Z`;
}

function g9Ticks() {
  let d = "";
  for (let v = 0; v <= 100; v += 5) {
    const [x1, y1] = g9Pt(v, v % 25 === 0 ? 138 : 146);
    const [x2, y2] = g9Pt(v, 156);
    d += `M${x1} ${y1}L${x2} ${y2}`;
  }
  return d;
}

// opts: target（null 就唔顯示分區）、value（自己支指針）、marks（揭曉時各人指針）、interactive、label
function g9DialSvg(opts = {}) {
  const T = opts.target;
  let zones = "";
  if (T !== null && T !== undefined) {
    zones = G9_ZONES.map((z) => {
      const d = g9Sector(T + z.from, T + z.to);
      if (!d) return "";
      const lo = Math.max(0, T + z.from);
      const hi = Math.min(100, T + z.to);
      const label = hi - lo >= 2.5
        ? (() => { const [x, y] = g9Pt((lo + hi) / 2, 128); return `<text x="${x}" y="${y}" class="g9-zone-n">${z.pts}</text>`; })()
        : "";
      return `<path d="${d}" fill="${z.fill}"></path>${label}`;
    }).join("");
  }

  const marks = (opts.marks || []).map((m) => {
    const [x, y] = g9Pt(m.value, 130);
    return `
      <line x1="170" y1="170" x2="${x}" y2="${y}" class="g9-mark-line ${m.me ? "me" : ""}"></line>
      <g class="g9-mark ${m.me ? "me" : ""}">
        <circle cx="${x}" cy="${y}" r="14"></circle>
        <text x="${x}" y="${y}">${esc(m.label)}</text>
      </g>`;
  }).join("");

  let needle = "";
  if (opts.value !== null && opts.value !== undefined) {
    const [x, y] = g9Pt(opts.value, 132);
    const live = !!opts.interactive;
    needle = `
      <line ${live ? 'id="g9Needle"' : ""} x1="170" y1="170" x2="${x}" y2="${y}" class="g9-needle"></line>
      <circle ${live ? 'id="g9Knob"' : ""} cx="${x}" cy="${y}" r="11" class="g9-knob"></circle>`;
  }

  const a11y = opts.interactive
    ? `id="g9Dial" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${opts.value}" aria-label="${esc(opts.label || "")}"`
    : `role="img" aria-label="${esc(opts.label || "")}"`;

  return `
    <svg class="g9-dial ${opts.interactive ? "live" : ""}" viewBox="0 0 340 180" ${a11y}>
      <path d="M10 170 A160 160 0 0 1 330 170 Z" class="g9-face"></path>
      ${zones}
      <path d="${g9Ticks()}" class="g9-ticks"></path>
      ${marks}
      ${needle}
      <circle cx="170" cy="170" r="20" class="g9-hub"></circle>
      <circle cx="170" cy="170" r="7" class="g9-hub-dot"></circle>
    </svg>
  `;
}

function g9SpectrumRow(sp) {
  if (!sp) return "";
  return `
    <div class="g9-spec">
      <span class="g9-end left">← ${esc(sp.left)}</span>
      <span class="g9-end right">${esc(sp.right)} →</span>
    </div>
  `;
}

function g9Head(game, pill) {
  const t = g9T();
  return `
    <div class="g9-head">
      <div>
        <div class="eyebrow">${esc(t.roundLabel(game.round, game.totalRounds))} · ${esc(t.turnLabel(game.turnIndex + 1, game.turnCount))}</div>
        ${pill ? `<span class="g9-pill">${esc(pill)}</span>` : ""}
      </div>
      ${game.endsAt && game.phase !== "gameover" ? `<div id="time" class="timer"></div>` : ""}
    </div>
  `;
}

/* ---- 主畫面 ---- */

function renderGame9(game) {
  const me = S.playerId;
  const isPsy = game.psychicId === me;
  const isGuesser = (game.guesserIds || []).includes(me);
  const locked = game.myGuess !== null && game.myGuess !== undefined;

  // 估緊嘅時候，其他人鎖定唔使成個畫面重畫（費事打斷拖緊嘅指針），淨係更新數字。
  const key = JSON.stringify([
    game.phase, game.turnNo, game.spectrum?.id, game.swapsLeft, game.hint, locked,
    game.target, S.room?.language, game.skipped,
    game.phase === "gameover" ? (game.ranking || []).map((p) => p.id + p.score).join() : ""
  ]);
  if (S.g9Key === key && $("#gamePanel .g9-root")) {
    g9UpdateLockCount(game);
    return;
  }
  S.g9Key = key;

  if (game.phase === "gameover") return renderGame9Gameover(game);
  if (game.phase === "reveal") return renderGame9Reveal(game);
  if (game.phase === "hint") return isPsy ? renderGame9Psychic(game) : renderGame9WaitHint(game);
  if (game.phase === "guess") {
    if (isGuesser && !locked) return renderGame9Guess(game);
    return renderGame9Watch(game, isPsy);
  }
}

function g9UpdateLockCount(game) {
  const el = $("#g9LockCount");
  if (el) el.textContent = g9T().lockCount((game.lockedIds || []).length, (game.guesserIds || []).length);
}

function renderGame9Psychic(game) {
  const t = g9T();
  const sp = game.spectrum;
  S.g9Draft = S.g9DraftTurn === game.turnNo ? (S.g9Draft || "") : "";
  S.g9DraftTurn = game.turnNo;

  $("#gamePanel").innerHTML = `
    <div class="g9-root">
      ${g9Head(game, t.youPsy)}
      <div class="g9-secret">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        <span>${esc(t.secret)}</span>
      </div>
      <div class="g9-board">
        ${g9DialSvg({ target: game.target, label: `${t.target} ${game.target}` })}
        <div class="g9-spec-row">
          <span class="g9-end left">← ${esc(sp?.left || "")}</span>
          <button type="button" class="g9-swap" onclick="g9Swap()" ${game.swapsLeft > 0 ? "" : "disabled"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"></path><path d="M3 21v-5h5"></path></svg>
            ${esc(t.swap)} (${game.swapsLeft || 0})
          </button>
          <span class="g9-end right">${esc(sp?.right || "")} →</span>
        </div>
      </div>
      <form class="g9-hint-form" onsubmit="event.preventDefault();g9SendHint()">
        <label class="g9-hint-field">
          <span class="g9-label"><span>${esc(t.hintLabel)}</span><span id="g9HintLen">${[...S.g9Draft].length} / ${G9_HINT_MAX}</span></span>
          <input id="g9Hint" type="text" maxlength="${G9_HINT_MAX * 2}" autocomplete="off" placeholder="${esc(t.hintPh)}" value="${esc(S.g9Draft)}">
        </label>
        <p class="g9-help">${esc(t.hintHelp(sp?.left || "", sp?.right || ""))}</p>
        <button type="submit" class="btn btn-yellow g9-cta">${esc(t.send)}</button>
      </form>
    </div>
  `;

  const input = $("#g9Hint");
  input?.addEventListener("input", () => {
    S.g9Draft = input.value;
    const n = [...input.value.trim()].length;
    const len = $("#g9HintLen");
    if (len) {
      len.textContent = `${n} / ${G9_HINT_MAX}`;
      len.classList.toggle("over", n > G9_HINT_MAX);
    }
  });
  if (input && window.matchMedia("(pointer:fine)").matches) input.focus();
  startTimer($("#time"), game.endsAt);
}

function renderGame9WaitHint(game) {
  const t = g9T();
  $("#gamePanel").innerHTML = `
    <div class="g9-root">
      ${g9Head(game, t.tagPsy + "：" + g9Nick(game.psychicId))}
      <h2 class="g9-big">${esc(t.thinking(g9Nick(game.psychicId)))}</h2>
      <div class="g9-board">
        ${g9DialSvg({ label: t.waitHint })}
        ${g9SpectrumRow(game.spectrum)}
      </div>
      <p class="g9-note">${esc(t.waitHint)}</p>
    </div>
  `;
  startTimer($("#time"), game.endsAt);
}

function g9HintCard(game) {
  const t = g9T();
  return `
    <div class="g9-hint-card">
      <div class="g9-hint-eyebrow">${esc(t.hintOf(g9Nick(game.psychicId)))}</div>
      <div class="g9-hint-text">${esc(game.hint)}</div>
    </div>
  `;
}

function renderGame9Guess(game) {
  const t = g9T();
  S.g9Vals = S.g9Vals || {};
  if (S.g9Vals[game.turnNo] === undefined) S.g9Vals[game.turnNo] = 50;
  const v = S.g9Vals[game.turnNo];
  const sp = game.spectrum || { left: "", right: "" };

  $("#gamePanel").innerHTML = `
    <div class="g9-root">
      ${g9Head(game, t.tagPsy + "：" + g9Nick(game.psychicId))}
      ${g9HintCard(game)}
      <div class="g9-board">
        ${g9DialSvg({ value: v, interactive: true, label: t.sliderLabel(sp.left, sp.right) })}
        <div class="g9-spec-row">
          <span class="g9-end left">← ${esc(sp.left)}</span>
          <strong id="g9Val" class="g9-val">${v}</strong>
          <span class="g9-end right">${esc(sp.right)} →</span>
        </div>
        <label class="g9-fine">
          <span>${esc(t.fine)}</span>
          <input id="g9Range" type="range" min="0" max="100" step="1" value="${v}" aria-label="${esc(t.sliderLabel(sp.left, sp.right))}">
        </label>
      </div>
      <p class="g9-note"><span>${esc(t.dragHelp)}</span> · <span id="g9LockCount">${esc(t.lockCount((game.lockedIds || []).length, (game.guesserIds || []).length))}</span></p>
      <button type="button" class="btn btn-dark g9-cta" onclick="g9Lock()">${esc(t.lock)}</button>
    </div>
  `;

  g9BindDial(game.turnNo);
  startTimer($("#time"), game.endsAt);
}

function g9SetVal(turnNo, v) {
  v = Math.max(0, Math.min(100, Math.round(v)));
  S.g9Vals[turnNo] = v;
  const [x, y] = g9Pt(v, 132);
  $("#g9Needle")?.setAttribute("x2", x);
  $("#g9Needle")?.setAttribute("y2", y);
  $("#g9Knob")?.setAttribute("cx", x);
  $("#g9Knob")?.setAttribute("cy", y);
  $("#g9Dial")?.setAttribute("aria-valuenow", v);
  const out = $("#g9Val");
  if (out) out.textContent = String(v);
  const range = $("#g9Range");
  if (range && Number(range.value) !== v) range.value = String(v);
}

function g9BindDial(turnNo) {
  const svg = $("#g9Dial");
  if (!svg) return;
  let dragging = false;
  const valueAt = (e) => {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) * (340 / r.width);
    const y = (e.clientY - r.top) * (180 / r.height);
    const a = Math.atan2(Math.max(170 - y, 0.0001), x - 170);
    return (1 - a / Math.PI) * 100;
  };
  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    try { svg.setPointerCapture(e.pointerId); } catch {}
    g9SetVal(turnNo, valueAt(e));
    e.preventDefault();
  });
  svg.addEventListener("pointermove", (e) => { if (dragging) g9SetVal(turnNo, valueAt(e)); });
  const stop = () => { dragging = false; };
  svg.addEventListener("pointerup", stop);
  svg.addEventListener("pointercancel", stop);
  svg.addEventListener("keydown", (e) => {
    const cur = S.g9Vals[turnNo];
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
    if (step !== undefined) { g9SetVal(turnNo, cur + step); e.preventDefault(); }
    else if (e.key === "Home") { g9SetVal(turnNo, 0); e.preventDefault(); }
    else if (e.key === "End") { g9SetVal(turnNo, 100); e.preventDefault(); }
  });
  $("#g9Range")?.addEventListener("input", (e) => g9SetVal(turnNo, Number(e.target.value)));
}

function renderGame9Watch(game, isPsy) {
  const t = g9T();
  const mine = game.myGuess;
  const sp = game.spectrum || { left: "", right: "" };
  $("#gamePanel").innerHTML = `
    <div class="g9-root">
      ${g9Head(game, isPsy ? t.youPsy : t.lockedTitle)}
      ${g9HintCard(game)}
      <div class="g9-board">
        ${isPsy
          ? g9DialSvg({ target: game.target, label: `${t.target} ${game.target}` })
          : g9DialSvg({ value: mine, label: `${mine}` })}
        <div class="g9-spec-row">
          <span class="g9-end left">← ${esc(sp.left)}</span>
          ${isPsy ? "" : `<strong class="g9-val">${mine ?? ""}</strong>`}
          <span class="g9-end right">${esc(sp.right)} →</span>
        </div>
      </div>
      <p class="g9-note">${isPsy ? `${esc(t.psyWatch)} · ` : ""}<span id="g9LockCount">${esc(t.lockCount((game.lockedIds || []).length, (game.guesserIds || []).length))}</span></p>
    </div>
  `;
  startTimer($("#time"), game.endsAt);
}

function renderGame9Reveal(game) {
  const t = g9T();
  const sp = game.spectrum || { left: "", right: "" };
  const next = game.next || {};
  let nextLine = "";
  if (next.last) nextLine = t.last;
  else if (next.psychicId) {
    nextLine = next.round !== game.round
      ? t.nextRound(next.round, g9Nick(next.psychicId))
      : t.nextPsy(g9Nick(next.psychicId), (next.turnIndex ?? 0) + 1, game.turnCount);
  }

  if (game.skipped || !game.result) {
    $("#gamePanel").innerHTML = `
      <div class="g9-root">
        ${g9Head(game, t.reveal)}
        <h2 class="g9-big">${esc(t.skipped)}</h2>
        <div class="g9-board">
          ${g9DialSvg({ target: game.target, label: `${t.target} ${game.target ?? ""}` })}
          ${g9SpectrumRow(sp)}
        </div>
        <p class="g9-note g9-push">${esc(nextLine)}</p>
      </div>
    `;
    startTimer($("#time"), game.endsAt);
    return;
  }

  const r = game.result;
  const marks = r.guesses.map((g) => ({ value: g.value, label: g9Initial(g.id), me: g.id === S.playerId }));
  // 自己支指針畫最後，唔會俾人遮住。
  marks.sort((a, b) => Number(a.me) - Number(b.me));

  const rows = r.guesses.map((g) => `
    <div class="g9-row ${g.id === S.playerId ? "me" : ""} ${g.points === 4 ? "bull" : ""}">
      <div class="g9-row-main">
        <strong>${esc(g9Nick(g.id))}</strong>
        <small>${esc(t.diffLine(g.value, g.diff))} · ${esc(t.verdict[g.points])}</small>
      </div>
      <b class="${g.points ? "" : "zero"}">+${g.points}</b>
    </div>
  `).join("");
  const missing = (r.missing || []).map((id) => `
    <div class="g9-row miss"><div class="g9-row-main"><strong>${esc(g9Nick(id))}</strong><small>${esc(t.noGuess)}</small></div><b class="zero">+0</b></div>
  `).join("");

  $("#gamePanel").innerHTML = `
    <div class="g9-root">
      ${g9Head(game, t.reveal)}
      <div class="g9-reveal-top">
        ${g9HintCard(game)}
        <div class="g9-target"><span>${esc(t.target)}</span><strong>${r.target}</strong></div>
      </div>
      <div class="g9-board">
        ${g9DialSvg({ target: r.target, marks, label: `${t.target} ${r.target}` })}
        ${g9SpectrumRow(sp)}
      </div>
      <div class="g9-rows">${rows}${missing}</div>
      <div class="g9-psy-row"><span>${esc(t.psyGets(g9Nick(game.psychicId)))}</span><b>+${r.psychicPoints}</b></div>
      <p class="g9-note g9-push">${esc(nextLine)}</p>
    </div>
  `;
  startTimer($("#time"), game.endsAt);
}

function renderGame9Gameover(game) {
  const t = g9T();
  clearInterval(S.timer);
  const ranking = game.ranking || [];
  const top = ranking.length ? ranking[0].score : 0;
  const winners = top > 0 ? ranking.filter((p) => p.score === top) : [];
  const isHost = S.room.hostId === S.playerId;
  const rankOf = (score) => 1 + ranking.filter((p) => p.score > score).length;

  $("#gamePanel").innerHTML = `
    <div class="g9-root g9-result">
      <div>
        <div class="eyebrow">${esc(game.endedEarly ? t.endedEarly : t.done(game.turnNo || 0))}</div>
        <h2 class="g9-big">${esc(winners.length > 1 ? t.tieTitle : winners.length ? t.winTitle : t.noWinner)}</h2>
      </div>
      ${winners.length ? `
        <div class="g9-winners">
          ${winners.map((p) => `
            <div class="g9-win">
              <svg class="g9-win-icon" width="64" height="40" viewBox="0 0 64 40" aria-hidden="true">
                <path d="M4 36 A28 28 0 0 1 60 36 Z" fill="#fff" stroke="#1f2740" stroke-width="3" stroke-linejoin="round"/>
                <path d="M32 36 L26.2 10.6 A26 26 0 0 1 37.8 10.6 Z" fill="#5FA8C6"/>
                <path d="M32 36 L32 12" stroke="#E0284A" stroke-width="4" stroke-linecap="round"/>
                <circle cx="32" cy="36" r="5.5" fill="#E0284A" stroke="#1f2740" stroke-width="2.5"/>
              </svg>
              <strong>${esc(g9Nick(p.id))}</strong>
              <small>${p.score} 分 · ${esc(t.bulls(p.bulls || 0))}</small>
            </div>
          `).join("")}
        </div>
      ` : ""}
      <div>
        <div class="eyebrow">${esc(t.ranking)}</div>
        <div class="g9-rank">
          ${ranking.map((p) => `
            <div class="g9-rank-row ${winners.some((w) => w.id === p.id) ? "first" : ""} ${p.id === S.playerId ? "me" : ""}">
              <span>${rankOf(p.score)}</span>
              <span class="g9-rank-name">${esc(p.nickname)}${p.id === S.playerId ? `（${esc(t.you)}）` : ""}<small>${esc(t.bulls(p.bulls || 0))}</small></span>
              <b>${p.score}</b>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="g9-actions">
        <button type="button" class="btn btn-outline" onclick="leaveRoom()">${esc(t.lobby)}</button>
        ${isHost ? `<button type="button" class="btn btn-dark" onclick="g9Restart()">${esc(t.again)}</button>` : `<p class="g9-note">${esc(t.waitHost)}</p>`}
      </div>
    </div>
  `;
}

window.g9Swap = () => {
  send({ type: "g9:swap" });
};

window.g9SendHint = () => {
  const t = g9T();
  const input = $("#g9Hint");
  const text = (input?.value || "").replace(/\s+/g, " ").trim();
  if (!text) { flash(t.errEmpty); input?.focus(); return; }
  if ([...text].length > G9_HINT_MAX) { flash(t.errLong); input?.focus(); return; }
  send({ type: "g9:hint", text });
};

window.g9Lock = () => {
  const game = S.room?.gameState;
  if (!game || game.phase !== "guess") return;
  const v = S.g9Vals?.[game.turnNo];
  send({ type: "g9:guess", value: Number.isInteger(v) ? v : 50 });
};

window.g9Restart = () => {
  send({ type: "g9:restart" });
};

window.g9EndEarly = async () => {
  const ok = await askConfirm(g9T().confirmEnd);
  if (!ok) return;
  send({ type: "g9:end" });
};
