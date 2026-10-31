/* =========================================================
   全房聊天室（所有 game 共用）
   ─ app.js 只需要喺收到 welcome / state / chat:msg / chat:denied 時
     call RoomChat.onWelcome / onState / onMessage / onDenied，
     離開房間時 call RoomChat.reset()。
   ─ 邊隻 game 鎖聊天、有冇淘汰區，全部由伺服器 room.roomChat 決定，
     呢度唔使理係邊隻 game。
   ─ 所有訊息一律用 textContent 顯示，唔用 innerHTML，防 XSS。
========================================================= */
(function () {
  const TEXT = {
    yue: {
      title: "聊天室",
      people: (n) => `${n} 人`,
      all: "全房",
      dead: "淘汰區",
      deadHint: "只有已出局嘅玩家睇到同講到",
      teamHint: (l) => `隊伍頻道：只有${l}隊友睇到同講到`,
      placeholderTeam: "同隊友講…",
      placeholder: "講啲嘢…",
      placeholderDead: "同出局隊友講…",
      send: "發送",
      expand: "展開",
      collapse: "收起",
      openChat: "打開聊天室",
      hideChat: "收埋聊天室",
      you: "你",
      locked: "作答中，暫停聊天",
      lockedSelf: "你係出題人，揭曉之前唔可以講嘢",
      muted: "你已被房主禁言",
      deadLocked: "你已出局，回合完之前只可以喺淘汰區講嘢",
      guest: "加入房間先可以講嘢",
      rate: "講慢啲，等一陣再發",
      manage: "房主管理",
      mute: (n) => `禁言 ${n}`,
      unmute: (n) => `解除 ${n} 嘅禁言`,
      mutedTag: "已禁言",
      sys: {
        join: (p) => `${p.name} 加入咗房間`,
        leave: (p) => `${p.name} 離開咗房間`,
        mute: (p) => `房主將 ${p.name} 禁言`,
        unmute: (p) => `房主解除咗 ${p.name} 嘅禁言`,
        start: () => "遊戲開始",
        end: () => "遊戲結束",
        round: (p) => p.word === "question" ? `第 ${p.n} 題開始` : `第 ${p.n} 回合開始`
      }
    },
    zh: {
      title: "聊天室",
      people: (n) => `${n} 人`,
      all: "全房",
      dead: "淘汰區",
      deadHint: "只有已出局的玩家能看到和發言",
      teamHint: (l) => `隊伍頻道：只有${l}隊友能看到和發言`,
      placeholderTeam: "和隊友說…",
      placeholder: "說點什麼…",
      placeholderDead: "和出局的隊友說…",
      send: "發送",
      expand: "展開",
      collapse: "收起",
      openChat: "打開聊天室",
      hideChat: "收起聊天室",
      you: "你",
      locked: "作答中，暫停聊天",
      lockedSelf: "你是出題人，揭曉前不能發言",
      muted: "你已被房主禁言",
      deadLocked: "你已出局，回合結束前只能在淘汰區發言",
      guest: "加入房間後才能發言",
      rate: "說慢一點，稍後再發送",
      manage: "房主管理",
      mute: (n) => `禁言 ${n}`,
      unmute: (n) => `解除 ${n} 的禁言`,
      mutedTag: "已禁言",
      sys: {
        join: (p) => `${p.name} 加入了房間`,
        leave: (p) => `${p.name} 離開了房間`,
        mute: (p) => `房主將 ${p.name} 禁言`,
        unmute: (p) => `房主解除了 ${p.name} 的禁言`,
        start: () => "遊戲開始",
        end: () => "遊戲結束",
        round: (p) => p.word === "question" ? `第 ${p.n} 題開始` : `第 ${p.n} 回合開始`
      }
    }
  };

  // 每個座位一隻固定顏色（喺白底都過 4.5:1 對比）
  const SEAT_COLORS = ["#3566B8", "#B5482A", "#7A4DB3", "#2E7D5B", "#A8336A", "#7A6200"];
  const DESKTOP = window.matchMedia("(min-width: 1100px)");

  const ICONS = {
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    send: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    mute: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'
  };

  const C = {
    el: null,
    send: null,
    room: null,
    playerId: null,
    policy: null,
    messages: [],      // 全部收到嘅訊息（全房 + 隊伍 + 淘汰區），按 id 排
    seen: new Set(),
    tab: "all",
    open: false,       // 手機：展開；電腦：側欄打開
    desktopOpen: true,
    unread: { all: 0, team: 0, dead: 0 },
    wasDead: false,
    teamKey: null,
    menuFor: null
  };

  function t() {
    return TEXT[C.room?.language === "zh" ? "zh" : "yue"];
  }

  function svg(name, size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  }

  function chars(s) {
    return Array.from(s || "").length;
  }

  function isDesktop() {
    return DESKTOP.matches;
  }

  /* ---------- DOM ---------- */

  function build() {
    if (C.el) return C.el;
    const shell = document.getElementById("gameShell");
    if (!shell) return null;

    const el = document.createElement("aside");
    el.id = "roomChat";
    el.className = "rc hidden";
    el.innerHTML = `
      <div class="rc-head">
        <span class="rc-dot" aria-hidden="true"></span>
        <strong class="rc-title"></strong>
        <span class="rc-people"></span>
        <div class="rc-tabs hidden" role="tablist">
          <button type="button" class="rc-tab" role="tab" data-tab="all"><span class="rc-tab-label"></span><span class="rc-badge hidden"></span></button>
          <button type="button" class="rc-tab" role="tab" data-tab="team"><span class="rc-tab-label"></span><span class="rc-badge hidden"></span></button>
          <button type="button" class="rc-tab" role="tab" data-tab="dead"><span class="rc-tab-label"></span><span class="rc-badge hidden"></span></button>
        </div>
        <span class="rc-spacer"></span>
        <button type="button" class="rc-toggle"></button>
      </div>
      <div class="rc-hint hidden"></div>
      <div class="rc-log" role="log" aria-live="polite"></div>
      <div class="rc-menu hidden" role="menu"></div>
      <form class="rc-form" autocomplete="off">
        <label class="rc-input">
          <input type="text" enterkeyhint="send">
          <span class="rc-count"></span>
        </label>
        <button type="submit" class="rc-send">${svg("send", 20)}</button>
      </form>
      <div class="rc-locked hidden">${svg("lock", 16)}<span></span></div>
      <div class="rc-toast hidden" role="status"></div>
    `;
    shell.appendChild(el);

    const fab = document.createElement("button");
    fab.type = "button";
    fab.id = "roomChatFab";
    fab.className = "rc-fab hidden";
    fab.innerHTML = `${svg("chat", 20)}<span class="rc-fab-label"></span><span class="rc-badge hidden"></span>`;
    shell.appendChild(fab);
    fab.addEventListener("click", () => setOpen(true));

    el.querySelector(".rc-toggle").addEventListener("click", () => setOpen(!currentOpen()));
    el.querySelectorAll(".rc-tab").forEach((b) =>
      b.addEventListener("click", () => setTab(b.dataset.tab))
    );

    const form = el.querySelector(".rc-form");
    const input = form.querySelector("input");
    input.addEventListener("input", () => {
      // 30 字上限：用字數計（中文、emoji 都當一個字）
      const max = C.policy?.maxChars || 30;
      if (chars(input.value) > max) {
        input.value = Array.from(input.value).slice(0, max).join("");
      }
      updateCount();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || !C.send) return;
      C.send({ type: "chat:send", text, channel: C.tab });
      input.value = "";
      updateCount();
    });

    el.querySelector(".rc-log").addEventListener("click", (e) => {
      const btn = e.target.closest(".rc-name-btn");
      if (!btn) return;
      e.stopPropagation();
      openMenu(btn.dataset.pid, btn);
    });
    document.addEventListener("click", (e) => {
      if (C.menuFor && !e.target.closest(".rc-menu")) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && C.menuFor) closeMenu();
    });

    DESKTOP.addEventListener?.("change", () => render());

    C.el = el;
    C.fab = fab;
    return el;
  }

  function currentOpen() {
    return isDesktop() ? C.desktopOpen : C.open;
  }

  function setOpen(v) {
    if (isDesktop()) C.desktopOpen = v;
    else C.open = v;
    if (v) C.unread[C.tab] = 0;
    render();
    // 開／收之後高度變咗，等 layout 完先捲到最底
    requestAnimationFrame(scrollToEnd);
  }

  function setTab(tab) {
    if (tab === "dead" && !C.policy?.deadChannel) tab = "all";
    if (tab === "team" && !C.policy?.teamChannel) tab = "all";
    C.tab = tab;
    C.unread[tab] = 0;
    renderLog();
    render();
  }

  function playerById(id) {
    return C.room?.players?.find((p) => p.id === id) || null;
  }

  function colorFor(msg) {
    const p = playerById(msg.playerId);
    const seat = p ? p.seat : msg.seat;
    return SEAT_COLORS[(Number(seat) || 0) % SEAT_COLORS.length];
  }

  function msgNode(msg) {
    if (msg.kind === "sys") {
      const d = document.createElement("div");
      d.className = "rc-sys";
      const fn = t().sys[msg.key];
      d.textContent = fn ? fn(msg.params || {}) : "";
      return d;
    }

    const mine = msg.playerId === C.playerId;
    const color = colorFor(msg);
    const iAmHost = C.room?.hostId === C.playerId;
    const canManage = iAmHost && !mine && msg.playerId !== C.room?.hostId;

    const row = document.createElement("div");
    row.className = "rc-msg" + (mine ? " mine" : "");
    row.dataset.pid = msg.playerId;

    const av = document.createElement("span");
    av.className = "rc-av";
    av.style.background = color;
    // 中文名用最後一個字（阿明 → 明），英文名用第一個字母（Kit → K）
    const nameChars = Array.from(msg.nickname || "?");
    const cjk = /[\u3400-\u9fff]/.test(msg.nickname || "");
    av.textContent = (cjk ? nameChars.at(-1) : nameChars[0]?.toUpperCase()) || "?";
    av.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "rc-body";

    const name = document.createElement(canManage ? "button" : "b");
    name.className = "rc-name" + (canManage ? " rc-name-btn" : "");
    if (canManage) {
      name.type = "button";
      name.dataset.pid = msg.playerId;
    }
    name.style.color = color;
    name.textContent = mine ? t().you : msg.nickname;

    const text = document.createElement("span");
    text.className = "rc-text";
    text.textContent = msg.text;

    body.append(name, text);
    row.append(av, body);
    return row;
  }

  function visible() {
    return C.messages.filter((m) => chOf(m) === C.tab);
  }

  function chOf(m) {
    return m.channel === "dead" ? "dead" : m.channel === "team" ? "team" : "all";
  }

  function nearBottom(log) {
    return log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  }

  function scrollToEnd() {
    const log = C.el?.querySelector(".rc-log");
    if (log) log.scrollTop = log.scrollHeight;
  }

  function renderLog() {
    if (!C.el) return;
    const log = C.el.querySelector(".rc-log");
    log.replaceChildren(...visible().map(msgNode));
    scrollToEnd();
  }

  function updateCount() {
    if (!C.el) return;
    const input = C.el.querySelector(".rc-form input");
    const max = C.policy?.maxChars || 30;
    C.el.querySelector(".rc-count").textContent = `${chars(input.value)}/${max}`;
    C.el.querySelector(".rc-send").disabled = !input.value.trim();
  }

  function render() {
    const el = build();
    if (!el) return;
    const shell = document.getElementById("gameShell");
    const pol = C.policy;
    const on = !!(C.room && pol?.enabled);

    el.classList.toggle("hidden", !on);
    shell?.classList.toggle("has-chat", on);
    if (!on) {
      C.fab.classList.add("hidden");
      shell?.classList.remove("chat-collapsed");
      return;
    }

    const T = t();
    const desktop = isDesktop();
    const open = currentOpen();

    // 淘汰區：啱啱出局就自動切過去；回合完就切返全房
    if (pol.deadChannel && !C.wasDead) C.tab = "dead";
    if (!pol.deadChannel && C.tab === "dead") C.tab = "all";
    if (!pol.deadChannel && C.wasDead) {
      C.messages = C.messages.filter((m) => m.channel !== "dead");
      C.unread.dead = 0;
      renderLog();
    }
    if (pol.deadChannel !== C.wasDead && pol.deadChannel) renderLog();
    C.wasDead = !!pol.deadChannel;

    // 隊伍頻道：分隊有變（或者冇咗）就清走舊隊伍訊息
    const teamKey = pol.teamChannel?.key || null;
    if (teamKey !== C.teamKey) {
      C.messages = C.messages.filter((m) => m.channel !== "team" || m.team === teamKey);
      C.unread.team = 0;
      if (!teamKey && C.tab === "team") C.tab = "all";
      // 遊戲開始分好隊就自動切去隊伍頻道（淘汰區優先）；想去全房要自己撳
      if (teamKey && C.tab !== "dead") C.tab = "team";
      C.teamKey = teamKey;
      renderLog();
    }
    const lang = C.room?.language === "zh" ? "zh" : "yue";
    const teamLabel = pol.teamChannel ? (pol.teamChannel.label?.[lang] || pol.teamChannel.key) : "";

    el.classList.toggle("open", open);
    el.classList.toggle("rc-dead", C.tab === "dead");
    el.classList.toggle("rc-team", C.tab === "team");
    el.style.setProperty("--team", pol.teamChannel?.color || "#22408C");
    shell?.classList.toggle("chat-collapsed", desktop && !open);
    C.fab.classList.toggle("hidden", !(desktop && !open));

    el.querySelector(".rc-title").textContent = T.title;
    const online = (C.room.players || []).filter((p) => p.connected).length;
    el.querySelector(".rc-people").textContent = T.people(online);

    const tabs = el.querySelector(".rc-tabs");
    const multi = !!(pol.deadChannel || pol.teamChannel);
    tabs.classList.toggle("hidden", !multi);
    el.querySelector(".rc-people").classList.toggle("hidden", multi);
    tabs.querySelectorAll(".rc-tab").forEach((b) => {
      const tabOn = b.dataset.tab === "all" || (b.dataset.tab === "dead" ? pol.deadChannel : !!pol.teamChannel);
      b.classList.toggle("hidden", !tabOn);
      const active = b.dataset.tab === C.tab;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
      b.querySelector(".rc-tab-label").textContent = b.dataset.tab === "dead" ? T.dead : b.dataset.tab === "team" ? teamLabel : T.all;
      const badge = b.querySelector(".rc-badge");
      const n = active ? 0 : C.unread[b.dataset.tab];
      badge.textContent = n > 9 ? "9+" : String(n);
      badge.classList.toggle("hidden", !n);
    });
    const hint = el.querySelector(".rc-hint");
    hint.textContent = C.tab === "dead" ? T.deadHint : C.tab === "team" ? T.teamHint(teamLabel) : "";
    hint.classList.toggle("hidden", C.tab === "all");

    const toggle = el.querySelector(".rc-toggle");
    if (desktop) {
      toggle.innerHTML = svg("right", 18);
      toggle.setAttribute("aria-label", T.hideChat);
      toggle.classList.add("icon-only");
    } else {
      toggle.innerHTML = `${svg(open ? "down" : "up", 16)}<span></span>`;
      toggle.querySelector("span").textContent = open ? T.collapse : T.expand;
      toggle.setAttribute("aria-label", open ? T.collapse : T.expand);
      toggle.classList.remove("icon-only");
    }
    toggle.setAttribute("aria-expanded", open ? "true" : "false");

    C.fab.querySelector(".rc-fab-label").textContent = T.title;
    C.fab.setAttribute("aria-label", T.openChat);
    const fabBadge = C.fab.querySelector(".rc-badge");
    const total = C.unread.all + C.unread.team + C.unread.dead;
    fabBadge.textContent = total > 9 ? "9+" : String(total);
    fabBadge.classList.toggle("hidden", !total);

    // 可唔可以講嘢
    let reason = null;
    if (C.tab === "dead") reason = pol.canSendDead ? null : pol.reason;
    else if (C.tab === "team") reason = pol.canSendTeam ? null : (pol.teamReason || "locked");
    else reason = pol.canSend ? null : pol.reason;
    const lockText =
      reason === "muted" ? T.muted :
      reason === "dead" ? T.deadLocked :
      reason === "guest" ? T.guest :
      reason === "lockedSelf" ? T.lockedSelf :
      reason ? T.locked : "";

    const form = el.querySelector(".rc-form");
    const locked = el.querySelector(".rc-locked");
    form.classList.toggle("hidden", !!reason);
    locked.classList.toggle("hidden", !reason);
    locked.querySelector("span").textContent = lockText;
    el.classList.toggle("is-locked", !!reason);
    if (reason) closeMenu();

    const input = form.querySelector("input");
    input.placeholder = C.tab === "dead" ? T.placeholderDead : C.tab === "team" ? T.placeholderTeam : T.placeholder;
    input.setAttribute("aria-label", input.placeholder);
    el.querySelector(".rc-send").setAttribute("aria-label", T.send);
    updateCount();
  }

  /* ---------- 房主禁言選單 ---------- */

  function openMenu(pid, anchor) {
    const p = playerById(pid);
    if (!p || !C.el) return;
    const muted = (C.policy?.muted || []).includes(pid);
    const menu = C.el.querySelector(".rc-menu");
    const T = t();
    menu.replaceChildren();
    const label = document.createElement("span");
    label.className = "rc-menu-label";
    label.textContent = T.manage;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    btn.innerHTML = svg("mute", 16);
    btn.append(document.createTextNode(muted ? T.unmute(p.nickname) : T.mute(p.nickname)));
    btn.addEventListener("click", () => {
      C.send?.({ type: "chat:mute", targetId: pid, muted: !muted });
      closeMenu();
    });
    menu.append(label, btn);

    const box = C.el.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, a.left - box.left)}px`;
    menu.style.top = `${a.top - box.top}px`;
    menu.classList.remove("hidden");
    C.menuFor = pid;
    btn.focus();
  }

  function closeMenu() {
    if (!C.el) return;
    C.el.querySelector(".rc-menu").classList.add("hidden");
    C.menuFor = null;
  }

  /* ---------- 細 toast（限速提示） ---------- */

  let toastTimer = null;
  function toast(text) {
    if (!C.el) return;
    const el = C.el.querySelector(".rc-toast");
    el.textContent = text;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 1800);
  }

  /* ---------- 對外 API ---------- */

  function addMessage(msg) {
    if (!msg || C.seen.has(msg.id)) return false;
    C.seen.add(msg.id);
    C.messages.push(msg);
    C.messages.sort((a, b) => a.id - b.id);
    if (C.messages.length > 120) {
      const drop = C.messages.splice(0, C.messages.length - 120);
      drop.forEach((m) => C.seen.delete(m.id));
    }
    return true;
  }

  window.RoomChat = {
    init(sendFn) {
      C.send = sendFn;
    },

    onWelcome(room, history, playerId) {
      C.room = room;
      C.playerId = playerId;
      C.policy = room?.roomChat || null;
      C.messages = [];
      C.seen = new Set();
      C.unread = { all: 0, team: 0, dead: 0 };
      C.wasDead = false;
      C.teamKey = null;
      C.tab = "all";
      (history || []).forEach(addMessage);
      build();
      render();
      renderLog();
    },

    onState(room) {
      const hostChanged = C.room?.hostId !== room?.hostId;
      C.room = room;
      C.policy = room?.roomChat || null;
      render();
      if (hostChanged) renderLog();
    },

    onMessage(msg) {
      if (!C.el || !addMessage(msg)) return;
      const ch = chOf(msg);
      const showing = ch === C.tab;
      if (showing) {
        const log = C.el.querySelector(".rc-log");
        // 收起狀態（手機底部聊天欄）永遠顯示最新幾條；展開時如果玩家捲咗上去睇舊訊息就唔好扯佢落嚟
        const compact = !isDesktop() && !C.open;
        const stick = compact || nearBottom(log) || msg.playerId === C.playerId;
        log.appendChild(msgNode(msg));
        if (stick) scrollToEnd();
      }
      const open = currentOpen();
      // 手機收起狀態都見到最新幾條，所以淨係計「唔喺呢個頁籤」或者「電腦版收埋咗」
      if (!showing || (isDesktop() && !open)) {
        C.unread[ch] += 1;
        render();
      }
    },

    onDenied(reason) {
      if (reason === "rate") toast(t().rate);
    },

    reset() {
      C.room = null;
      C.policy = null;
      C.messages = [];
      C.seen = new Set();
      C.open = false;
      C.tab = "all";
      C.wasDead = false;
      C.teamKey = null;
      closeMenu();
      if (C.el) {
        C.el.querySelector(".rc-log").replaceChildren();
        render();
      }
    }
  };
})();
