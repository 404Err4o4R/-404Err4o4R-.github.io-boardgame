import { DurableObject } from "cloudflare:workers";
import {
  GAME1_QUESTIONS,
  GAME2_QUESTIONS,
  GAME1_CATEGORIES,
  GAME2_CATEGORIES
} from "./question-bank.js";

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const ROOM_TTL = 1000 * 60 * 60 * 6;
const MAX_MESSAGE = 12_000;
const MAX_CHAT_HISTORY = 100;
const MAX_CHAT_ARCHIVE = 1000; // 房主專用嘅全場聊天記錄上限（唔會跟住每題重置）

const G1_VOTE_MS = 10000;
const G2_PREP_MS = 30000;
const G2_PICK_MS = 10000;
const G2_SPEAK_MS = 30000;
const G2_JUDGE_MS = 120000;

const G3_WRITE_MS = 50000;
const G3_SCORE_MS = 18000;
const G3_REVEAL_MS = 10000;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra
    }
  });
}
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
function code() {
  return crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
}
function token() {
  return crypto.randomUUID() + "." + crypto.randomUUID();
}
function shuffle(a) {
  const x=[...a];
  for(let i=x.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [x[i],x[j]]=[x[j],x[i]];
  }
  return x;
}
function cleanName(v) {
  return String(v || "玩家").trim().slice(0,20) || "玩家";
}
function validGame(v) { return v==="game1" || v==="game2" || v==="game3"; }
function clampRounds(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(20, Math.max(2, Math.round(n)));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originHeaders = corsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: originHeaders
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/health"
    ) {
      return json(
        {
          ok: true,
          service: "play-together-cloudflare",
          now: Date.now()
        },
        200,
        originHeaders
      );
    }

    // 房間建立前，前端用嚟載入題庫分類（取代之前 Supabase 嘅 list_categories RPC）。
    if (
      request.method === "GET" &&
      url.pathname === "/api/categories"
    ) {
      const game = url.searchParams.get("game");

      if (!validGame(game)) {
        return json(
          { ok: false, error: "無效遊戲。" },
          400,
          originHeaders
        );
      }

      const categories =
        game === "game1"
          ? GAME1_CATEGORIES
          : game === "game2"
            ? GAME2_CATEGORIES
            : [];

      return json(
        { ok: true, categories },
        200,
        originHeaders
      );
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/rooms"
    ) {
      const body = await request
        .json()
        .catch(() => null);

      if (!body || !validGame(body.game)) {
        return json(
          {
            ok: false,
            error: "無效遊戲。"
          },
          400,
          originHeaders
        );
      }

      const requested = String(
        body.code || ""
      )
        .trim()
        .toUpperCase();

      const list = requested
        ? [requested]
        : Array.from(
            { length: 6 },
            () => code()
          );

      for (const roomCode of list) {
        if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
          continue;
        }

        const id =
          env.GAME_ROOM.idFromName(roomCode);

        const stub =
          env.GAME_ROOM.get(id);

        const res = await stub.fetch(
          "https://room.internal/bootstrap",
          {
            method: "POST",
            body: JSON.stringify({
              roomCode,
              game: body.game,
              filters:
                body.filters?.categories || [],
              rounds:
                body.rounds || null,
              roomTtl: ROOM_TTL
            })
          }
        );

        if (res.ok) {
          return json(
            {
              ok: true,
              roomCode
            },
            200,
            originHeaders
          );
        }
      }

      return json(
        {
          ok: false,
          error: "建立房間失敗，請再試一次。"
        },
        409,
        originHeaders
      );
    }

    /*
     * WebSocket endpoint
     *
     * Browser:
     *   /websocket?room=ABC123
     *
     * Worker:
     *   → Durable Object
     */
    if (url.pathname === "/websocket") {
      if (request.method !== "GET") {
        return new Response(
          "Expected GET",
          {
            status: 400,
            headers: originHeaders
          }
        );
      }

      if (
        request.headers.get("Upgrade") !==
        "websocket"
      ) {
        return new Response(
          "Expected WebSocket",
          {
            status: 426,
            headers: originHeaders
          }
        );
      }

      const roomCode = (
        url.searchParams.get("room") || ""
      )
        .toUpperCase();

      if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
        return new Response(
          "Invalid room code",
          {
            status: 400,
            headers: originHeaders
          }
        );
      }

      const id =
        env.GAME_ROOM.idFromName(
          roomCode
        );

      const stub =
        env.GAME_ROOM.get(id);

      return stub.fetch(request);
    }

    return new Response(
      "Play Together game server",
      {
        status: 200,
        headers: originHeaders
      }
    );
  }
};

function publicRoom(room, viewerId=null) {
  return {
    code: room.code,
    game: room.game,
    hostId: room.hostId,
    filters: room.filters,
    players: room.players.map(p=>({
  id:p.id,
  nickname:p.nickname,
  seat:p.seat,
  host:p.id===room.hostId,
  connected:!!p.connected,
  ready:!!p.ready,
  score:p.score||0
})),
    gameState: publicGameState(room, viewerId),
    // 房主可以睇返成場所有題目嘅聊天記錄，其他人淨係見到依家嗰題（新一題開始就會重置）。
    chat: (viewerId && viewerId===room.hostId) ? (room.chatArchive || room.chat || []) : (room.chat || []),
    viewerRole: viewerId && room.gameState?.roles?.[viewerId] || null,
    viewerExplanation: viewerId && room.gameState?.roles?.[viewerId]==="truth"
      ? room.gameState.privateExplanation || null
      : null
  };
}

