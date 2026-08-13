const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const PORT = process.env.PORT || 3000;

const questions = JSON.parse(fs.readFileSync(path.join(__dirname, "questions.json"), "utf8"));
const rooms = new Map();

app.use(express.static(__dirname));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function code() {
  let c;
  do c = Math.random().toString(36).slice(2, 8).toUpperCase(); while (rooms.has(c));
  return c;
}
function shuffle(a) { return [...a].sort(() => Math.random() - 0.5); }
function now() { return Date.now(); }

function safeRoom(room) {
  return {
    code: room.code,
    game: room.game,
    hostId: room.hostId,
    players: room.players.map(p => ({ id:p.id, nickname:p.nickname, seat:p.seat })),
    state: room.publicState
  };
}
function broadcastRoom(room) { io.to(room.code).emit("room:update", safeRoom(room)); }

function sendError(socket, message) { socket.emit("server:error", { message }); }

function createRoom(socket, nickname, game, filters) {
  const room = {
    code: code(), game, hostId: socket.id,
    players: [{ id:socket.id, nickname, seat:0 }],
    filters: filters || null,
    publicState: { phase:"waiting", ready:{} },
    timer: null,
    private: {}
  };
  rooms.set(room.code, room);
  socket.join(room.code);
  socket.data.roomCode = room.code;
  return room;
}

function findRoom(socket) { return rooms.get(socket.data.roomCode); }

function filteredGame1(room) {
  const cats = room.filters?.categories?.length ? room.filters.categories : questions.game1.categories;
  return questions.game1.questions.filter(q => cats.includes(q.category));
}
function filteredGame2(room) {
  const cats = room.filters?.categories?.length ? room.filters.categories : questions.game2.categories;
  return questions.game2.questions.filter(q => cats.includes(q.category));
}

/* ---------------- Game 1 ---------------- */
function game1Start(room) {
  clearTimeout(room.timer);
  room.g1 = {
    deck: shuffle(filteredGame1(room)),
    current: 0, round: 1,
    votes: {}, submitted: {},
    phase: "vote",
    nextReady: {}
  };
  game1Question(room);
}
function game1Question(room) {
  const g = room.g1;
  if (!g.deck.length) g.deck = shuffle(filteredGame1(room));
  const q = g.deck[g.current++ % g.deck.length];
  g.question = q;
  g.votes = {};
  g.submitted = {};
  g.nextReady = {};
  g.phase = "vote";
  const endAt = now() + 10000;
  room.publicState = {
    phase:"vote", round:g.round, endsAt:endAt,
    question:{ id:q.id, category:q.category, question:q.question, options:q.options },
    votes:{0:0,1:0},
    submittedCount:0,
    playerCount:room.players.length
  };
  broadcastRoom(room);
  io.to(room.code).emit("game1:voteOpen", room.publicState);
  room.timer = setTimeout(() => game1LockVote(room), 10000);
}
function game1LockVote(room) {
  const g = room.g1;
  if (!g || g.phase !== "vote") return;
  g.phase = "chat";
  const counts = [0,0];
  Object.values(g.votes).forEach(v => { if (v===0 || v===1) counts[v]++; });
  const winner = counts[0] === counts[1] ? null : (counts[0] > counts[1] ? 0 : 1);
  room.publicState = {
    phase:"chat", round:g.round,
    question:{ id:g.question.id, category:g.question.category, question:g.question.question, options:g.question.options },
    votes:{0:counts[0],1:counts[1]},
    winner,
    playerCount:room.players.length,
    nextReadyCount:0,
    chatStartedAt:now()
  };
  broadcastRoom(room);
  io.to(room.code).emit("game1:chatOpen", room.publicState);
}
function maybeNextGame1(room) {
  const g = room.g1;
  if (!g || g.phase !== "chat") return;
  if (Object.keys(g.nextReady).length < room.players.length) return;
  g.round++;
  game1Question(room);
}

/* ---------------- Game 2 ---------------- */

