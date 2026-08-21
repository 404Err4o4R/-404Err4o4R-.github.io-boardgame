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
  "飲食習慣題": "#2f9e8f",
  "價值觀題": "#d9ab2e",
  "戀愛題": "#c46fa3",
  "情境題": "#5fa151",
  "個人愛好題": "#8272cc",
  "十八禁題": "#d16b63"
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

  if (S.selectedGame === "game3") {
    if (catSection) catSection.style.display = "none";
    return;
  }

  if (catSection) catSection.style.display = "";

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
  `
};

const GAME_ACCENTS = {
  game1: "#68779f",
  game2: "#004643",
  game3: "#F2795F"
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
    button.classList.toggle("active", !allSelected);
  });

  S.filters = allSelected
    ? []
    : buttons.map((button) => button.dataset.category);
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
        filters: { categories: S.filters }
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

  // 遊戲開始咗之後（唔係 waiting 大堂），成個 ROOM CODE + 玩家清單嗰塊冇乜用，
  // 房號同連線狀態頂欄本身已經有,呢度就唔使再佔位。
  const isPlaying =
    room.gameState &&
    room.gameState.phase &&
    room.gameState.phase !== "waiting";

  if (isPlaying) {
    roomPanel.innerHTML = "";
    roomPanel.classList.add("hidden");
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
              : "He/She's a 10"
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
