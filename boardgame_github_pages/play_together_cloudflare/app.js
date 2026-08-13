
const CONFIG=window.PLAY_TOGETHER_CONFIG||{};
const API=String(CONFIG.API_BASE_URL||"").replace(/\/+$/,"");
const WS_BASE=API.replace(/^http:/,"ws:").replace(/^https:/,"wss:");
const $=s=>document.querySelector(s);

const S={
  questions:null, socket:null, room:null, playerId:null, token:null,
  nickname:"", role:null, explanation:null, chat:[], timer:null,
  selectedGame:"game1", filters:[], mode:null
};

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function showError(t){const el=$("#lobbyError");el.textContent=t;el.classList.toggle("hidden",!t);el.classList.add("error");}
function saveSession(){if(S.room&&S.playerId&&S.token)localStorage.setItem("pt:"+S.room.code,JSON.stringify({playerId:S.playerId,token:S.token,nickname:S.nickname}));}
function loadSession(code){try{return JSON.parse(localStorage.getItem("pt:"+code)||"null")}catch{return null}}
function clearSession(){if(S.room) localStorage.removeItem("pt:"+S.room.code)}
function httpToWs(url){return url.replace(/^https:/,"wss:").replace(/^http:/,"ws:");}

async function loadQuestions(){
  const r=await fetch("./questions.json",{cache:"no-store"});
  if(!r.ok)throw new Error("questions.json 載入失敗");
  S.questions=await r.json();
  renderCats();
}
loadQuestions().catch(e=>showError(e.message));