function game2PrivatePayload(room, playerId) {
  if (!room.g2) return null;
  const role = playerId === room.g2.judgeId ? "judge" : (playerId === room.g2.truthId ? "truth" : "bluffer");
  return { role, explanation: role === "truth" ? room.g2.privateExplanation : null };
}
function emitGame2Private(room) {
  for (const p of room.players) {
    const payload = game2PrivatePayload(room, p.id);
    if (payload) io.to(p.id).emit("game2:private", payload);
  }
}

function game2Start(room) {
  clearTimeout(room.timer);
  const players = shuffle(room.players);
  const judge = players[0];
  const truth = players[1];
  const q = shuffle(filteredGame2(room))[0];
  room.g2 = {
    question:q, judgeId:judge.id, truthId:truth.id,
    order:room.players.map(p=>p.id).sort(() => Math.random()-0.5),
    currentIndex:0, speechEndsAt:0, phase:"prep", choice:null
  };
  room.private = {};
  room.g2.privateExplanation = q.explanation;

  const prepEndsAt = now() + 30000;
  room.publicState = {
    phase:"prep", endsAt:prepEndsAt,
    term:q.term,
    judgeId:judge.id,
    order:room.g2.order,
    currentPlayerId:null,
    round:1
  };
  broadcastRoom(room);

  emitGame2Private(room);

  room.timer = setTimeout(() => game2StartSpeaking(room), 30000);
}
function game2StartSpeaking(room) {
  const g = room.g2;
  if (!g) return;
  g.phase = "speaking";
  g.currentIndex = 0;
  g.speechEndsAt = now() + 60000;
  room.publicState = {
    phase:"speaking", endsAt:g.speechEndsAt,
    term:g.question.term, judgeId:g.judgeId,
    order:g.order, currentPlayerId:g.order[0], round:1
  };
  broadcastRoom(room);
  emitGame2Private(room);
  io.to(room.code).emit("chat:clear");
  room.timer = setTimeout(() => game2AdvanceSpeaker(room), 60000);
}
function game2AdvanceSpeaker(room) {
  const g = room.g2;
  if (!g || g.phase !== "speaking") return;
  g.currentIndex++;
  if (g.currentIndex >= g.order.length) return game2Judge(room);
  g.speechEndsAt = now() + 60000;
  room.publicState.currentPlayerId = g.order[g.currentIndex];
  room.publicState.endsAt = g.speechEndsAt;
  broadcastRoom(room);
  emitGame2Private(room);
  room.timer = setTimeout(() => game2AdvanceSpeaker(room), 60000);
}
function game2Judge(room) {
  clearTimeout(room.timer);
  const g = room.g2;
  g.phase = "judge";
  room.publicState = {
    phase:"judge", term:g.question.term, judgeId:g.judgeId,
    endsAt:null, order:g.order, currentPlayerId:null,
    choices:room.players.filter(p=>p.id!==g.judgeId).map(p=>({id:p.id,nickname:p.nickname}))
  };
  broadcastRoom(room);
  emitGame2Private(room);
}

