const CONFIG = window.PLAY_TOGETHER_CONFIG || {};
const API = String(CONFIG.API_BASE_URL || "").replace(/\/+$/, "");
const WS_BASE = API.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
const $ = (selector) => document.querySelector(selector);

const S = {
  socket: null,
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
  questions: null
};

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

function saveSession() {
  if (!S.room || !S.playerId || !S.token) return;

  localStorage.setItem(
    "pt:" + S.room.code,
    JSON.stringify({
      playerId: S.playerId,
      token: S.token,
      nickname: S.nickname
    })
  );
}

function loadSession(code) {
  try {
    return JSON.parse(localStorage.getItem("pt:" + code) || "null");
  } catch {
    return null;
  }
}

function clearSession() {
  if (S.room) {
    localStorage.removeItem("pt:" + S.room.code);
  }
}

/* =========================
   題庫
========================= */

async function loadQuestions() {
  const response = await fetch("./questions.json", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("questions.json 載入失敗。");
  }

  S.questions = await response.json();
  renderCategories();
}

function renderCategories() {
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

  box.innerHTML = categories.map((category) => `
    <button
      type="button"
      class="filter-chip ${S.filters.includes(category) ? "active" : ""}"
      data-category="${esc(category)}"
    >
      ${esc(category)}
    </button>
  `).join("");

  box.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("active");

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

document.querySelectorAll("[data-start]").forEach((button) => {
  button.addEventListener("click", () => {
    S.selectedGame = button.dataset.start;

    const select = $("#gameSelect");

    if (select) {
      select.value = S.selectedGame;
    }

    S.filters = [];

    renderCategories();

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

async function createRoom() {
  try {
    if (!API || API.includes("YOUR-WORKER")) {
      throw new Error("Cloudflare Worker URL 尚未設定。");
    }

    S.nickname =
      $("#createName")?.value.trim() || "玩家";

    const response = await fetch(API + "/api/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        game: S.selectedGame,
        filters: {
          categories: S.filters
        }
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error || "建立房間失敗。"
      );
    }

    await connectRoom(
      data.roomCode,
      "create"
    );

  } catch (error) {
    showError(error.message);
  }
}

async function joinRoom() {
  try {
    if (!API || API.includes("YOUR-WORKER")) {
      throw new Error("Cloudflare Worker URL 尚未設定。");
    }

    const code =
      $("#joinCode")?.value.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      throw new Error("房間號需要 6 位英數字。");
    }

    S.nickname =
      $("#joinName")?.value.trim() || "玩家";

    const saved = loadSession(code);

    await connectRoom(
      code,
      saved ? "reconnect" : "join",
      saved
    );

  } catch (error) {
    showError(error.message);
  }
}

function connectRoom(code, mode, saved = null) {
  return new Promise((resolve, reject) => {
    if (S.socket) {
      S.socket.close();
    }

    S.room = {
      code
    };

    S.chat = [];
    S.role = null;
    S.explanation = null;

    const ws = new WebSocket(
  WS_BASE +
  "/websocket?room=" +
  encodeURIComponent(code)
);

S.socket = ws;

    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;

      finished = true;

      ws.close();

      reject(
        new Error(
          "WebSocket 連線逾時。請確認房間號是否正確。"
        )
      );
    }, 12000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "hello",
        mode,
        nickname: S.nickname,
        playerId: saved?.playerId,
        token: saved?.token
      }));
    };

    ws.onmessage = (event) => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === "welcome" && !finished) {
        finished = true;
        clearTimeout(timeout);
        resolve();
      }

      handleServerMessage(message);
    };

    ws.onerror = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);

        reject(
          new Error(
            "WebSocket 連線失敗。"
          )
        );
      }

      setConnectionStatus("ERROR", false);
    };

    ws.onclose = () => {
      setConnectionStatus(
        "DISCONNECTED",
        false
      );
    };

    showGame();
  });
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
    S.room = message.room;

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

    renderGame();
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

  if (S.socket) {
    S.ws.close();
  }

  clearSession();

  S.room = null;
  S.playerId = null;
  S.token = null;
  S.role = null;
  S.explanation = null;
  S.chat = [];

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
  if (
    S.socket &&
    S.socket.readyState === WebSocket.OPEN
  ) {
    S.socket.send(
      JSON.stringify(message)
    );
  }
}

/* =========================
   Room UI
========================= */