function renderCats(){
  if(!S.questions)return;
  const cats=S.selectedGame==="game1"?S.questions.game1.categories:S.questions.game2.categories;
  S.filters=S.filters.filter(c=>cats.includes(c));
  if(!S.filters.length)S.filters=[...cats];
  $("#catBox").innerHTML=cats.map(c=>`<button class="chip ${S.filters.includes(c)?"active":""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  $("#catBox").querySelectorAll(".chip").forEach(b=>b.onclick=()=>{b.classList.toggle("active");S.filters=[...$("#catBox").querySelectorAll(".chip.active")].map(x=>x.dataset.cat);});
}
$("#gameSelect").onchange=()=>{S.selectedGame=$("#gameSelect").value;S.filters=[];renderCats();};
$("#toggleCats").onclick=()=>{const b=[...$("#catBox").querySelectorAll(".chip")];const all=b.every(x=>x.classList.contains("active"));b.forEach(x=>x.classList.toggle("active",!all));S.filters=all?[]:b.map(x=>x.dataset.cat);};

document.querySelectorAll("[data-scroll]").forEach(b=>b.onclick=()=>document.querySelector(b.dataset.scroll)?.scrollIntoView({behavior:"smooth"}));
document.querySelectorAll("[data-tab]").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".tab-panel").forEach(x=>x.classList.remove("active"));t.classList.add("active");$("#"+(t.dataset.tab==="create"?"createTab":"joinTab")).classList.add("active");});
document.querySelectorAll("[data-start]").forEach(b=>b.onclick=()=>{S.selectedGame=b.dataset.start;$("#gameSelect").value=S.selectedGame;S.filters=[];renderCats();document.querySelector('[data-tab="create"]').click();$("#room").scrollIntoView({behavior:"smooth"});});
$("#createBtn").onclick=createRoom;
$("#joinBtn").onclick=joinRoom;
$("#closeGame").onclick=leaveRoom;

async function createRoom(){
  try{
    if(!API||API.includes("YOUR-WORKER"))throw new Error("請先在 config.js 填入 Cloudflare Worker 網址。");
    S.nickname=$("#createName").value.trim()||"玩家";S.mode="create";
    const r=await fetch(API+"/api/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game:S.selectedGame,filters:{categories:S.filters}})});
    const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||"建立房間失敗。");
    openSocket(data.roomCode,"create");
  }catch(e){showError(e.message)}
}

async function joinRoom(){
  try{
    if(!API||API.includes("YOUR-WORKER"))throw new Error("請先在 config.js 填入 Cloudflare Worker 網址。");
    const code=$("#joinCode").value.trim().toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(code))throw new Error("房間號需要 6 位英數字。");
    S.nickname=$("#joinName").value.trim()||"玩家";S.mode="join";
    const saved=loadSession(code);
    openSocket(code,saved?"reconnect":"join",saved);
  }catch(e){showError(e.message)}
}

function openSocket(code,mode,saved=null){
  if(S.socket)S.socket.close();
  S.room={code};S.chat=[];S.role=null;S.explanation=null;
  const wsUrl=WS_BASE+"/ws/"+encodeURIComponent(code);
  const ws=new WebSocket(wsUrl);S.socket=ws;
  ws.onopen=()=>{setBadge("CONNECTED",true);ws.send(JSON.stringify({type:"hello",mode,nickname:S.nickname,playerId:saved?.playerId,token:saved?.token}));};
  ws.onclose=()=>setBadge("DISCONNECTED",false);
  ws.onerror=()=>setBadge("ERROR",false);
  ws.onmessage=e=>{let msg;try{msg=JSON.parse(e.data)}catch{return}handleMessage(msg);};
  showGame();
}

function handleMessage(msg){
  if(msg.type==="error")return flash(msg.message);
  if(msg.type==="welcome"){
    S.playerId=msg.playerId;S.token=msg.token;S.room=msg.room;saveSession();renderRoom();renderGame();return;
  }
  if(msg.type==="state"){
    S.room=msg.room;
    if(msg.room.viewerRole)S.role=msg.room.viewerRole;
    if(msg.room.viewerExplanation)S.explanation=msg.room.viewerExplanation;
    renderRoom();renderGame();
  }
  if(msg.type==="private-role"){S.role=msg.role;S.explanation=msg.explanation||null;renderRoom();renderGame();}
  if(msg.type==="chat"){S.chat.push(msg.chat);S.chat=S.chat.slice(-100);renderGame();}
}

function setBadge(t,on){$("#connBadge").textContent=t;$("#connBadge").classList.toggle("online",on)}
function flash(t){const old=$("#gamePanel").querySelector(".status");if(old){old.textContent=t;return}$("#gamePanel").insertAdjacentHTML("afterbegin",`<div class="status error">${esc(t)}</div>`);}
function send(msg){if(S.socket?.readyState===WebSocket.OPEN)S.socket.send(JSON.stringify(msg));}

function showGame(){$("#landing").classList.add("hidden");$("#gameShell").classList.remove("hidden");$("#roomLabel").textContent=S.room?.code||"------";}
function leaveRoom(){clearInterval(S.timer);if(S.socket)S.socket.close();clearSession();S.room=null;S.playerId=null;S.token=null;S.role=null;S.explanation=null;$("#gameShell").classList.add("hidden");$("#landing").classList.remove("hidden");window.scrollTo(0,0);}

function renderRoom(){
  const r=S.room;if(!r||!r.players)return;
  $("#roomPanel").innerHTML=`
    <div class="row" style="justify-content:space-between;align-items:end"><div><div class="eyebrow">ROOM</div><div class="lobby-code"><strong>${esc(r.code)}</strong></div></div>
    <div><div class="eyebrow">GAME</div><b>${r.game==="game1"?"心有靈犀一點通":"9upper瞎掰王"}</b></div></div>
    <div style="height:14px"></div><div class="players">${r.players.map(p=>`<div class="player ${p.host?"host":""}">${p.host?"👑 ":""}${esc(p.nickname)} <span style="opacity:.65">${p.connected?"●":"○"}</span>${p.score?` · ${p.score}分`:""}</div>`).join("")}</div>
    ${r.hostId===S.playerId&&(!r.gameState||r.gameState.phase==="waiting")?`<div style="margin-top:15px"><button id="startBtn" class="btn yellow">START GAME</button></div>`:""}
    <p class="notice">${r.players.filter(p=>p.connected).length}/6 人在線。遊戲需要至少 4 人。</p>`;
  $("#startBtn")?.addEventListener("click",()=>send({type:"start"}));
}

function renderGame(){
  const g=S.room?.gameState;
  if(!g){$("#gamePanel").innerHTML=`<div class="eyebrow">READY</div><h2 class="title">WAIT FOR<br><span>YOUR FRIENDS.</span></h2><p class="notice">房主加入 4–6 位玩家後開始遊戲。</p>`;return;}
  if(S.room.game==="game1")renderGame1(g);else renderGame2(g);
}

function timer(el,endsAt){
  clearInterval(S.timer);if(!el||!endsAt)return;
  const tick=()=>{const left=Math.max(0,endsAt-Date.now());el.textContent=(left/1000).toFixed(1)+"s";};tick();S.timer=setInterval(tick,100);
}

function renderGame1(g){
  if(g.phase==="vote"){
    const myVote=(S.room.players.find(p=>p.id===S.playerId)?.id && g.votes?.[S.playerId]!==undefined)?g.votes[S.playerId]:undefined;
    $("#gamePanel").innerHTML=`
      <div class="row" style="justify-content:space-between;align-items:end"><div><div class="eyebrow">ROUND ${g.round}</div><h2 class="title">心有靈犀<br><span>一點通</span></h2></div><div id="time" class="timer"></div></div>
      <div class="question">${esc(g.question.question)}</div>
      <div class="answers">${g.question.options.map((x,i)=>`<button class="answer ${myVote===i?"selected":""}" ${myVote!==undefined?"disabled":""} onclick="vote1(${i})">${String.fromCharCode(65+i)} · ${esc(x)}</button>`).join("")}</div>
      <p class="notice">10 秒投票。票數即時同步，但只有服務器在倒數結束時鎖定結果。</p>`;
    timer($("#time"),g.endsAt);
  }else{
    const c=g.votes||[0,0];
    $("#gamePanel").innerHTML=`
      <div class="row" style="justify-content:space-between;align-items:end"><div><div class="eyebrow">RESULT · ROUND ${g.round}</div><h2 class="title">WHAT DID<br><span>EVERYONE CHOOSE?</span></h2></div></div>
      <div class="question">${esc(g.question.question)}</div>
      <div class="bars">${g.question.options.map((x,i)=>`<div class="barrow"><b>${String.fromCharCode(65+i)}</b><div class="bar"><div class="fill ${g.winner===i?"win":""}" style="width:${Math.max(4,(c[i]||0)/(S.room.players.length||1)*100)}%"></div></div><b>${c[i]||0}</b></div>`).join("")}</div>
      <div class="${g.winner===null?"status":"result"}">${g.winner===null?"本題打平。":"多數選擇：A/B"[0] ? "多數選擇："+String.fromCharCode(65+g.winner)+" · "+esc(g.question.options[g.winner]) : ""}</div>
      <div style="height:16px"></div><div class="eyebrow">TALK IT OUT</div><div id="chatBox" class="chat">${S.chat.map(m=>`<div class="msg"><b>${esc(m.nickname)}</b>：${esc(m.text)}</div>`).join("")}</div>
      <div class="row" style="margin-top:10px"><input id="chat1" placeholder="說說你的想法…"><button class="btn blue" onclick="chat1()">SEND</button><button class="btn yellow" onclick="next1()">NEXT QUESTION</button></div>
      <p class="notice">已準備下一題：${g.nextReadyCount||0}/${S.room.players.filter(p=>p.connected).length}</p>`;
    scrollChat();
  }
}
window.vote1=i=>send({type:"g1:vote",option:i});
window.chat1=()=>{const el=$("#chat1");const t=el.value.trim();el.value="";if(t)send({type:"g1:chat",text:t})};
window.next1=()=>send({type:"g1:next"});

function roleBlock(){
  if(!S.role)return "";
  const label=S.role==="judge"?"法官（公開）":S.role==="truth"?"直言者":"騙子";
  return `<div class="role ${S.role}"><div class="eyebrow">YOUR ROLE</div><strong style="font:700 30px 'Fredoka'">${label}</strong>${S.explanation?`<p><b>正確解釋：</b>${esc(S.explanation)}</p>`:""}</div>`;
}
function renderGame2(g){
  let h=`<div class="row" style="justify-content:space-between;align-items:end"><div><div class="eyebrow">9UPPER BLUFF GAME</div><h2 class="title">瞎掰王<br><span>${esc(g.term||"")}</span></h2></div>${g.endsAt?`<div id="time" class="timer"></div>`:""}</div>${roleBlock()}`;
  if(g.phase==="prep")h+=`<div class="status">準備 30 秒。所有玩家暫時不能發言；只有直言者收到正確解釋。</div>`;
  if(g.phase==="speaking"){
    const active=S.room.players.find(p=>p.id===g.currentPlayerId);
    const mine=g.currentPlayerId===S.playerId;
    h+=`<div class="status">目前發言：<b>${esc(active?.nickname||"")}</b>${mine?" · 輪到你了。":""}</div>
      <div id="chatBox" class="chat">${S.chat.map(m=>`<div class="msg"><b>${esc(m.nickname)}</b>：${esc(m.text)}</div>`).join("")}</div>
      <div class="row" style="margin-top:10px"><input id="chat2" ${mine?"":"disabled"} placeholder="${mine?"輸入你的解釋…":"等待發言…"}"><button class="btn blue" ${mine?"":"disabled"} onclick="chat2()">SEND</button></div>`;
    scrollChat();
  }
  if(g.phase==="judge"){
    const isJudge=g.judgeId===S.playerId;
    h+=`<div class="eyebrow" style="margin-top:18px">JUDGE</div>${isJudge?`<div class="choice-grid">${(g.choices||[]).map(p=>`<button class="choice" onclick="judge2('${p.id}')">${esc(p.nickname)}</button>`).join("")}</div>`:`<div class="status">法官正在選擇他認為的直言者。</div>`}`;
  }
  if(g.phase==="result"){
    const scores=S.room.players.map(p=>`<div class="player">${esc(p.nickname)} · ${p.score||0} 分</div>`).join("");
    h+=`<div class="result">${g.correct?"✅ 法官猜中了！":"❌ 法官猜錯了！"}</div><p class="notice">真正直言者：<b>${esc(g.truthNickname)}</b><br>正確解釋：${esc(g.correctExplanation)}</p><div class="players">${scores}</div>${S.room.hostId===S.playerId?`<button class="btn yellow" style="margin-top:15px" onclick="next2()">NEXT ROUND</button>`:""}`;
  }
  $("#gamePanel").innerHTML=h;if(g.endsAt)timer($("#time"),g.endsAt);
}
window.chat2=()=>{const el=$("#chat2");const t=el.value.trim();el.value="";if(t)send({type:"g2:chat",text:t})};
window.judge2=id=>send({type:"g2:judge",targetId:id});
window.next2=()=>send({type:"g2:next"});
function scrollChat(){const c=$("#chatBox");if(c)c.scrollTop=c.scrollHeight;}
