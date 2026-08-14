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
function validGame(v) { return v==="game1" || v==="game2"; }

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
    gameState: publicGameState(room),
    viewerRole: viewerId && room.gameState?.roles?.[viewerId] || null,
    viewerExplanation: viewerId && room.gameState?.roles?.[viewerId]==="truth"
      ? room.gameState.privateExplanation || null
      : null
  };
}

function publicGameState(room) {
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
winner:g.winner ?? null
    };
  }

  const base={
    phase:g.phase, round:g.round, term:g.term || null,
    endsAt:g.endsAt||null, judgeId:g.judgeId||null,
    order:g.order||[], currentPlayerId:g.currentPlayerId||null
  };

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
        hostId:null,
        players:[],
        gameState:null,
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
      case "g1:vote": return this.onG1Vote(session.playerId,msg.option);
      case "g1:chat": return this.onG1Chat(session.playerId,msg.text);
      case "g1:next": return this.onG1Next(session.playerId);
      case "g2:chat": return this.onG2Chat(session.playerId,msg.text);
      case "g2:judge": return this.onG2Judge(session.playerId,msg.targetId);
      case "g2:next": return this.onG2Next(session.playerId);
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
  
  async onStart(playerId){
    if(playerId!==this.room.hostId) return this.errorPlayer(playerId,"只有房主可以開始。");
    const connected=this.room.players.filter(p=>p.connected);
    if(connected.length<MIN_PLAYERS || connected.length>MAX_PLAYERS){
      return this.errorPlayer(playerId,"需要2-6位已連線玩家。");
    }
    const notReady =
  connected.filter(
    p => !p.ready
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
      question:q,usedIds:[...new Set([...prevUsed,q.id])],votes:{},nextReady:{},winner:null,endsAt:Date.now()+10000
    };
    await this.save();
    await this.ctx.storage.setAlarm(this.room.gameState.endsAt);
    await this.broadcastRoom();
  }

  async onG1Vote(playerId,option){
    const g=this.room.gameState;
    if(!g || g.phase!=="vote") return;
    const p=this.room.players.find(x=>x.id===playerId);
    if(!p || !p.connected || ![0,1].includes(Number(option))) return;
    if(g.votes[playerId]!==undefined)return;
    g.votes[playerId]=Number(option);
    await this.save();
    await this.broadcastRoom();
  }

  async onG1Chat(playerId,text){
    const g=this.room.gameState;if(!g||g.phase!=="chat")return;
    const p=this.room.players.find(x=>x.id===playerId);if(!p)return;
    const clean=String(text||"").trim().slice(0,400);if(!clean)return;
    this.broadcast({type:"chat",chat:{playerId,nickname:p.nickname,text:clean,at:Date.now()}});
  }