function renderRoom() {
  const room = S.room;

  if (!room?.players) return;

  $("#roomPanel").innerHTML = `
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
              : "9upper瞎掰王"
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
            >
              ${
                player.host
                  ? "👑 "
                  : ""
              }

              ${esc(player.nickname)}

              <span
                style="opacity:.65"
              >
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
      const connectedCount =
        room.players.filter((p) => p.connected).length;

      const canStart = connectedCount >= 2;

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
      <div style="margin-top:15px">
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
      2–6 人即可開始。
    </p>
  `;

const startBtn = $("#startBtn");

startBtn?.addEventListener("click", async () => {
  if (startBtn.disabled) return;

  const ok = await askConfirm(
    "是否確定開始遊戲？"
  );

  if (ok) {
    send({ type: "start" });
  }
});

$("#leaveBtn")?.addEventListener(
  "click",
  leaveRoom
);
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
        房主加入至少 2 位在線玩家後即可開始。
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

function renderGame1(game) {

  if (game.phase === "vote") {

    const votes =
      game.votes || {};

    const myVote =
      votes[S.playerId];

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
        10 秒投票。
        ${
          myVote !== undefined
            ? "你已投票。"
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

    <div class="bars">
      ${
        game.question.options
          .map(
            (option, index) => `
              <div class="barrow">
                <b>
                  ${
                    String.fromCharCode(
                      65 + index
                    )
                  }
                </b>

                <div class="bar">
                  <div
                    class="fill ${
                      game.winner === index
                        ? "win"
                        : ""
                    }"
                    style="width:${Math.max(
                      4,
                      (counts[index] || 0) /
                        (
                          S.room.players.length || 1
                        ) *
                        100
                    )}%"
                  ></div>
                </div>

                <b>
                  ${counts[index] || 0}
                </b>
              </div>
            `
          )
          .join("")
      }
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
          ? "本題打平。"
          : "多數選擇：" +
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

    <div class="eyebrow">
      TALK IT OUT
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
        id="chat1"
        placeholder="說說你的想法…"
      >

      <button
        class="btn blue"
        onclick="chat1()"
      >
        SEND
      </button>

      <button
        class="btn yellow"
        onclick="next1()"
      >
        NEXT QUESTION
      </button>
    </div>

    <p class="notice">
      已準備下一題：
      ${game.nextReadyCount || 0}/
      ${
        S.room.players
          .filter((p) => p.connected)
          .length
      }
    </p>
  `;

  scrollChat();
}

window.vote1 = (index) => {
  send({
    type: "g1:vote",
    option: index
  });
};

window.chat1 = () => {
  const input = $("#chat1");

  if (!input) return;

  const text =
    input.value.trim();

  input.value = "";

  if (text) {
    send({
      type: "g1:chat",
      text
    });
  }
};

window.next1 = () => {
  send({
    type: "g1:next"
  });
};

/* =========================
   Game 2
========================= */

function roleBlock() {
  if (!S.role) return "";

  const label =
    S.role === "judge"
      ? "法官（公開）"
      : S.role === "truth"
        ? "知情人"
        : "騙子";

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
    html += `
      <div class="status">
        準備 30 秒。
        只有直言者收到正確解釋。
      </div>
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
        目前發言：
        <b>
          ${esc(
            active?.nickname || ""
          )}
        </b>

        ${
          mine
            ? " · 輪到你了。"
            : ""
        }
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
              ? "輸入你的解釋…"
              : "等待發言…"
          }"
        >

        <button
          class="btn blue"
          ${
            mine
              ? ""
              : "disabled"
          }
          onclick="chat2()"
        >
          SEND
        </button>
      </div>
    `;

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
        JUDGE
      </div>

      ${
        isJudge
          ? `
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
              法官正在選擇他認為的直言者。
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
            ? "✅ 法官猜中了！"
            : "❌ 法官猜錯了！"
        }
      </div>

      <p class="notice">
        真正直言者：
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

      <div class="players">
        ${
          S.room.players
            .map(
              (player) => `
                <div class="player">
                  ${esc(
                    player.nickname
                  )}
                  ·
                  ${player.score || 0}
                  分
                </div>
              `
            )
            .join("")
        }
      </div>

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

  if (!input) return;

  const text =
    input.value.trim();

  input.value = "";

  if (text) {
    send({
      type: "g2:chat",
      text
    });
  }
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

function renderChatHtml() {
  return S.chat.map(
    (message) => `
      <div class="msg">
        <b>
          ${esc(message.nickname)}
        </b>
        ：
        ${esc(message.text)}
      </div>
    `
  ).join("");
}

function scrollChat() {
  const box = $("#chatBox");

  if (box) {
    box.scrollTop =
      box.scrollHeight;
  }
}
