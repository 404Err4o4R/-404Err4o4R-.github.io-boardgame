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

  if (S.selectedGame === "game3") {
    if (catSection) catSection.style.display = "none";
    if (roundsSection) roundsSection.classList.remove("hidden");
    if (langSection) langSection.classList.add("hidden");
    if (g4Section) g4Section.classList.add("hidden");
    return;
  }

  if (S.selectedGame === "game4") {
    if (catSection) catSection.style.display = "none";
    if (roundsSection) roundsSection.classList.add("hidden");
    if (langSection) langSection.classList.add("hidden");
    if (g4Section) g4Section.classList.remove("hidden");
    return;
  }

  if (catSection) catSection.style.display = "";
  if (roundsSection) roundsSection.classList.add("hidden");
  if (g4Section) g4Section.classList.add("hidden");

  if (langSection) {
    langSection.classList.toggle("hidden", S.selectedGame !== "game1");
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
        ${esc(category)}
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
    <div class="game-cover cover-g1">
      <div class="gc-dot"></div>
      <div class="gc-icon top">
        <svg viewBox="0 0 24 24"><path d="M4 5 H20 V15 H10 L6 19 V15 H4 Z" fill="#FEFEF2"/></svg>
      </div>
      <div class="gc-icon bottom">
        <svg viewBox="0 0 24 24"><path d="M4 5 H20 V15 H10 L6 19 V15 H4 Z" fill="#FEFEF2"/></svg>
      </div>
      <div class="gc-label eyebrow">TWO CHOICES</div>
      <div class="gc-label bottom">2–6 PLAYERS</div>
    </div>
  `,
  game2: `
    <div class="game-cover cover-g2">
      <div class="gc-icon">
        <svg viewBox="0 0 24 24">
          <path d="M4 9 Q4 5 12 5 Q20 5 20 9 Q20 15 15 15 Q13 15 12 17 Q11 15 9 15 Q4 15 4 9Z" fill="#F0EDE5"/>
          <circle cx="9" cy="9.5" r="1.3" fill="#004643"/>
          <circle cx="15" cy="9.5" r="1.3" fill="#004643"/>
        </svg>
      </div>
      <div class="gc-label eyebrow">BLUFF</div>
      <div class="gc-label mid">GUESS RIGHT</div>
      <div class="gc-label bottom">2–6 PLAYERS</div>
    </div>
  `,
  game3: `
    <div class="game-cover cover-g3">
      <div class="gc-number">10</div>
      <div class="gc-icon">
        <svg viewBox="0 0 24 24"><path d="M12 21C7 17 3 13.5 3 9.5C3 6.9 5 5 7.5 5C9.5 5 11 6.2 12 7.8C13 6.2 14.5 5 16.5 5C19 5 21 6.9 21 9.5C21 13.5 17 17 12 21Z" fill="#fff"/></svg>
      </div>
      <div class="gc-label rate">RATE FREELY</div>
      <div class="gc-label script">NO SCRIPT</div>
      <div class="gc-label bottom">2–6 PLAYERS</div>
    </div>
  `,
  game4: `
    <div class="game-cover cover-g4">
      <div class="gc-icon">
        <svg viewBox="0 0 24 24">
          <circle cx="9" cy="9" r="6" fill="none" stroke="#FFD166" stroke-width="2.5"/>
          <line x1="14" y1="14" x2="20" y2="20" stroke="#FFD166" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="9" cy="9" r="2.5" fill="#fff" opacity=".6"/>
        </svg>
      </div>
      <div class="gc-label eyebrow">MOST LIKELY TO</div>
      <div class="gc-label bottom">3–6 PLAYERS</div>
    </div>
  `
};

const GAME_ACCENTS = {
  game1: "#68779f",
  game2: "#004643",
  game3: "#F2795F",
  game4: "#7B57CE"
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
});

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

    const res = await fetch(`${HTTP_BASE}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: S.selectedGame,
        filters: { categories: S.filters },
        rounds: S.selectedGame === "game3" ? (S.selectedRounds || null) : null,
        writeSeconds: S.selectedGame === "game3" ? (S.selectedWriteSeconds || 60) : null,
        language: S.selectedGame === "game1" ? (S.selectedLanguage || "yue") : null,
        g4Rounds: S.selectedGame === "game4" ? (S.selectedG4Rounds || 20) : null,
        g4Anonymous: S.selectedGame === "game4" ? (S.selectedG4Anonymous !== false) : null
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
    `<div class="status error">${esc(text)}</div>`
  );
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
          ${
            room.game === "game1"
              ? "心有靈犀一點通"
              : room.game === "game2"
              ? "9upper瞎掰王"
              : room.game === "game3"
              ? "He/She's a 10"
              : room.game === "game4"
              ? "Most Likely To 邊個至似"
              : "未知遊戲"
          }
        </b>
      </div>
    </div>

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
      夠人就可以開始。
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
    "肯定開始遊戲？"
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
    <div class="row" style="justify-content:space-between;align-items:center">
      <div class="eyebrow">SCOREBOARD</div>
      <div class="eyebrow">${esc(room.code)}</div>
    </div>

    <div class="players">
      ${sorted
        .map((p) => {
          const isHost = p.id === room.hostId;
          const isRater = raterId && p.id === raterId;
          const isNextRater = nextRaterId && p.id === nextRaterId;

          return `
            <div class="player ${isHost ? "host" : ""}" style="opacity:${p.connected ? "1" : ".5"}">
              <div>
                ${
                  isHost
                    ? `<span class="host-crown"><svg viewBox="0 0 24 24"><path d="M3 9 L7 12 L12 6 L17 12 L21 9 L19 16 L5 16 Z" fill="#F2D965"/><circle cx="3" cy="9" r="1.4" fill="#1f2740"/><circle cx="12" cy="6" r="1.4" fill="#1f2740"/><circle cx="21" cy="9" r="1.4" fill="#1f2740"/></svg></span>`
                    : ""
                }
                ${esc(p.nickname)}
                ${isRater ? '<span class="notice" style="margin:0">（莊家）</span>' : ""}
                ${isNextRater ? '<span class="notice" style="margin:0;color:var(--game-accent)">（下一位莊家）</span>' : ""}
              </div>
              <b>${p.score || 0}</b>
            </div>
          `;
        })
        .join("")}
    </div>

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

  if (!game) {
    $("#gamePanel").innerHTML = `
      <div class="eyebrow">
        READY
      </div>

      <h2 class="title">
        WAIT FOR<br>
        <span>YOUR FRIENDS.</span>
      </h2>

      <p class="notice">
        夠人數之後，房主就可以開始。
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
  } else {
    renderGame2(game);
  }
}

function startTimer(element, endsAt) {
  clearInterval(S.timer);

  if (!element || !endsAt) return;

  const update = () => {
    const remaining =
      Math.max(0, endsAt - Date.now());

    element.textContent =
      (remaining / 1000)
        .toFixed(1) + "s";
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
        ROUND ${game.round}
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
            ROUND ${game.round}
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
  style="
    background:${
      myVote === index
        ? "var(--yellow)"
        : "#fff"
    };
    border-color:${
      myVote === index
        ? "var(--yellow-deep)"
        : "#e7e9ee"
    };
  "
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
        10 秒投票。
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
      ? "諗樣（公開）"
      : S.role === "truth"
        ? "老實人"
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
              <b>正確解釋：</b>
              ${esc(S.explanation)}
            </p>
          `
          : ""
      }
    </div>
  `;
}

function renderGame2(game) {

  let html = `
    <div
      class="row"
      style="justify-content:space-between;align-items:end"
    >
      <div>
        <div class="eyebrow">
          9UPPER BLUFF GAME
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
        睇題目 30 秒。
        只有老實人收到正確解釋。
      </div>

      <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button
          id="prepReadyBtn"
          class="btn ${myReady ? "btn-green" : "btn-ready"}"
          ${myReady ? "disabled" : ""}
          onclick="ready2()"
        >
          ${myReady ? "✓ Ready" : "準備好"}
        </button>

        <span class="notice">
          ${game.prepReadyCount || 0}/${game.prepTotal || 0} 人準備好，
          全部準備好就唔使等夠 30 秒。
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
              10 秒內揀下一位發言。
              唔揀就隨機。
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
              諗樣揀緊下一位發言（仲有 ${left} 位未講）。
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
        而家發言：
        <b>
          ${esc(
            active?.nickname || ""
          )}
        </b>

        ${
          mine
            ? " · 輪到你喇，30 秒。"
            : ""
        }

        <span class="muted">
          （${(game.spokenIds || []).length}/${(game.order || []).length} 已發言）
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
              ? "打你嘅解釋…"
              : "等緊發言…"
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
        WHO IS THE 老實人
      </div>

      ${
        isJudge
          ? `
            <div class="status">
              2 分鐘內揀出你認為嘅老實人。
              唔揀就隨機。
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
              諗樣有 2 分鐘揀出老實人。
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
            ? "✅ 諗樣估中咗！"
            : "❌ 諗樣估錯咗！"
        }
      </div>

      <p class="notice">
        真正嘅老實人：
        <b>
          ${esc(
            game.truthNickname
          )}
        </b>
        <br>

        正確解釋：
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
              NEXT ROUND
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
    if (counter) counter.textContent = `已交：${game.submittedCount} / ${game.totalToSubmit}`;

    const btn = document.querySelector('[onclick="g3Submit()"]');
    if (btn && game.mySubmitted && btn.dataset.submitted !== "1") {
      btn.dataset.submitted = "1";
      btn.textContent = "✓ 你已交題";
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
        今輪你係莊家，唔使寫嘢。等緊其他人交題…
        <span id="g3SubmitCount">已交：${game.submittedCount} / ${game.totalToSubmit}</span>
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

      <p class="notice">莊家：${esc(game.raterNickname)}</p>

      <div class="question">
        莊家心水數字係
        <b style="color:#fff;font-size:1.3em">${game.myTarget}</b>
        分。寫一句「佢係十分，但係___」，愈貼近呢個分，你嘅分數先會愈高。
      </div>

      <div class="answerbox">
        <textarea
          id="g3AnswerBox"
          maxlength="25"
          placeholder="佢係十分，但係……"
          oninput="g3UpdateCount()"
          ${game.mySubmitted ? "disabled" : ""}
        ></textarea>
      </div>

      <p class="notice">
        <span id="g3SubmitCount">已交：${game.submittedCount} / ${game.totalToSubmit}</span>
        ·
        <span id="g3CharCount">0 / 25</span>
      </p>

      <button
        class="btn ${game.mySubmitted ? "btn-green" : "btn-yellow"} wide"
        onclick="g3Submit()"
        data-submitted="${game.mySubmitted ? "1" : "0"}"
        ${game.mySubmitted ? "disabled" : ""}
      >
        ${game.mySubmitted ? "✓ 你已交題" : "交題"}
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
    `確定要交呢句？交咗就唔可以再改：「${text}」`
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
          ? `<p class="notice">莊家未開始評分，投一票你覺得最WTF嗰句：</p>`
          : `<p class="notice">
              莊家 ${esc(game.raterNickname)} 評緊分…… (${idx + 1} / ${game.totalAnswers})
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
                        ${game.myWtfVote === i ? "✓ 最WTF" : "投WTF"}
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
      <h2 class="title">評分時間<br><span>睇晒先評分。</span></h2>

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
        開始逐句評分
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
        <div class="eyebrow">評分 ${idx + 1} / ${game.totalAnswers}</div>
        <h2 class="title">呢句幾多分？</h2>
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
      確認評分
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
        <h2 class="title">結果<br><span>揭曉。</span></h2>
      </div>
      <div id="time" class="timer"></div>
    </div>

    <div id="g3ResultsList"></div>

    ${
      game.isFinalRound
        ? `<p class="notice">最後一round！結算緊……</p>`
        : `<p class="notice">下一round就快開始……</p>`
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
          ${game.wtfWinnerId === r.playerId ? '<span class="notice" style="margin:0 0 0 6px">🤯 全場最WTF</span>' : ""}
          <div class="notice" style="margin:2px 0">${esc(r.text)}</div>
          <div class="notice" style="margin:0">心水 ${r.target} 分 · 莊家俾 ${r.score} 分</div>
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
    <h2 class="title">結算<br><span>He/She's a 10.</span></h2>

    ${
      champion
        ? `<div class="question" style="text-align:center">
            <div style="font-size:13px;opacity:.85">十分知己</div>
            <div style="font-family:'Fredoka';font-size:28px">${esc(champion.nickname)}</div>
            <div style="font-size:13px;opacity:.85">總分 ${champion.score} 分</div>
          </div>`
        : ""
    }

    <div class="answerbox" style="text-align:center;margin-top:10px">
      <div style="font-size:13px;color:var(--game-accent)">全場最WTF</div>
      ${
        wtfChampion
          ? `<div style="font-family:'Fredoka';font-size:22px">${esc(wtfChampion.nickname)}</div>
             <div class="notice" style="margin:0">攞咗 ${wtfChampion.wtfCount} 次最WTF</div>`
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
          <div class="eyebrow" style="margin-top:20px">逐ROUND回顧</div>

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
    <p class="notice">莊家：${esc(h.raterNickname)} · 心水數字 ${h.target} 分</p>

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
                  莊家俾 ${r.score} 分 · 貼近度 +${r.roundPoints}
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

  const bars = tally.map((t) => `
    <div class="g4-bar-row-wrap">
      <div class="g4-bar-row">
        <div class="g4-bar-label">${t.playerId === r.winnerId ? "★ " : ""}${esc(t.nickname)}</div>
        <div class="g4-bar-track">
          <div class="g4-bar-fill" style="width:${(t.count / maxCount) * 100}%;background:var(--game-accent)"></div>
        </div>
        <div class="g4-bar-count">${t.count}</div>
      </div>
      ${voterLine(t.voters)}
    </div>
  `).join("");

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