async onG1Next(playerId){
  const g = this.room.gameState;

  if (!g || g.phase !== "chat") {
    return;
  }

  if (playerId !== this.room.hostId) {
    return this.errorPlayer(
      playerId,
      "只有房主可以進入下一題。"
    );
  }

  await this.startGame1();
}

  async lockGame1(){
    const g=this.room.gameState;if(!g||g.phase!=="vote")return;
    const counts=[0,0];
    Object.values(g.votes||{}).forEach(v=>{if(v===0||v===1)counts[v]++});
    const winner=counts[0]===counts[1]?null:(counts[0]>counts[1]?0:1);
    g.phase="chat";g.endsAt=null;g.voteCounts=counts;g.winner=winner;
    await this.save();
    await this.broadcastRoom();
  }

  async startGame2(){
    const players=shuffle(this.room.players.filter(p=>p.connected));
    const judge=players[0];
    const truth=players[1];
    const pool=GAME2_QUESTIONS.filter(q=>this.room.filters.includes(q.category));
    const q=shuffle(pool)[0];
    const order=shuffle(players.map(p=>p.id));
    const roles={};
    players.forEach(p=>roles[p.id]=p.id===judge.id?"judge":p.id===truth.id?"truth":"bluffer");
   this.room.gameState={
  game:"game1",
  phase:"intro",
  round:(this.room.gameState?.round||0)+1,
  question:q,
  usedIds:[
    ...new Set([
      ...prevUsed,
      q.id
    ])
  ],
  votes:{},
  nextReady:{},
  winner:null,
  endsAt:Date.now()+2000
};
  async startVoteGame1(){
  const g = this.room.gameState;

  if (!g || g.phase !== "intro") {
    return;
  }

  g.phase = "vote";
  g.votes = {};
  g.winner = null;
  g.endsAt = Date.now() + 10000;

  await this.save();

  await this.ctx.storage.setAlarm(
    g.endsAt
  );

  await this.broadcastRoom();
}
    await this.save();
    await this.sendPrivateRoles();
    await this.ctx.storage.setAlarm(this.room.gameState.endsAt);
    await this.broadcastRoom();
  }

  async sendPrivateRoles(){
    for(const p of this.room.players){
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

  async startSpeakingGame2(){
    const g=this.room.gameState;if(!g||g.phase!=="prep")return;
    g.phase="speaking";g.currentIndex=0;g.currentPlayerId=g.order[0];g.endsAt=Date.now()+60000;
    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  if(
  g?.game==="game1" &&
  g.phase==="intro" &&
  g.endsAt &&
  Date.now()+50>=g.endsAt
){
  await this.startVoteGame1();
  return;
}

  async advanceSpeakingGame2(){
    const g=this.room.gameState;if(!g||g.phase!=="speaking")return;
    const next=g.currentIndex+1;
    if(next>=g.order.length){
      g.phase="judge";g.currentPlayerId=null;g.endsAt=null;
      await this.save();await this.broadcastRoom();return;
    }
    g.currentIndex=next;g.currentPlayerId=g.order[next];g.endsAt=Date.now()+60000;
    await this.save();await this.ctx.storage.setAlarm(g.endsAt);await this.broadcastRoom();
  }

  async onG2Chat(playerId,text){
    const g=this.room.gameState;if(!g||g.phase!=="speaking"||g.currentPlayerId!==playerId)return;
    const p=this.room.players.find(x=>x.id===playerId);if(!p)return;
    const clean=String(text||"").trim().slice(0,400);if(!clean)return;
    this.broadcast({type:"chat",chat:{playerId,nickname:p.nickname,text:clean,at:Date.now()}});
  }

  async onG2Judge(playerId,targetId){
    const g=this.room.gameState;
    if(!g||g.phase!=="judge"||playerId!==g.judgeId)return;
    if(!this.room.players.some(p=>p.id===targetId && p.id!==g.judgeId))return;
    const correct=targetId===g.truthId;
    if(correct){
      for(const p of this.room.players){
        if(p.id===g.judgeId||p.id===g.truthId)p.score=(p.score||0)+2;
      }
    }else{
      for(const p of this.room.players){
        if(p.id!==g.judgeId && p.id!==g.truthId)p.score=(p.score||0)+1;
      }
    }
    g.phase="result";g.targetId=targetId;g.correct=correct;g.endsAt=null;
    await this.save();await this.broadcastRoom();
  }

  async onG2Next(playerId){
    const g=this.room.gameState;
    if(!g||g.phase!=="result"||playerId!==this.room.hostId)return;
    await this.startGame2();
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
    const data=JSON.stringify({type:"state",room:this.room.players.map(p=>p.id)});
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
      await this.startSpeakingGame2();
      return;
    }
    if(g?.game==="game2" && g.phase==="speaking" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.advanceSpeakingGame2();
      return;
    }

    if(this.room.players.every(x=>!x.connected) && (!g || g.phase==="waiting" || g.phase==="result")){
      await this.ctx.storage.deleteAll();
    }
  }
}
