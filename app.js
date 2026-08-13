
const $ = (s) => document.querySelector(s);
const state = {
  questions: null,
  role: null, // "host" | "guest"
  roomCode: "",
  game: "game1",
  nickname: "",
  filters: [],
  hostId: null,
  host: null,
  peers: new Map(),
  dataChannel: null,
  playerId: null,
  players: [],
  gameState: null,
  offerContext: null,
  localConnection: null,
  myRole: null,
  myExplanation: null,
  chat: [],
  timerId: null
};

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

function enc(obj) {
  const raw = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/,"");
}
function dec(str) {
  const b64 = String(str).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(str).length+3)%4);
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}
function uid(prefix="p") { return prefix + Math.random().toString(36).slice(2,10); }
function shuffle(a) { return [...a].sort(() => Math.random() - .5); }
function esc(s) { return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function setStatus(text, error=false) {
  const el=$("#status");
  if (!el) return;
  el.className="status" + (error ? " error" : "");
  el.classList.remove("hidden");
  el.textContent=text;
}
function hideLanding() {
  document.body.classList.add("in-game");
  $("#roomView").classList.remove("hidden");
}
function showLanding() {
  document.body.classList.remove("in-game");
  $("#roomView").classList.add("hidden");
}
function copyText(text) {
  navigator.clipboard?.writeText(text).then(()=>setStatus("已複製。"));
}
function waitIceComplete(pc, timeout=9000) {
  return new Promise(resolve=>{
    if (pc.iceGatheringState === "complete") return resolve();
    const onChange=()=>{
      if (pc.iceGatheringState==="complete") { cleanup(); resolve(); }
    };
    const timer=setTimeout(()=>{cleanup();resolve();},timeout);
    const cleanup=()=>{pc.removeEventListener("icegatheringstatechange",onChange);clearTimeout(timer)};
    pc.addEventListener("icegatheringstatechange",onChange);
  });
}

async function loadQuestions() {
  const r = await fetch("./questions.json", {cache:"no-store"});
  if (!r.ok) throw new Error("questions.json 載入失敗");
  state.questions = await r.json();
  renderFilters();
}
loadQuestions().catch(err=>setStatus(err.message,true));

function categoriesFor(game) {
  return game === "game1" ? state.questions.game1.categories : state.questions.game2.categories;
}
function renderFilters() {
  if (!state.questions) return;
  const cats=categoriesFor($("#hostGame").value);
  const selected=state.filters.length?state.filters:cats;
  $("#createFilters").innerHTML=cats.map(c=>
    `<button type="button" class="filter-chip ${selected.includes(c)?"active":""}" data-cat="${esc(c)}">${esc(c)}</button>`
  ).join("");
  $("#createFilters").querySelectorAll(".filter-chip").forEach(btn=>{
    btn.onclick=()=>{
      btn.classList.toggle("active");
      state.filters=[...$("#createFilters").querySelectorAll(".filter-chip.active")].map(x=>x.dataset.cat);
      if (!state.filters.length) state.filters=cats;
    };
  });
}
$("#hostGame").onchange=()=>{state.filters=[];renderFilters();};
$("#selectAllCats").onclick=()=>{
  const cats=categoriesFor($("#hostGame").value);
  const buttons=[...$("#createFilters").querySelectorAll(".filter-chip")];
  const all=buttons.every(b=>b.classList.contains("active"));
  buttons.forEach(b=>b.classList.toggle("active",!all));
  state.filters=all?[]:cats;
};

document.querySelectorAll("[data-scroll]").forEach(b=>b.onclick=()=>document.querySelector(b.dataset.scroll)?.scrollIntoView({behavior:"smooth"}));
document.querySelectorAll("[data-tab]").forEach(tab=>tab.onclick=()=>{
  document.querySelectorAll("[data-tab]").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
  tab.classList.add("active");
  $("#" + (tab.dataset.tab==="create"?"createTab":"joinTab")).classList.add("active");
});
document.querySelectorAll("[data-game-start]").forEach(b=>b.onclick=()=>{
  $("#hostGame").value=b.dataset.game;
  state.filters=[];
  renderFilters();
  document.querySelector('[data-tab="create"]').click();
  $("#room").scrollIntoView({behavior:"smooth"});
});

$("#createBtn").onclick=createRoom;
$("#joinBtn").onclick=joinRoom;
$("#backHome").onclick=()=>{ cleanupAll(); showLanding(); window.scrollTo(0,0); };

async function createRoom() {
  try {
    state.role="host";
    state.nickname=$("#hostName").value.trim()||"玩家";
    state.game=$("#hostGame").value;
    state.filters=state.filters.length?state.filters:categoriesFor(state.game);
    state.roomCode=Math.random().toString(36).slice(2,8).toUpperCase();
    state.playerId=uid("host-");
    state.hostId=state.playerId;
    state.players=[{id:state.playerId,nickname:state.nickname,host:true}];
    state.host={};
    hideLanding();
    $("#roomCodeLabel").textContent=state.roomCode;
    $("#peerStatus").textContent="HOST";
    $("#peerStatus").classList.add("online");
    renderHostPanel();
    renderWaitingPanel();
    syncAll();
  } catch(e) { setStatus(e.message,true); }
}

function renderHostPanel() {
  const el=$("#hostPanel"); el.classList.remove("hidden");
  el.innerHTML=`
    <div class="sync-room">
      <div>
        <div class="eyebrow">YOUR ROOM</div>
        <div class="room-code-box"><span>ROOM CODE</span><br><strong>${esc(state.roomCode)}</strong></div>
        <p class="notice">房間號只是識別名稱。純 GitHub Pages 沒有房間伺服器，所以朋友仍需要房主提供一次性 WebRTC 邀請資料才能加入。</p>
      </div>
      <div class="invite-box">
        <div class="eyebrow">INVITE ONE PLAYER</div>
        <p class="notice">每位玩家都需要一份新的邀請資料。先點「產生邀請」，把資料發給一位朋友。</p>
        <button id="makeOfferBtn" class="btn btn-yellow">CREATE INVITE</button>
        <textarea id="offerOut" readonly placeholder="這裡會出現邀請資料"></textarea>
        <div class="copy-row">
          <button id="copyOffer" class="btn btn-light">COPY INVITE</button>
          <button id="applyAnswer" class="btn btn-blue">PASTE PLAYER ANSWER</button>
        </div>
        <textarea id="answerIn" placeholder="玩家把 Answer 貼在這裡"></textarea>
      </div>
    </div>
    <div style="margin-top:16px">
      <div class="eyebrow">PLAYERS</div>
      <div id="hostPlayers" class="player-list"></div>
    </div>
  `;
  $("#makeOfferBtn").onclick=makeOffer;
  $("#copyOffer").onclick=()=>copyText($("#offerOut").value);
  $("#applyAnswer").onclick=applyAnswer;
  renderHostPlayers();
}

function renderHostPlayers() {
  const el=$("#hostPlayers"); if(!el)return;
  el.innerHTML=state.players.map(p=>`<div class="player-pill ${p.host?'host':''}">${p.host?'👑 ':''}${esc(p.nickname)}</div>`).join("");
}

async function makeOffer() {
  if (state.players.length>=6) return setStatus("房間已滿。");
  const guestKey=uid("guest-");
  const pc=new RTCPeerConnection(RTC_CONFIG);
  const dc=pc.createDataChannel("game");
  state.peers.set(guestKey,{pc,dc,guestKey});
  dc.onopen=()=>{ setStatus("玩家已連線：" + guestKey); renderHostPlayers(); sendInitToGuest(guestKey); };
  dc.onclose=()=>handlePeerClosed(guestKey);
  dc.onmessage=(ev)=>handleHostMessage(guestKey,JSON.parse(ev.data));
  pc.onconnectionstatechange=()=>{
    if(["failed","closed","disconnected"].includes(pc.connectionState)) handlePeerClosed(guestKey);
  };
  const offer=await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceComplete(pc);
  const packet={v:1,type:"offer",room:state.roomCode,game:state.game,hostName:state.nickname,guestKey,description:pc.localDescription};
  $("#offerOut").value=enc(packet);
  setStatus("邀請已產生。把上面的資料發給一位朋友。");
}

async function applyAnswer() {
  const token=$("#answerIn").value.trim();
  if(!token)return setStatus("請貼上玩家的 Answer。",true);
  let packet;
  try{packet=dec(token)}catch{ return setStatus("Answer 格式無效。",true); }
  if(packet.type!=="answer"||packet.room!==state.roomCode)return setStatus("Answer 不屬於目前房間。",true);
  const item=state.peers.get(packet.guestKey);
  if(!item)return setStatus("找不到對應的邀請。請重新產生邀請。",true);
  await item.pc.setRemoteDescription(packet.description);
  setStatus("Answer 已套用，等待 P2P 連線完成。");
}

async function joinRoom() {
  const nickname=$("#guestName").value.trim()||"玩家";
  const roomCode=$("#guestCode").value.trim().toUpperCase();
  let packet;
  try{packet=dec($("#offerInput").value.trim())}catch{return setStatus("邀請資料格式無效。",true);}
  if(packet.type!=="offer"||packet.room!==roomCode)return setStatus("房間號與邀請資料不一致。",true);

  state.role="guest"; state.nickname=nickname; state.roomCode=roomCode; state.game=packet.game; state.hostId=null;
  state.playerId=uid("guest-");
  const pc=new RTCPeerConnection(RTC_CONFIG);
  state.localConnection=pc;
  pc.ondatachannel=(e)=>{
    state.dataChannel=e.channel;
    e.channel.onopen=()=>{ setGuestStatus("CONNECTED"); sendToHost({type:"hello",nickname:state.nickname,guestKey:packet.guestKey,clientId:state.playerId}); };
    e.channel.onmessage=(ev)=>handleGuestMessage(JSON.parse(ev.data));
    e.channel.onclose=()=>setGuestStatus("DISCONNECTED");
  };
  pc.onconnectionstatechange=()=>setGuestStatus(pc.connectionState.toUpperCase());
  await pc.setRemoteDescription(packet.description);
  const answer=await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIceComplete(pc);

  hideLanding();
  $("#roomCodeLabel").textContent=state.roomCode;
  $("#peerStatus").textContent="ANSWER READY";
  const answerPacket={v:1,type:"answer",room:state.roomCode,guestKey:packet.guestKey,description:pc.localDescription};
  renderGuestPanel(enc(answerPacket));
}

function renderGuestPanel(answerToken) {
  const el=$("#guestPanel");el.classList.remove("hidden");
  el.innerHTML=`
    <div class="eyebrow">JOINING ${esc(state.game==="game1"?"心有靈犀一點通":"9upper瞎掰王")}</div>
    <div class="sync-room">
      <div class="room-code-box"><span>ROOM CODE</span><br><strong>${esc(state.roomCode)}</strong></div>
      <div><p class="notice">把以下 Answer 複製回房主。成功連線後就可以開始遊戲。</p><textarea id="answerOut" readonly></textarea><button id="copyAnswer" class="btn btn-yellow">COPY ANSWER</button></div>
    </div>
    <div style="margin-top:16px"><div class="eyebrow">CONNECTION</div><p id="guestHint" class="notice">等待房主確認連線…</p></div>`;
  $("#answerOut").value=answerToken;
  $("#copyAnswer").onclick=()=>copyText(answerToken);
}

function setGuestStatus(text){$("#peerStatus").textContent=text;$("#peerStatus").classList.toggle("online",text==="CONNECTED");}

function sendToHost(msg){if(state.dataChannel?.readyState==="open")state.dataChannel.send(JSON.stringify(msg));}
function sendToPeer(item,msg){if(item.dc?.readyState==="open")item.dc.send(JSON.stringify(msg));}

function sendInitToGuest(guestKey){
  const item=state.peers.get(guestKey); if(!item)return;
  sendToPeer(item,{type:"hello-ack",room:state.roomCode,game:state.game,hostName:state.nickname,players:state.players});
}

function handleHostMessage(guestKey,msg){
  if(msg.type==="hello"){
    const existing=state.players.find(p=>p.guestKey===guestKey);
    if(!existing){
      if(state.players.length>=6)return;
      const p={id:msg.clientId,nickname:String(msg.nickname||"玩家").slice(0,20),host:false,guestKey};
      state.players.push(p);
      const item=state.peers.get(guestKey); if(item)item.playerId=p.id;
      renderHostPlayers(); syncAll();
      setStatus(`${p.nickname} 已加入。`);
    }
  } else if(msg.type==="action"){ handleHostAction(guestKey,msg.action,msg.payload); }
}
function handleGuestMessage(msg){
  if(msg.type==="hello-ack"){state.players=msg.players||[];state.game=msg.game;$("#guestHint").textContent="已與房主建立資料通道。等待開始。";renderWaitingPanel();}
  if(msg.type==="sync"){state.players=msg.state.players||state.players;state.gameState=msg.state.gameState;state.myRole=msg.state.myRole||state.myRole;state.myExplanation=msg.state.myExplanation||state.myExplanation;renderWaitingPanel();renderGame();}
  if(msg.type==="chat"){state.chat.push(msg.message);renderGame();}
  if(msg.type==="role"){state.myRole=msg.role;state.myExplanation=msg.explanation||null;renderGame();}
  if(msg.type==="started"){state.players=msg.players;state.game=msg.game;renderGame();}
  if(msg.type==="error"){setStatus(msg.message,true);}
}

function syncAll(){
  for(const [key,item] of state.peers.entries()){
    sendToPeer(item,{type:"sync",state:{players:state.players,gameState:state.gameState,myRole:roleFor(item.playerId)}});
  }
}
function roleFor(playerId){
  if(!state.gameState?.roles)return null;
  return state.gameState.roles[playerId]||null;
}
function handleHostAction(guestKey,action,payload){
  const player=state.players.find(p=>p.guestKey===guestKey); if(!player)return;
  if(action==="vote1") hostVote(player.id,payload.option);
  if(action==="chat1") hostChat(player.id,payload.text);
  if(action==="next1") hostNext(player.id);
  if(action==="chat2") hostChat2(player.id,payload.text);
  if(action==="judge2") hostJudge(player.id,payload.targetId);
}

function hostSend(playerId,msg){
  const p=state.players.find(x=>x.id===playerId); if(!p||p.host)return;
  const item=state.peers.get(p.guestKey); if(item)sendToPeer(item,msg);
}
function broadcast(msg){
  for(const p of state.players) if(!p.host)hostSend(p.id,msg);
}
function setHostGameState(gs){
  state.gameState=gs;
  broadcast({type:"sync",state:{players:state.players,gameState:gs}});
  renderGame();
}

function startHostGame(){
  if(state.players.length<4||state.players.length>6)return setStatus("需要 4–6 位玩家。",true);
  if(state.game==="game1") startGame1(); else startGame2();
}
function renderWaitingPanel(){
  const gp=$("#gamePanel"); if(!gp)return;
  if(state.gameState?.phase) return;
  const cats=state.filters.length?state.filters:categoriesFor(state.game);
  gp.innerHTML=`
    <div class="eyebrow">READY CHECK</div>
    <h2 class="game-title">${state.game==="game1"?"心有靈犀一點通":"9upper瞎掰王"}</h2>
    <p class="notice">目前 ${state.players.length}/6 人。至少需要 2 人才能開始。</p>
    <div class="player-list">${state.players.map(p=>`<div class="player-pill ${p.host?'host':''}">${p.host?'👑 ':''}${esc(p.nickname)}</div>`).join("")}</div>
    <p class="notice">已選分類：${cats.map(esc).join(" · ")}</p>
    ${state.role==="host"?`<div class="host-controls"><button id="startBtn" class="btn btn-yellow">START GAME</button></div>`:""}
  `;
  $("#startBtn")?.addEventListener("click",startHostGame);
}

function filtered1(){
  const cats=state.filters.length?state.filters:state.questions.game1.categories;
  return state.questions.game1.questions.filter(q=>cats.includes(q.category));
}
function filtered2(){
  const cats=state.filters.length?state.filters:state.questions.game2.categories;
  return state.questions.game2.questions.filter(q=>cats.includes(q.category));
}
function startGame1(){
  const q=shuffle(filtered1())[0];
  state.gameState={game:"game1",phase:"vote",round:1,question:q,votes:{},nextReady:{},endsAt:Date.now()+10000};
  state.chat=[];
  syncAll(); renderGame();
  scheduleHostTimer(10000,()=>lockGame1());
}
function lockGame1(){
  if(state.gameState?.phase!=="vote")return;
  const counts=[0,0];
  Object.values(state.gameState.votes).forEach(v=>{if(v===0||v===1)counts[v]++});
  const winner=counts[0]===counts[1]?null:(counts[0]>counts[1]?0:1);
  state.gameState={...state.gameState,phase:"chat",votes:counts, winner, endsAt:null,nextReady:{}};
  broadcast({type:"sync",state:{players:state.players,gameState:state.gameState}});
  renderGame();
}
function hostVote(playerId,option){
  if(state.gameState?.phase!=="vote")return;
  if(state.gameState.votes[playerId]!==undefined)return;
  if(option!==0&&option!==1)return;
  state.gameState.votes[playerId]=option;
  broadcast({type:"sync",state:{players:state.players,gameState:state.gameState}});
  renderGame();
}
function hostChat(playerId,text){
  if(state.gameState?.phase!=="chat")return;
  addHostChat(playerId,text);
}
function hostNext(playerId){
  if(state.gameState?.phase!=="chat")return;
  state.gameState.nextReady[playerId]=true;
  const count=Object.keys(state.gameState.nextReady).length;
  if(count>=state.players.length){
    const q=shuffle(filtered1())[0];
    state.gameState={game:"game1",phase:"vote",round:state.gameState.round+1,question:q,votes:{},nextReady:{},endsAt:Date.now()+10000};
    syncAll();renderGame();scheduleHostTimer(10000,()=>lockGame1());
  }else{broadcast({type:"sync",state:{players:state.players,gameState:state.gameState}});renderGame();}
}

function addHostChat(playerId,text){
  const p=state.players.find(x=>x.id===playerId);
  const m={playerId,nickname:p?.nickname||"玩家",text:String(text||"").trim().slice(0,300),at:Date.now()};
  if(!m.text)return; state.chat.push(m); state.chat=state.chat.slice(-100);
  broadcast({type:"chat",message:m}); renderGame();
}
function hostChat2(playerId,text){
  const gs=state.gameState;
  if(gs?.phase!=="speaking"||gs.currentPlayerId!==playerId)return;
  addHostChat(playerId,text);
}
function startGame2(){
  const ps=shuffle(state.players);
  const judge=ps[0],truth=ps[1],q=shuffle(filtered2())[0];
  const order=shuffle(state.players.map(p=>p.id));
  const roles={};state.players.forEach(p=>roles[p.id]=p.id===judge.id?"judge":p.id===truth.id?"truth":"bluffer");
  state.gameState={game:"game2",phase:"prep",term:q.term,correct:q.explanation,judgeId:judge.id,truthId:truth.id,roles,order,currentIndex:0,currentPlayerId:null,endsAt:Date.now()+30000,round:1};
  state.chat=[];
  state.myRole=roles[state.playerId]||null;
  state.myExplanation=state.playerId===truth.id?q.explanation:null;
  for(const p of state.players)if(!p.host)hostSend(p.id,{type:"role",role:roles[p.id],explanation:p.id===truth.id?q.explanation:null});
  broadcast({type:"sync",state:{players:state.players,gameState:{...state.gameState,correct:undefined,roles:undefined}}});
  renderGame();
  scheduleHostTimer(30000,()=>startSpeaking2());
}
function startSpeaking2(){
  if(state.gameState?.phase!=="prep")return;
  state.gameState={...state.gameState,phase:"speaking",currentIndex:0,currentPlayerId:state.gameState.order[0],endsAt:Date.now()+60000};
  state.chat=[];broadcast({type:"sync",state:{players:state.players,gameState:{...state.gameState,correct:undefined,roles:undefined}}});renderGame();
  scheduleHostTimer(60000,()=>advanceSpeaker2());
}
function advanceSpeaker2(){
  if(state.gameState?.phase!=="speaking")return;
  const idx=state.gameState.currentIndex+1;
  if(idx>=state.gameState.order.length){startJudge2();return;}
  state.gameState={...state.gameState,currentIndex:idx,currentPlayerId:state.gameState.order[idx],endsAt:Date.now()+60000};
  broadcast({type:"sync",state:{players:state.players,gameState:{...state.gameState,correct:undefined,roles:undefined}}});renderGame();
  scheduleHostTimer(60000,()=>advanceSpeaker2());
}
function startJudge2(){
  state.gameState={...state.gameState,phase:"judge",currentPlayerId:null,endsAt:null};
  broadcast({type:"sync",state:{players:state.players,gameState:{...state.gameState,correct:undefined,roles:undefined}}});renderGame();
}
function hostJudge(playerId,targetId){
  if(state.gameState?.phase!=="judge"||playerId!==state.gameState.judgeId)return;
  const correct=targetId===state.gameState.truthId;
  state.gameState={...state.gameState,phase:"result",targetId,correct,scores:score2(correct),endsAt:null};
  // Only the result is public now. The role map and explanation stay out of the public state.
  const publicResult = {...state.gameState, roles:undefined, correct:state.gameState.correct};
  broadcast({type:"sync",state:{players:state.players,gameState:publicResult}});
  renderGame();
}
function score2(correct){
  const s={};state.players.forEach(p=>s[p.id]=0);
  if(correct){s[state.gameState.judgeId]=2;s[state.gameState.truthId]=2}
  else state.players.forEach(p=>{if(p.id!==state.gameState.judgeId&&p.id!==state.gameState.truthId)s[p.id]=1});
  return s;
}

function scheduleHostTimer(ms,fn){
  clearTimeout(state.timerId);state.timerId=setTimeout(fn,ms);
}

function emitGuestAction(action,payload){sendToHost({type:"action",action,payload});}

function renderGame(){
  const gp=$("#gamePanel"); if(!gp)return;
  const gs=state.gameState;
  if(!gs){renderWaitingPanel();return;}
  if(gs.game==="game1")renderGame1();else renderGame2();
}

function roleCard(){
  if(!state.myRole)return "";
  const label=state.myRole==="judge"?"法官（公開）":state.myRole==="truth"?"直言者":"騙子";
  return `<div class="role-card ${state.myRole}"><div class="eyebrow">YOUR ROLE</div><strong style="font-family:Fredoka;font-size:30px">${label}</strong>${state.myExplanation?`<p><b>正確解釋：</b>${esc(state.myExplanation)}</p>`:""}</div>`;
}

function renderGame1(){
  const gs=state.gameState,q=gs.question; const me=state.playerId||state.hostId;
  if(gs.phase==="vote"){
    const myVote=gs.votes?.[me];
    $("#gamePanel").innerHTML=`
      <div class="row" style="justify-content:space-between;align-items:end"><div><div class="eyebrow">ROUND ${gs.round}</div><h2 class="game-title">心有靈犀<br><span>一點通</span></h2></div><div class="timer" id="gameTimer"></div></div>
      <div class="question-box">${esc(q.question)}</div>
      <div class="option-grid">${q.options.map((x,i)=>`<button class="option-btn ${myVote===i?'selected':''}" ${myVote!==undefined?'disabled':''} onclick="castVote(${i})">${String.fromCharCode(65+i)} · ${esc(x)}</button>`).join("")}</div>
      <p class="notice">每人只能投一次；${myVote!==undefined?"已送出答案，等待其他玩家。":"10 秒內完成投票。"}</p>`;
    startDisplayTimer($("#gameTimer"),gs.endsAt);
  }else{
    const counts=gs.votes||[0,0];
    $("#gamePanel").innerHTML=`
      <div class="row" style="justify-content:space-between;align-items:end"><div><div class="eyebrow">RESULT · ROUND ${gs.round}</div><h2 class="game-title">WHAT DID <span>EVERYONE THINK?</span></h2></div></div>
      <div class="question-box">${esc(q.question)}</div>
      <div class="vote-bars">
        ${q.options.map((x,i)=>`<div class="bar-row"><b>${String.fromCharCode(65+i)}</b><div class="bar"><div class="bar-fill ${gs.winner===i?'winner':''}" style="width:${Math.max(5,(counts[i]||0)/(state.players.length||1)*100)}%"></div></div><b>${counts[i]||0}</b></div>`).join("")}
      </div>
      <div class="${gs.winner===null?'status':'result-banner'}">${gs.winner===null?"打平！":"多數選擇："+String.fromCharCode(65+gs.winner)+" · "+esc(q.options[gs.winner])}</div>
      <div style="height:16px"></div>
      <div class="eyebrow">TALK IT OUT</div>
      <div id="chat1" class="chat-log">${renderChatHtml()}</div>
      <div class="row" style="margin-top:10px"><input id="chatInput1" placeholder="說說你的理由…"><button class="btn btn-blue" onclick="sendChat1()">SEND</button><button class="btn btn-yellow" onclick="next1()">NEXT QUESTION</button></div>
      <p class="notice">已準備下一題：${Object.keys(gs.nextReady||{}).length}/${state.players.length}</p>`;
    scrollChat("chat1");startDisplayTimer(null,null);
  }
}
function renderChatHtml(){return state.chat.map(m=>`<div class="chat-msg"><b>${esc(m.nickname)}</b>：${esc(m.text)}</div>`).join("");}
function appendChatMessage(m){state.chat.push(m);state.chat=state.chat.slice(-100);renderGame();}

window.castVote=i=>{if(state.role==="host")hostVote(state.playerId,i);else emitGuestAction("vote1",{option:i});};
window.sendChat1=()=>{const x=$("#chatInput1");if(!x)return;const text=x.value.trim();x.value="";if(state.role==="host")hostChat(state.playerId,text);else emitGuestAction("chat1",{text});};
window.next1=()=>{if(state.role==="host")hostNext(state.playerId);else emitGuestAction("next1",{});};

function renderGame2(){
  const gs=state.gameState;
  let html=`<div class="row" style="justify-content:space-between;align-items:end"><div><div class="eyebrow">9UPPER BLUFF GAME</div><h2 class="game-title">瞎掰王<br><span>${esc(gs.term||"")}</span></h2></div>${gs.endsAt?`<div id="gameTimer" class="timer"></div>`:""}</div>`;
  html+=roleCard();
  if(gs.phase==="prep")html+=`<div class="status">準備 30 秒。先不要發言。直言者已經看到了正確解釋，其餘玩家只看到術語。</div>`;
  if(gs.phase==="speaking"){
    const active=state.players.find(p=>p.id===gs.currentPlayerId);
    const canSpeak=gs.currentPlayerId===(state.role==="host"?state.playerId:state.playerId);
    html+=`<div class="status">目前發言：<b>${esc(active?.nickname||"")}</b> ${canSpeak?"— 輪到你了。":""}</div>`;
    html+=`<div id="chat2" class="chat-log">${renderChatHtml()}</div><div class="row" style="margin-top:10px"><input id="chatInput2" ${canSpeak?"":"disabled"} placeholder="${canSpeak?"解釋這個術語…":"等待當前玩家發言…"}"><button class="btn btn-blue" ${canSpeak?"":"disabled"} onclick="sendChat2()">SEND</button></div>`;
  }
  if(gs.phase==="judge"){
    const choices=state.players.filter(p=>p.id!==gs.judgeId);
    const isJudge=(state.role==="host"?state.playerId:state.playerId)===gs.judgeId;
    html+=`<div class="eyebrow" style="margin-top:20px">JUDGE ${isJudge?"YOU":"PHASE"}</div>`;
    html+=isJudge?`<div class="choice-grid">${choices.map(p=>`<button class="choice-btn" onclick="judge2('${p.id}')">${esc(p.nickname)}</button>`).join("")}</div>`:`<div class="status">等待法官做出選擇。</div>`;
  }
  if(gs.phase==="result"){
    const truth=state.players.find(p=>p.id===gs.truthId)?.nickname||"";
    const target=state.players.find(p=>p.id===gs.targetId)?.nickname||"";
    html+=`<div class="result-banner">${gs.correct===true?"法官猜中了！":"法官猜錯了！"}</div><p class="notice">法官選擇：${esc(target)} · 真正直言者：${esc(truth)}</p><div class="player-list">${Object.entries(gs.scores||{}).map(([id,s])=>`<div class="player-pill">${esc(state.players.find(p=>p.id===id)?.nickname||"")}：${s} 分</div>`).join("")}</div>${state.role==="host"?`<button class="btn btn-yellow" style="margin-top:16px" onclick="restartGame()">NEXT ROUND</button>`:""}`;
  }
  $("#gamePanel").innerHTML=html;
  if(gs.endsAt)startDisplayTimer($("#gameTimer"),gs.endsAt);
  scrollChat("chat2");
}
window.sendChat2=()=>{const x=$("#chatInput2");if(!x)return;const text=x.value.trim();x.value="";if(state.role==="host")hostChat2(state.playerId,text);else emitGuestAction("chat2",{text});};
window.judge2=id=>{if(state.role==="host")hostJudge(state.playerId,id);else emitGuestAction("judge2",{targetId:id});};
window.restartGame=()=>{if(state.role!=="host")return;startHostGame();};

function startDisplayTimer(el,endsAt){
  clearInterval(state._displayTimer);
  if(!el||!endsAt)return;
  const tick=()=>{const left=Math.max(0,endsAt-Date.now());el.textContent=(left/1000).toFixed(1)+"s";};
  tick();state._displayTimer=setInterval(tick,100);
}
function scrollChat(id){const el=$("#"+id);if(el)el.scrollTop=el.scrollHeight;}
function cleanupAll(){
  clearTimeout(state.timerId);clearInterval(state._displayTimer);
  state.peers.forEach(x=>{try{x.dc.close();x.pc.close()}catch{}});
  try{state.localConnection?.close()}catch{}
  state.peers.clear();state.dataChannel=null;state.localConnection=null;state.gameState=null;state.chat=[];state.players=[];state.role=null;state.myRole=null;state.myExplanation=null;
}