function publicGameState(room, viewerId=null) {
  const g=room.gameState;
  if(!g) return {phase:"waiting"};

  if(room.game==="game1") {
    return {
      phase:g.phase, round:g.round, endsAt:g.endsAt||null,
      question:g.question ? {
        id:g.question.id, category:g.question.category,
        question:g.question.question, options:g.question.options
      } : null,
      votes:g.phase==="vote" ? {
  0:Object.values(g.votes||{}).filter(v=>v===0).length,
  1:Object.values(g.votes||{}).filter(v=>v===1).length
} : (g.voteCounts||[0,0]),

myVote:
  g.phase==="vote" &&
  viewerId &&
  g.votes?.[viewerId] !== undefined
    ? g.votes[viewerId]
    : null,

voters:g.phase!=="vote" ? {
  0:room.players
    .filter(p => g.votes?.[p.id] === 0)
    .map(p => p.nickname),

  1:room.players
    .filter(p => g.votes?.[p.id] === 1)
    .map(p => p.nickname)
} : {
  0:[],
  1:[]
},

submittedCount:Object.keys(g.votes||{}).length,
nextReadyCount:Object.keys(g.nextReady||{}).length,
winner:g.winner ?? null,
results:g.results||null
    };
  }

  if(room.game==="game3") {
    const base3={
      phase:g.phase,
      round:g.round,
      totalRounds:g.totalRounds,
      raterId:g.raterId||null,
      raterNickname:room.players.find(p=>p.id===g.raterId)?.nickname || "",
      endsAt:g.endsAt||null
    };

    if(g.phase==="writing") {
      const writers = room.players.filter(p=>p.id!==g.raterId);
      base3.submittedCount = (g.submittedIds||[]).length;
      base3.totalToSubmit = writers.length;
      base3.isRater = viewerId===g.raterId;
      if(viewerId && viewerId!==g.raterId){
        base3.myTarget = g.targets?.[viewerId] ?? null;
        base3.mySubmitted = (g.submittedIds||[]).includes(viewerId);
      }
    }

    if(g.phase==="rating") {
      base3.ratingStage = g.ratingStage;
      base3.totalAnswers = (g.ratingOrder||[]).length;
      base3.isRater = viewerId===g.raterId;
      if(viewerId===g.raterId){
        base3.answers = (g.ratingOrder||[]).map(id=>g.answers?.[id] || "");
        base3.currentRatingIndex = g.currentRatingIndex ?? 0;
        base3.givenScores = (g.ratingOrder||[]).map(id=>g.scores?.[id] ?? null);
      }
    }

    if(g.phase==="reveal" || g.phase==="gameover") {
      base3.results = (g.results||[]).map(r=>({
        playerId:r.playerId,
        nickname:room.players.find(p=>p.id===r.playerId)?.nickname || "",
        target:r.target,
        score:r.score,
        diff:r.diff,
        roundPoints:r.roundPoints,
        text:r.text||""
      }));
      base3.isFinalRound = g.round>=g.totalRounds;
    }

    if(g.phase==="gameover") {
      base3.finalRanking = [...room.players]
        .sort((a,b)=>(b.score||0)-(a.score||0))
        .map(p=>({playerId:p.id,nickname:p.nickname,score:p.score||0}));
    }

    return base3;
  }

  const base={
    phase:g.phase, round:g.round, term:g.term || null,
    endsAt:g.endsAt||null, judgeId:g.judgeId||null,
    order:g.order||[], spokenIds:g.spokenIds||[],
    currentPlayerId:g.currentPlayerId||null
  };

  if(g.phase==="prep") {
    base.prepReadyCount=Object.keys(g.prepReady||{}).length;
    base.prepTotal=room.players.filter(p=>p.connected).length;
    base.myPrepReady=viewerId ? !!g.prepReady?.[viewerId] : false;
  }

  if(g.phase==="picking") {
    base.candidates = room.players
      .filter(p => (g.candidates||[]).includes(p.id))
      .map(p=>({id:p.id,nickname:p.nickname}));
  }
  if(g.phase==="judge") {
    base.choices=room.players
      .filter(p=>p.id!==g.judgeId)
      .map(p=>({id:p.id,nickname:p.nickname}));
  }
  if(g.phase==="result") {
    base.targetId=g.targetId;
    base.correct=!!g.correct;
    base.truthId=g.truthId;
    base.truthNickname=room.players.find(p=>p.id===g.truthId)?.nickname || "";
    base.correctExplanation=g.privateExplanation || "";
    base.scores=Object.fromEntries(room.players.map(p=>[p.id,p.score||0]));
  }
  return base;
}

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx=ctx;
    this.env=env;
    this.room=null;
    this.ctx.blockConcurrencyWhile(async()=>{
      this.room=await this.ctx.storage.get("room") || null;
    });
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping","pong")
    );
  }

  async fetch(request) {
    const url=new URL(request.url);

    if(request.method==="POST" && url.pathname==="/bootstrap"){
      const body=await request.json();
      if(this.room) return new Response("exists",{status:409});
      if(!validGame(body.game)) return new Response("bad game",{status:400});
      this.room={
        code:body.roomCode,
        game:body.game,
        filters:this.normalizeFilters(body.game,body.filters||[]),
        rounds:clampRounds(body.rounds),
        hostId:null,
        players:[],
        gameState:null,
        chat:[],
        // Game 1 每題鎖定嗰刻嘅投票快照，儲埋嚟計「結算」嗰陣嘅心有靈犀指數。
        g1History:[],
        createdAt:Date.now(),
        updatedAt:Date.now()
      };
      await this.save();
      await this.ctx.storage.setAlarm(Date.now()+ROOM_TTL);
      return new Response("ok");
    }

    if (url.pathname !== "/websocket") {
  return new Response("Not Found", {
    status: 404
  });
}

    if(request.method!=="GET" || request.headers.get("Upgrade")!=="websocket"){
      return new Response("Expected WebSocket",{status:426});
    }
    await this.ensureLoaded();

    if(!this.room) return new Response("Room does not exist",{status:404});

    const pair=new WebSocketPair();
    const [client,server]=Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({playerId:null,token:null});
    return new Response(null,{status:101,webSocket:client});
  }

  async ensureLoaded(){
    if(!this.room) this.room=await this.ctx.storage.get("room") || null;
  }

  async save(){
    this.room.updatedAt=Date.now();
    await this.ctx.storage.put("room",this.room);
  }

  normalizeFilters(game, filters){
    if(game==="game3") return [];
    const allowed=new Set(game==="game1"?GAME1_CATEGORIES:GAME2_CATEGORIES);
    const selected=[...new Set((Array.isArray(filters)?filters:[]).filter(x=>allowed.has(x)))];
    return selected.length?selected:[...allowed];
  }

  async webSocketMessage(ws, message){
    await this.ensureLoaded();
    if(!this.room) return this.safeSend(ws,{type:"error",message:"房間不存在。"});

    if(typeof message==="string" && message.length>MAX_MESSAGE) {
      return this.safeSend(ws,{type:"error",message:"訊息太長。"});
    }

    let msg;
    try{msg=typeof message==="string"?JSON.parse(message):JSON.parse(new TextDecoder().decode(message));}
    catch{return this.safeSend(ws,{type:"error",message:"無效訊息。"});}

    if(msg.type==="hello") return this.onHello(ws,msg);
    const session=ws.deserializeAttachment() || {};
    if(!session.playerId || !session.token) return this.safeSend(ws,{type:"error",message:"尚未驗證玩家。"});
    const player=this.room.players.find(p=>p.id===session.playerId && p.token===session.token);
    if(!player) return this.safeSend(ws,{type:"error",message:"玩家驗證失敗。"});
    player.connected=true;
    player.lastSeen=Date.now();

    switch(msg.type){
      case "start": return this.onStart(session.playerId);
      case "ready":
  return this.onReady(
    session.playerId,
    msg.ready
  );
      case "leave": return this.onLeave(session.playerId);
      case "g1:vote": return this.onG1Vote(session.playerId,msg.option);
      case "g1:chat": return this.onChat(session.playerId,msg.text,"chat");
      case "g1:next": return this.onG1Next(session.playerId);
      case "g1:finish": return this.onG1Finish(session.playerId);
      case "g2:ready": return this.onG2PrepReady(session.playerId);
      case "g2:pick": return this.onG2Pick(session.playerId,msg.targetId);
      case "g2:chat": return this.onChat(session.playerId,msg.text,"speaking");
      case "g2:judge": return this.onG2Judge(session.playerId,msg.targetId);
      case "g2:next": return this.onG2Next(session.playerId);
      case "g3:submit": return this.onG3Submit(session.playerId,msg.text);
      case "g3:rating-start": return this.onG3RatingStart(session.playerId);
      case "g3:score": return this.onG3Score(session.playerId,msg.index,msg.score);
      case "reconnect": return this.onReconnect(ws,session.playerId);
      default: return this.safeSend(ws,{type:"error",message:"未知操作。"});
    }
  }

  async onHello(ws,msg){
    const nickname=cleanName(msg.nickname);
    const mode=msg.mode || "join";

    // Reconnect using existing player credentials.
    if(mode==="reconnect" && msg.playerId && msg.token){
      const p=this.room.players.find(x=>x.id===msg.playerId && x.token===msg.token);
      if(!p) return this.safeSend(ws,{type:"error",message:"重連資訊無效。"});
      p.connected=true;p.lastSeen=Date.now();
      ws.serializeAttachment({playerId:p.id,token:p.token});
      this.sendWelcome(ws,p);
      await this.broadcastRoom();
      return;
    }

    if(mode==="create"){
      if(this.room.hostId || this.room.players.length) return this.safeSend(ws,{type:"error",message:"房間已存在玩家。"});
      const p={
  id:crypto.randomUUID(),
  token:token(),
  nickname,
  seat:0,
  connected:true,
  ready:false,
  score:0,
  lastSeen:Date.now()
};
      this.room.hostId=p.id;
      this.room.players=[p];
      ws.serializeAttachment({playerId:p.id,token:p.token});
      await this.save();
      this.sendWelcome(ws,p);
      await this.broadcastRoom();
      return;
    }

    if(mode!=="join") return this.safeSend(ws,{type:"error",message:"無效加入方式。"});

    // Guests cannot join after game starts, but reconnect is supported.
    if(this.room.gameState?.phase && this.room.gameState.phase!=="waiting"){
      return this.safeSend(ws,{type:"error",message:"遊戲已開始，請使用重連方式加入。"});
    }
    if(this.room.players.length>=MAX_PLAYERS) return this.safeSend(ws,{type:"error",message:"房間已滿，最多6人。"});
    if(this.room.players.some(p=>p.nickname===nickname)) return this.safeSend(ws,{type:"error",message:"暱稱已被使用。"});
    const seat=this.room.players.length;
   const p={
  id:crypto.randomUUID(),
  token:token(),
  nickname,
  seat,
  connected:true,
  ready:false,
  score:0,
  lastSeen:Date.now()
};
    this.room.players.push(p);
    ws.serializeAttachment({playerId:p.id,token:p.token});
    await this.save();
    this.sendWelcome(ws,p);
    await this.broadcastRoom();
  }

  sendWelcome(ws,p){
    this.safeSend(ws,{
      type:"welcome",
      playerId:p.id,
      token:p.token,
      room:publicRoom(this.room,p.id)
    });
    if(this.room.gameState?.phase && this.room.gameState.phase!=="waiting"){
      this.sendPrivateState(ws,p.id);
    }
  }

  async onReconnect(ws,playerId){
    const p=this.room.players.find(x=>x.id===playerId);
    if(!p)return;
    p.connected=true;p.lastSeen=Date.now();
    this.sendWelcome(ws,p);
    await this.broadcastRoom();
  }