io.on("connection", socket => {
  socket.on("room:create", ({ nickname, game, filters }) => {
    if (!nickname?.trim()) return sendError(socket, "請輸入暱稱。");
    if (!["game1","game2"].includes(game)) return sendError(socket, "無效遊戲。");
    const room = createRoom(socket, nickname.trim().slice(0,20), game, filters);
    socket.emit("room:created", { code:room.code });
    broadcastRoom(room);
  });

  socket.on("room:join", ({ nickname, code:roomCode }) => {
    if (!nickname?.trim()) return sendError(socket, "請輸入暱稱。");
    const room = rooms.get(String(roomCode||"").trim().toUpperCase());
    if (!room) return sendError(socket, "房間不存在。");
    if (room.players.length >= 6) return sendError(socket, "房間已滿，最多6人。");
    if (room.publicState.phase !== "waiting") return sendError(socket, "遊戲已開始，暫時不能加入。");
    if (room.players.some(p => p.nickname === nickname.trim())) return sendError(socket, "暱稱已被使用。");
    room.players.push({id:socket.id, nickname:nickname.trim().slice(0,20), seat:room.players.length});
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.emit("room:joined", {code:room.code});
    broadcastRoom(room);
  });

  socket.on("room:start", ({ filters }) => {
    const room = findRoom(socket);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 4 || room.players.length > 6) return sendError(socket, "每局需要4-6人。");
    room.filters = filters || room.filters;
    if (room.game === "game1") game1Start(room);
    else game2Start(room);
  });

  socket.on("game1:vote", ({ option }) => {
    const room = findRoom(socket), g = room?.g1;
    if (!room || !g || g.phase !== "vote") return;
    if (now() > room.publicState.endsAt) return;
    if (![0,1].includes(option)) return;
    if (g.votes[socket.id] !== undefined) return;
    g.votes[socket.id] = option;
    const counts=[0,0];
    Object.values(g.votes).forEach(v=>counts[v]++);
    room.publicState.votes={0:counts[0],1:counts[1]};
    room.publicState.submittedCount=Object.keys(g.votes).length;
    broadcastRoom(room);
  });

  socket.on("game1:chat", ({text}) => {
    const room=findRoom(socket), g=room?.g1;
    if(!room || !g || g.phase!=="chat") return;
    const clean=String(text||"").trim().slice(0,300);
    if (!clean) return;
    io.to(room.code).emit("game1:chatMessage", {playerId:socket.id, nickname:room.players.find(p=>p.id===socket.id)?.nickname||"", text:clean, at:now()});
  });

  socket.on("game1:next", () => {
    const room=findRoom(socket), g=room?.g1;
    if(!room || !g || g.phase!=="chat") return;
    g.nextReady[socket.id]=true;
    room.publicState.nextReadyCount=Object.keys(g.nextReady).length;
    broadcastRoom(room);
    maybeNextGame1(room);
  });

  socket.on("game2:chat", ({text}) => {
    const room=findRoom(socket), g=room?.g2;
    if(!room || !g || g.phase!=="speaking") return;
    if (socket.id !== g.order[g.currentIndex]) return;
    const clean=String(text||"").trim().slice(0,300);
    if (!clean) return;
    io.to(room.code).emit("game2:chatMessage", {playerId:socket.id,nickname:room.players.find(p=>p.id===socket.id)?.nickname||"",text:clean,at:now()});
  });

  socket.on("game2:judge", ({targetId}) => {
    const room=findRoom(socket), g=room?.g2;
    if(!room || !g || g.phase!=="judge" || socket.id!==g.judgeId) return;
    if (!room.players.some(p=>p.id===targetId) || targetId===g.judgeId) return;
    g.phase="result";
    const correct = targetId===g.truthId;
    room.publicState = { phase:"result", term:g.question.term, judgeId:g.judgeId, truthId:g.truthId, targetId, correct,
      scores: calculateScores(room, correct), order:g.order };
    broadcastRoom(room);
  });

  socket.on("room:restart", () => {
    const room=findRoom(socket);
    if(!room || room.hostId!==socket.id || room.publicState.phase==="waiting") return;
    if(room.players.length<4) return;
    if(room.game==="game1") game1Start(room); else game2Start(room);
  });

  socket.on("disconnect", () => {
    const room=findRoom(socket);
    if(!room) return;
    clearTimeout(room.timer);
    room.players=room.players.filter(p=>p.id!==socket.id);
    if(!room.players.length){ rooms.delete(room.code); return; }
    if(room.hostId===socket.id) room.hostId=room.players[0].id;
    room.publicState={phase:"waiting"};
    broadcastRoom(room);
  });
});

function calculateScores(room, correct) {
  const scores={};
  room.players.forEach(p=>scores[p.id]=0);
  if (correct) {
    scores[room.g2.judgeId]=2;
    scores[room.g2.truthId]=2;
  } else {
    room.players.forEach(p=>{ if(p.id!==room.g2.judgeId && p.id!==room.g2.truthId) scores[p.id]=1; });
  }
  return scores;
}

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