async onReady(playerId, ready){
  if (!this.room?.players) return;

  const player =
    this.room.players.find(
      p => p.id === playerId
    );

  if (!player) return;

  if (
    this.room.gameState &&
    this.room.gameState.phase !== "waiting"
  ) {
    return;
  }

  player.ready = !!ready;

  await this.save();
  await this.broadcastRoom();
}

  // 房主喺 lobby 離開就直接踢走個位；遊戲中途離開先淨係標記做離線，
  // 避免搞亂法官／老實人呢啲已經分配咗嘅角色。
  async onLeave(playerId){
    const p=this.room.players.find(x=>x.id===playerId);
    if(!p) return;

    const wasHost = p.id===this.room.hostId;
    const inLobby = !this.room.gameState || this.room.gameState.phase==="waiting";

    if(inLobby){
      this.room.players = this.room.players.filter(x=>x.id!==playerId);
      if(wasHost){
        const next = this.room.players.find(x=>x.connected) || this.room.players[0];
        this.room.hostId = next ? next.id : null;
      }
    } else {
      p.connected=false;
      p.lastSeen=Date.now();
      if(wasHost){
        const next=this.room.players.find(x=>x.connected && x.id!==p.id);
        if(next)this.room.hostId=next.id;
      }
      if(this.room.game==="game1" && this.room.gameState?.phase==="chat"){
        this.room.gameState.nextReady[p.id]=true;
      }
    }

    await this.save();
    await this.broadcastRoom();
  }

  async onStart(playerId){
    if(playerId!==this.room.hostId) return this.errorPlayer(playerId,"只有房主可以開始。");
    const connected=this.room.players.filter(p=>p.connected);
    if(connected.length<MIN_PLAYERS || connected.length>MAX_PLAYERS){
      return this.errorPlayer(playerId,"需要2-6位已連線玩家。");
    }
    const notReady =
  connected.filter(
    p =>
      p.id !== this.room.hostId &&
      !p.ready
  );

if (notReady.length > 0) {
  return this.errorPlayer(
    playerId,
    "所有玩家都準備好後才能開始。"
  );
}
    if(this.room.gameState?.phase && this.room.gameState.phase!=="waiting"){
      return this.errorPlayer(playerId,"遊戲已開始。");
    }
    if(this.room.game==="game1") await this.startGame1();
    else if(this.room.game==="game3") await this.startGame3();
    else await this.startGame2();
  }

  pickGame1Question(){
    const pool=GAME1_QUESTIONS.filter(q=>this.room.filters.includes(q.category));
    const used=new Set(this.room.gameState?.usedIds || []);
    let available=pool.filter(q=>!used.has(q.id));
    if(!available.length) available=pool;
    return shuffle(available)[0];
  }

  async startGame1(){
    const prevUsed=this.room.gameState?.usedIds || [];
    const q=this.pickGame1Question();
    this.room.gameState={
      game:"game1",phase:"vote",round:(this.room.gameState?.round||0)+1,
      question:q,usedIds:[...new Set([...prevUsed,q.id])],votes:{},nextReady:{},winner:null,endsAt:Date.now()+G1_VOTE_MS
    };
    this.room.chat=[]; // 新一題開始，舊嘅傾偈記錄唔再顯示，個聊天框先唔會越玩越長
    await this.save();
    await this.ctx.storage.setAlarm(this.room.gameState.endsAt);
    await this.broadcastRoom();
  }

  async onG1Vote(playerId,option){
  const g=this.room.gameState;

  if(!g || g.phase!=="vote") return;

  const p=this.room.players.find(
    x=>x.id===playerId
  );

  if(
    !p ||
    !p.connected ||
    ![0,1].includes(Number(option))
  ){
    return;
  }

  if(g.votes[playerId]!==undefined){
    return;
  }

  g.votes[playerId]=Number(option);

  const eligiblePlayers =
    this.room.players.filter(
      p=>p.connected
    );

  const votedCount =
    eligiblePlayers.filter(
      p=>g.votes[p.id]!==undefined
    ).length;

  await this.save();

  if(
    eligiblePlayers.length>=MIN_PLAYERS &&
    votedCount===eligiblePlayers.length
  ){
    await this.lockGame1();
    return;
  }

  await this.broadcastRoom();
}

  // Game 1 同 Game 2 嘅聊天室共用呢個方法：淨係喺啱嘅 phase 先接受發言，
  // 並將最近 100 條留喺房間狀態入面，等新加入／重連嘅玩家都睇到歷史記錄。
  async onChat(playerId,text,expectedPhase){
    const g=this.room.gameState;if(!g||g.phase!==expectedPhase)return;
    const p=this.room.players.find(x=>x.id===playerId);if(!p)return;
    const clean=String(text||"").trim().slice(0,400);if(!clean)return;
    const chat={playerId,nickname:p.nickname,text:clean,at:Date.now()};
    this.room.chat=[...(this.room.chat||[]),chat].slice(-MAX_CHAT_HISTORY);
    // 房主專屬嘅完整記錄，唔跟住 startGame1() 嘅每題重置一齊清空。
    this.room.chatArchive=[...(this.room.chatArchive||[]),chat].slice(-MAX_CHAT_ARCHIVE);
    await this.save();
    this.broadcast({type:"chat",chat});
  }

async onG1Next(playerId){
  const g = this.room.gameState;

  // 睇完結算之後，房主都可以撳呢個掣繼續玩落去（歷史記錄唔會清）。
  if (!g || (g.phase !== "chat" && g.phase !== "final")) {
    return;
  }

  // 房主隨時可以強制入下一題（包括結算完之後想繼續玩）。
  if (playerId === this.room.hostId) {
    await this.startGame1();
    return;
  }

  // 結算畫面淨係房主先可以繼續玩落去，其他人喺呢個 phase 冇「準備好」可以按。
  if (g.phase !== "chat") return;

  // 其他人按「準備好」只會標記自己已就緒；
  // 全部在線嘅非房主玩家都準備好之後先會自動入下一題。
  const player = this.room.players.find(p => p.id === playerId);
  if (!player) return;

  g.nextReady = g.nextReady || {};
  g.nextReady[playerId] = true;

  const connected = this.room.players.filter(
    p => p.connected && p.id !== this.room.hostId
  );

  const allReady =
    connected.length > 0 &&
    connected.every(p => g.nextReady[p.id]);

  if (allReady) {
    await this.startGame1();
    return;
  }

  await this.save();
  await this.broadcastRoom();
}

  async lockGame1(){
    const g=this.room.gameState;if(!g||g.phase!=="vote")return;
    const counts=[0,0];
    Object.values(g.votes||{}).forEach(v=>{if(v===0||v===1)counts[v]++});
    const winner=counts[0]===counts[1]?null:(counts[0]>counts[1]?0:1);
    g.phase="chat";g.endsAt=null;g.voteCounts=counts;g.winner=winner;

    this.room.g1History=this.room.g1History||[];
    this.room.g1History.push({
      category:g.question?.category||"未分類",
      question:g.question?.question||"",
      options:g.question?.options||[],
      votes:{...g.votes}
    });
    // 派對局唔會玩到幾百題，呢個上限純粹防止極端情況下房間狀態無限脹大。
    if(this.room.g1History.length>500) this.room.g1History.shift();

    await this.save();
    await this.broadcastRoom();
  }

  // 結算：計每兩個玩家之間「揀咗同一個選項」嘅比率，
  // 分整體同分類兩層，畀「結束並睇結算」用。
  computeG1Results(){
    const history=this.room.g1History||[];
    const players=this.room.players;
    const pairs=[];

    for(let i=0;i<players.length;i++){
      for(let j=i+1;j<players.length;j++){
        const a=players[i], b=players[j];
        let shared=0, match=0;
        const byCategory={};

        for(const round of history){
          const va=round.votes[a.id];
          const vb=round.votes[b.id];
          if(va===undefined || vb===undefined) continue;

          const cat=round.category;
          byCategory[cat]=byCategory[cat] || {shared:0,match:0};
          byCategory[cat].shared++;

          shared++;
          if(va===vb){
            match++;
            byCategory[cat].match++;
          }
        }

        if(shared===0) continue;

        pairs.push({
          aId:a.id, aName:a.nickname,
          bId:b.id, bName:b.nickname,
          shared, match,
          rate:Math.round((match/shared)*100),
          byCategory:Object.fromEntries(
            Object.entries(byCategory).map(([cat,v])=>[
              cat,
              {shared:v.shared,match:v.match,rate:Math.round((v.match/v.shared)*100)}
            ])
          )
        });
      }
    }

    pairs.sort((x,y)=>y.rate-x.rate || y.shared-x.shared);

    return {
      totalRounds:history.length,
      pairs,
      maverick:this.computeG1Maverick(history,players),
      mostDivisive:this.computeG1MostDivisive(history),
      soulmates:players.length>=3 ? this.computeG1Soulmates(pairs,players) : null
    };
  }

  // 特立獨行獎：邊個玩家最常同「全場多數」揀唔同（淨計有明確多數嘅題，即冇撞平）。
  // 只有 3 人或以上先計得出真正嘅「多數」，2 人局差異就淨係一半一半，無意義。
  computeG1Maverick(history,players){
    if(players.length<3) return null;

    const stats={};
    for(const round of history){
      const votes=round.votes||{};
      const ids=Object.keys(votes);
      if(ids.length<2) continue;

      const counts=[0,0];
      ids.forEach(id=>{const v=votes[id]; if(v===0||v===1) counts[v]++});
      if(counts[0]===counts[1]) continue; // 撞平，冇明確多數

      const majority=counts[0]>counts[1] ? 0 : 1;
      ids.forEach(id=>{
        const v=votes[id];
        if(v!==0 && v!==1) return;
        stats[id]=stats[id] || {counted:0,minority:0};
        stats[id].counted++;
        if(v!==majority) stats[id].minority++;
      });
    }

    let best=null;
    for(const p of players){
      const s=stats[p.id];
      if(!s || s.counted<2) continue;
      const rate=s.minority/s.counted;
      if(!best || s.minority>best.minority || (s.minority===best.minority && rate>best.rate)){
        best={id:p.id,name:p.nickname,minority:s.minority,counted:s.counted,rate};
      }
    }
    if(!best || best.minority===0) return null;

    return {
      id:best.id,name:best.name,
      count:best.minority,totalRounds:best.counted,
      rate:Math.round(best.rate*100)
    };
  }

  // 全場最撕裂嘅一題：邊條題目嘅投票最接近一半一半（起碼要有兩個人投先計）。
  computeG1MostDivisive(history){
    let best=null;
    for(const round of history){
      const votes=round.votes||{};
      const counts=[0,0];
      Object.values(votes).forEach(v=>{if(v===0||v===1) counts[v]++});
      const total=counts[0]+counts[1];
      if(total<2) continue;

      const score=Math.min(counts[0],counts[1])/total;
      if(!best || score>best.score){
        best={
          score,
          question:round.question||"",
          options:round.options||[],
          category:round.category||"未分類",
          countA:counts[0],countB:counts[1]
        };
      }
    }
    if(!best || best.score===0) return null; // 全員意見一致，唔算撕裂

    return {
      question:best.question,options:best.options,category:best.category,
      countA:best.countA,countB:best.countB
    };
  }

  // 每個玩家專屬一句「你嘅心有靈犀拍檔係邊個」：喺呢個玩家所有配對入面揀match rate最高嗰個。
  computeG1Soulmates(pairs,players){
    const result=[];
    for(const p of players){
      let best=null;
      for(const pair of pairs){
        if(pair.aId!==p.id && pair.bId!==p.id) continue;
        const partnerId=pair.aId===p.id ? pair.bId : pair.aId;
        const partnerName=pair.aId===p.id ? pair.bName : pair.aName;
        if(!best || pair.rate>best.rate || (pair.rate===best.rate && pair.shared>best.shared)){
          best={partnerId,partnerName,rate:pair.rate,shared:pair.shared};
        }
      }
      if(!best) continue;
      result.push({id:p.id,name:p.nickname,partnerId:best.partnerId,partnerName:best.partnerName,rate:best.rate});
    }
    return result;
  }

  async onG1Finish(playerId){
    const g=this.room.gameState;
    if(!g || g.phase!=="chat" || playerId!==this.room.hostId) return;

    g.phase="final";
    g.endsAt=null;
    g.results=this.computeG1Results();

    await this.save();
    await this.broadcastRoom();
  }

  async startGame2(){
    const players = shuffle(
      this.room.players.filter(
        p => p.connected
      )
    );

    const judge = players[0];
    const truth = players[1];

    const pool =
      GAME2_QUESTIONS.filter(
        q =>
          this.room.filters.includes(
            q.category
          )
      );

    const q = shuffle(pool)[0];

    const roles = {};

    players.forEach(
      p => {
        roles[p.id] =
          p.id === judge.id
            ? "judge"
            : p.id === truth.id
              ? "truth"
              : "bluffer";
      }
    );

    this.room.gameState = {
      game: "game2",
      phase: "prep",
      round: (this.room.gameState?.round || 0) + 1,
      term: q.term,
      category: q.category,
      privateExplanation:
        q.explanation || null,
      judgeId: judge.id,
      truthId: truth.id,
      roles,
      prepReady: {},
      // order 淨係用嚟俾前端顯示「幾多人已經發言」嘅分母，
      // 實際發言次序由法官逐個揀（picking phase）。
      order: players
        .filter(p => p.id !== judge.id)
        .map(p => p.id),
      spokenIds: [],
      candidates: [],
      currentPlayerId: null,
      endsAt: Date.now() + G2_PREP_MS
    };

    await this.save();

    await this.sendPrivateRoles();

    await this.ctx.storage.setAlarm(
      this.room.gameState.endsAt
    );

    await this.broadcastRoom();
  }

      async sendPrivateRoles(){for(const p of this.room.players){
      if(!p.connected)continue;
      const role=this.room.gameState.roles?.[p.id];
      const message={
        type:"private-role",
        role,
        explanation:role==="truth"?this.room.gameState.privateExplanation:null,
        isJudge:p.id===this.room.gameState.judgeId
      };
      this.sendToPlayer(p.id,message);
    }
  }

  sendPrivateState(ws,playerId){
    const g=this.room.gameState;if(!g||this.room.game!=="game2")return;
    const role=g.roles?.[playerId];
    if(!role)return;
    this.safeSend(ws,{
      type:"private-role",
      role,
      explanation:role==="truth"?g.privateExplanation:null,
      isJudge:playerId===g.judgeId
    });
  }

  // prep 階段大家睇緊題目，全部在線玩家都撳咗「準備好」就唔使等夠 30 秒，
  // 可以即刻入下一個階段。
  async onG2PrepReady(playerId){
    const g=this.room.gameState;
    if(!g || g.game!=="game2" || g.phase!=="prep") return;

    const p=this.room.players.find(x=>x.id===playerId);
    if(!p) return;

    g.prepReady=g.prepReady||{};
    g.prepReady[playerId]=true;

    const connected=this.room.players.filter(x=>x.connected);
    const allReady=connected.length>0 &&
      connected.every(x=>g.prepReady[x.id]);

    if(allReady){
      await this.startPickingGame2();
      return;
    }

    await this.save();
    await this.broadcastRoom();
  }

  // 揀邊個下一個發言：法官有 10 秒揀人，唔揀就隨機喺剩低未發言嘅人度抽一個。
  async startPickingGame2(){
    const g=this.room.gameState;if(!g||g.game!=="game2")return;
    const spoken=new Set(g.spokenIds||[]);
    const remaining=this.room.players.filter(
      p=>p.id!==g.judgeId && !spoken.has(p.id)
    );

    if(!remaining.length){
      await this.startJudgeGame2();
      return;
    }

    g.phase="picking";
    g.candidates=remaining.map(p=>p.id);
    g.currentPlayerId=null;
    g.endsAt=Date.now()+G2_PICK_MS;

    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  async onG2Pick(playerId,targetId){
    const g=this.room.gameState;
    if(!g||g.phase!=="picking"||playerId!==g.judgeId) return;
    if(!(g.candidates||[]).includes(targetId)) return;
    await this.beginSpeakingGame2(targetId);
  }

  async beginSpeakingGame2(targetId){
    const g=this.room.gameState;if(!g)return;
    g.phase="speaking";
    g.currentPlayerId=targetId;
    g.candidates=[];
    g.endsAt=Date.now()+G2_SPEAK_MS;

    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  async advanceAfterSpeakingGame2(){
    const g=this.room.gameState;if(!g||g.phase!=="speaking")return;
    g.spokenIds=[...(g.spokenIds||[]),g.currentPlayerId];
    g.currentPlayerId=null;
    await this.startPickingGame2();
  }

  async startJudgeGame2(){
    const g=this.room.gameState;if(!g)return;
    g.phase="judge";
    g.currentPlayerId=null;
    g.candidates=[];
    g.endsAt=Date.now()+G2_JUDGE_MS;

    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  async onG2Judge(playerId,targetId){
    const g=this.room.gameState;

    if(!g || g.phase!=="judge" || playerId!==g.judgeId)
      return;

    await this.finishJudgeGame2(targetId);
  }

  async finishJudgeGame2(targetId){
    const g=this.room.gameState;
    if(!g || g.phase!=="judge") return;

    if(!this.room.players.some(
      p => p.id===targetId && p.id!==g.judgeId
    ))
      return;

    const correct =
      targetId === g.truthId;

    if(correct){
      for(const p of this.room.players){
        if(
          p.id===g.judgeId ||
          p.id===g.truthId
        ){
          p.score=(p.score||0)+2;
        }
      }
    }else{
      for(const p of this.room.players){
        if(
          p.id!==g.judgeId &&
          p.id!==g.truthId
        ){
          p.score=(p.score||0)+1;
        }
      }
    }

    g.phase="result";
    g.targetId=targetId;
    g.correct=correct;
    g.endsAt=null;

    await this.save();
    await this.broadcastRoom();
  }

  async onG2Next(playerId){
    const g=this.room.gameState;
    if(!g||g.phase!=="result"||playerId!==this.room.hostId)return;
    await this.startGame2();
  }

  /* =========================
     Game 3 · He/She's a 10
  ========================= */

  async startGame3(){
    const players = shuffle(
      this.room.players.filter(p=>p.connected)
    );

    const totalRounds =
      this.room.rounds || players.length;

    this.room.g3RaterOrder = players.map(p=>p.id);
    this.room.g3TotalRounds = totalRounds;

    for(const p of this.room.players) p.score=0;

    await this.beginRoundGame3(1);
  }

  async beginRoundGame3(round){
    const order = this.room.g3RaterOrder || [];
    const raterId = order[(round-1) % order.length];

    const targets = {};
    for(const p of this.room.players){
      if(p.id===raterId) continue;
      targets[p.id] = 1 + Math.floor(Math.random()*10);
    }

    this.room.gameState = {
      game:"game3",
      phase:"writing",
      round,
      totalRounds:this.room.g3TotalRounds,
      raterId,
      targets,
      answers:{},
      submittedIds:[],
      ratingOrder:[],
      ratingStage:null,
      currentRatingIndex:0,
      scores:{},
      results:null,
      endsAt:Date.now()+G3_WRITE_MS
    };

    await this.save();
    await this.ctx.storage.setAlarm(this.room.gameState.endsAt);
    await this.broadcastRoom();
  }

  async onG3Submit(playerId,text){
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase!=="writing") return;
    if(playerId===g.raterId) return;
    if(!(playerId in g.targets)) return;

    const clean = String(text||"").trim().slice(0,25);
    if(!clean) return;

    g.answers[playerId]=clean;
    if(!g.submittedIds.includes(playerId)){
      g.submittedIds.push(playerId);
    }

    const writers = this.room.players.filter(
      p=>p.connected && p.id!==g.raterId
    );
    const allSubmitted =
      writers.length>0 &&
      writers.every(p=>g.submittedIds.includes(p.id));

    if(allSubmitted){
      await this.startRatingGame3();
      return;
    }

    await this.save();
    await this.broadcastRoom();
  }

  // Writing 時間到，未交嘅人自動填「（未作答）」，等評分流程可以繼續。
  async forceCloseWritingGame3(){
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase!=="writing") return;

    for(const playerId of Object.keys(g.targets)){
      if(!g.answers[playerId]){
        g.answers[playerId]="（未作答）";
      }
      if(!g.submittedIds.includes(playerId)){
        g.submittedIds.push(playerId);
      }
    }

    await this.startRatingGame3();
  }

  async startRatingGame3(){
    const g=this.room.gameState;
    if(!g || g.game!=="game3") return;

    g.phase="rating";
    g.ratingStage="preview";
    g.ratingOrder=shuffle(Object.keys(g.targets));
    g.currentRatingIndex=0;
    g.endsAt=null;

    await this.save();
    await this.broadcastRoom();
  }

  async onG3RatingStart(playerId){
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase!=="rating") return;
    if(g.ratingStage!=="preview" || playerId!==g.raterId) return;

    g.ratingStage="scoring";
    g.currentRatingIndex=0;
    g.endsAt=Date.now()+G3_SCORE_MS;

    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  async onG3Score(playerId,index,score){
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase!=="rating") return;
    if(g.ratingStage!=="scoring" || playerId!==g.raterId) return;
    if(index!==g.currentRatingIndex) return;

    const n = Math.round(Number(score));
    if(!Number.isFinite(n) || n<1 || n>10) return;

    await this.advanceRatingGame3(n);
  }

  // 評分,自動入下一句;冇下一句就結算。手動評分同timeout自動評分都經呢個function。
  async advanceRatingGame3(score){
    const g=this.room.gameState;
    if(!g || g.game!=="game3") return;

    const targetId = g.ratingOrder[g.currentRatingIndex];
    if(targetId) g.scores[targetId]=score;

    g.currentRatingIndex += 1;

    if(g.currentRatingIndex >= g.ratingOrder.length){
      await this.startRevealGame3();
      return;
    }

    g.endsAt=Date.now()+G3_SCORE_MS;
    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  async startRevealGame3(){
    const g=this.room.gameState;
    if(!g || g.game!=="game3") return;

    const results = Object.keys(g.targets).map(playerId=>{
      const target=g.targets[playerId];
      const score=g.scores[playerId] ?? Math.ceil(Math.random()*10);
      const diff=Math.abs(target-score);
      const roundPoints=10-diff;

      const p=this.room.players.find(x=>x.id===playerId);
      if(p) p.score=(p.score||0)+roundPoints;

      return {playerId,target,score,diff,roundPoints,text:g.answers[playerId]||""};
    }).sort((a,b)=>a.diff-b.diff);

    g.phase="reveal";
    g.results=results;
    g.endsAt=Date.now()+G3_REVEAL_MS;

    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  async advanceAfterRevealGame3(){
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase!=="reveal") return;

    if(g.round >= g.totalRounds){
      g.phase="gameover";
      g.endsAt=null;
      await this.save();
      await this.broadcastRoom();
      return;
    }

    await this.beginRoundGame3(g.round+1);
  }

  async errorPlayer(playerId,message){
    this.sendToPlayer(playerId,{type:"error",message});
  }

  sendToPlayer(playerId,msg){
    for(const ws of this.ctx.getWebSockets()){
      const a=ws.deserializeAttachment() || {};
      if(a.playerId===playerId)this.safeSend(ws,msg);
    }
  }

  broadcast(msg){
    const data=JSON.stringify(msg);
    for(const ws of this.ctx.getWebSockets()){
      try{ws.send(data)}catch{}
    }
  }

  async broadcastRoom(){
    for(const ws of this.ctx.getWebSockets()){
      const a=ws.deserializeAttachment() || {};
      const viewer=a.playerId||null;
      const payload=JSON.stringify({type:"state",room:publicRoom(this.room,viewer)});
      try{ws.send(payload)}catch{}
    }
  }

  safeSend(ws,msg){
    try{ws.send(JSON.stringify(msg))}catch{}
  }

  async webSocketClose(ws){
    await this.ensureLoaded();
    const a=ws.deserializeAttachment() || {};
    if(!a.playerId || !this.room)return;
    const p=this.room.players.find(x=>x.id===a.playerId);
    if(!p)return;
    p.connected=false;p.lastSeen=Date.now();

    // If the host leaves, transfer host to the first connected player.
    if(p.id===this.room.hostId){
      const next=this.room.players.find(x=>x.connected && x.id!==p.id);
      if(next)this.room.hostId=next.id;
    }

    // Don't let a disconnected player block Game 1's "everyone ready" transition.
    if(this.room.game==="game1" && this.room.gameState?.phase==="chat"){
      this.room.gameState.nextReady[p.id]=true;
    }

    await this.save();
    await this.broadcastRoom();

    if(this.room.players.every(x=>!x.connected) && !this.room.gameState){
      await this.ctx.storage.setAlarm(Date.now()+ROOM_TTL);
    }
  }

  async alarm(){
    await this.ensureLoaded();
    if(!this.room)return;

    const g=this.room.gameState;

    if(g?.phase==="vote" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.lockGame1();
      return;
    }

    if(g?.game==="game2" && g.phase==="prep" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.startPickingGame2();
      return;
    }

    if(g?.game==="game2" && g.phase==="picking" && g.endsAt && Date.now()+50>=g.endsAt){
      const cands=g.candidates||[];
      if(cands.length){
        const pick=cands[Math.floor(Math.random()*cands.length)];
        await this.beginSpeakingGame2(pick);
      } else {
        await this.startJudgeGame2();
      }
      return;
    }

    if(g?.game==="game2" && g.phase==="speaking" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.advanceAfterSpeakingGame2();
      return;
    }

    if(g?.game==="game2" && g.phase==="judge" && g.endsAt && Date.now()+50>=g.endsAt){
      const choices=this.room.players.filter(p=>p.id!==g.judgeId);
      if(choices.length){
        const target=choices[Math.floor(Math.random()*choices.length)];
        await this.finishJudgeGame2(target.id);
      }
      return;
    }

    if(g?.game==="game3" && g.phase==="writing" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.forceCloseWritingGame3();
      return;
    }

    if(g?.game==="game3" && g.phase==="rating" && g.ratingStage==="scoring" && g.endsAt && Date.now()+50>=g.endsAt){
      // 莊家冇及時評分，用隨機分數頂住，等遊戲繼續行落去。
      await this.advanceRatingGame3(1 + Math.floor(Math.random()*10));
      return;
    }

    if(g?.game==="game3" && g.phase==="reveal" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.advanceAfterRevealGame3();
      return;
    }

    if(this.room.players.every(x=>!x.connected) && (!g || g.phase==="waiting" || g.phase==="result" || g.phase==="gameover")){
      await this.ctx.storage.deleteAll();
    }
  }
}
