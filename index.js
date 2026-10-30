import { DurableObject } from "cloudflare:workers";
import {
  GAME1_QUESTIONS,
  GAME2_QUESTIONS,
  GAME1_CATEGORIES,
  GAME2_CATEGORIES,
  GAME4_QUESTIONS,
  GAME5_OPENERS,
  GAME9_SPECTRA
} from "./question-bank/loader.js";
import { G6_S2T_PAIRS } from "./question-bank/g6-chars.js";

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const MIN_PLAYERS_GAME4 = 3;
const ROOM_TTL = 1000 * 60 * 60 * 6;
const MAX_MESSAGE = 12_000;
const MAX_CHAT_HISTORY = 100;
const MAX_CHAT_ARCHIVE = 1000; // 房主專用嘅全場聊天記錄上限（唔會跟住每題重置）

const G1_VOTE_MS = 10000;
const G2_PREP_MS = 30000;
const G2_PICK_MS = 10000;
const G2_SPEAK_MS = 30000;
const G2_JUDGE_MS = 120000;
const G1_VOTE_MS_OPTIONS = [10000, 15000, 20000];
const G1_ROUND_OPTIONS = [10, 20, 30]; // 0 = 無限（房主自己結算）
const G2_SPEAK_MS_OPTIONS = [20000, 30000, 45000];
const G2_ROUND_MIN = 1;
const G2_ROUND_MAX = 30;

const G3_WRITE_MS_DEFAULT = 60000;
const G3_SCORE_MS = 18000;
const G3_REVEAL_MS = 10000;
const G3_WRITE_OPTIONS = [60000, 90000, 120000];

const G4_VOTE_MS = 15000;
const G4_REVEAL_MS = 10000;
const G4_ROUND_OPTIONS = [20, 50, 100];

const G5_SENTENCE_WRITE_MS = 30000;
const G5_CHAR_WRITE_MS = 15000;
const G5_SENTENCE_MAX_LEN = 15;
const G5_CHAR_MAX_LEN = 5;
const G5_SENTENCE_ROUND_OPTIONS = [10, 15, 25];
const G5_CHAR_ROUND_OPTIONS = [20, 50, 100];

const G6_ANSWER_MS_OPTIONS = [10000, 20000, 30000];
const G6_ROUND_MIN = 3;
const G6_ROUND_MAX = 30;
const G6_VOTE_MS_MIN = 5000;
const G6_VOTE_MS_MAX = 30000;
const G6_VOTE_MS_DEFAULT = 10000;
const G6_SUCCESS_MS = 10000; // 成功 sync 之後停留 10 秒，畀大家 cap 圖
const G6_VOID_MS = 5000;
const G6_MAX_ATTEMPTS = 5;
const G6_MAX_UNITS = 105; // 中文字算 15 個單位，英文字元算 7 個：即係中文最多 7 字、英文最多 15 個字元（中英夾雜按比例計）
const G6_BASE_POINTS = 50;
const G6_SPEED_POINTS = 50;

const G7_TURN_MS_OPTIONS = [10000, 15000];
const G7_ROUND_MIN = 1;
const G7_ROUND_MAX = 20;
const G7_BOMB_MIN = 1;
const G7_BOMB_MAX = 100;
const G7_BOOM_MS = 4000;        // 爆炸畫面停留（入面有 3 秒倒數先出新炸彈）
const G7_ROUND_WIN_MS = 5000;   // 回合完結（剩返一個人）畫面停留
const G7_OFFLINE_TURN_MS = 1500; // 輪到斷咗線嘅人：等一陣就當超時
const G7_OFFLINE_STRIKES = 2;   // 斷線連續超時兩次就當淘汰
const G7_CARDS = ["skip", "reverse", "assign"];
const G7_HISTORY_MAX = 12;

const G9_HINT_MS = 45000;          // 出題人出提示：45 秒
const G9_BLANK_HINT_MS = 60000;    // 空白題（出題人自己出光譜＋提示）：60 秒
const G9_BLANK_EVERY = 5;          // 大約每 5 題有 1 題空白題，每局最少 1 題
const G9_GUESS_MS_OPTIONS = [20000, 30000, 45000, 60000];
const G9_GUESS_MS_DEFAULT = 30000;
const G9_ROUND_OPTIONS = [1, 2, 3, 5, 8]; // 1 round ＝ 每人做一次出題人
const G9_ROUND_DEFAULT = 2;
const G9_SWAPS = 2;                // 每題出題人可以換光譜兩次
const G9_HINT_MAX = 20;
const G9_SPEC_MAX_UNITS = 16;     // 自訂光譜每邊：中文最多 8 字（每字算 2），英文最多 16 個字母
const G9_REVEAL_MS = 9000;
const G9_SKIP_MS = 4000;           // 出題人超時：跳過呢題
const G9_OFFLINE_HINT_MS = 1500;   // 出題人斷線：好快就當佢超時

const G8_TURN_MS_OPTIONS = [15000, 20000, 30000];
const G8_ROUND_MIN = 1;
const G8_ROUND_MAX = 5;
const G8_PLACE_MS = 60000;
const G8_ROUNDOVER_MS = 6000;
const G8_OFFLINE_TURN_MS = 1500;
const G8_HOT_BRAWL = 8;   // 大亂鬥第 8 輪開始白熱化
const G8_HOT_TEAM = 20;   // 分隊第 20 輪開始白熱化
const G8_TEAM_CARDS = 2;
const G8_CARDS = ["radar", "cross", "torpedo"];
const G8_MODES = ["duel", "brawl", "team"];
const G8_SHIPS_BIG = [
  { len: 4, name: "戰艦" }, { len: 3, name: "巡洋艦" }, { len: 3, name: "潛艇" }, { len: 2, name: "驅逐艦" }
];
const G8_SHIPS_SMALL = [
  { len: 3, name: "巡洋艦" }, { len: 2, name: "驅逐艦" }, { len: 2, name: "巡邏艇" }
];

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
function validGame(v) { return v==="game1" || v==="game2" || v==="game3" || v==="game4" || v==="game5" || v==="game6" || v==="game7" || v==="game8" || v==="game9"; }
function clampRounds(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(50, Math.max(2, Math.round(n)));
}
function clampWriteMs(v) {
  const n = Number(v);
  return G3_WRITE_OPTIONS.includes(n) ? n : G3_WRITE_MS_DEFAULT;
}
function clampG4Rounds(v) {
  const n = Number(v);
  return G4_ROUND_OPTIONS.includes(n) ? n : G4_ROUND_OPTIONS[0];
}
function clampG1VoteMs(v) {
  const n = Number(v);
  return G1_VOTE_MS_OPTIONS.includes(n) ? n : G1_VOTE_MS;
}
function clampG1Rounds(v) {
  const n = Number(v);
  return G1_ROUND_OPTIONS.includes(n) ? n : 0;
}
function clampG2SpeakMs(v) {
  const n = Number(v);
  return G2_SPEAK_MS_OPTIONS.includes(n) ? n : G2_SPEAK_MS;
}
function clampG2Rounds(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(G2_ROUND_MAX, Math.max(G2_ROUND_MIN, n));
}
function clampG6AnswerMs(v) {
  const n = Number(v);
  return G6_ANSWER_MS_OPTIONS.includes(n) ? n : 20000;
}
function clampG6Rounds(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 10;
  return Math.min(G6_ROUND_MAX, Math.max(G6_ROUND_MIN, n));
}
function clampG6VoteMs(v) {
  const n = Math.round(Number(v) / 1000) * 1000;
  if (!Number.isFinite(n) || n <= 0) return G6_VOTE_MS_DEFAULT;
  return Math.min(G6_VOTE_MS_MAX, Math.max(G6_VOTE_MS_MIN, n));
}

function clampG7TurnMs(v) {
  const n = Number(v);
  return G7_TURN_MS_OPTIONS.includes(n) ? n : G7_TURN_MS_OPTIONS[0];
}
function clampG7Rounds(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(G7_ROUND_MAX, Math.max(G7_ROUND_MIN, n));
}
function clampG9GuessMs(v) {
  const n = Number(v);
  return G9_GUESS_MS_OPTIONS.includes(n) ? n : G9_GUESS_MS_DEFAULT;
}
function clampG9Rounds(v) {
  const n = Number(v);
  return G9_ROUND_OPTIONS.includes(n) ? n : G9_ROUND_DEFAULT;
}
// 心中有數計分：同目標差 ≤2 → 4 分，≤6 → 3 分，≤10 → 2 分，再遠冇分。
// 闊度單位：中日韓文字同全形符號算 2，其他算 1。
function g9Units(str) {
  let n = 0;
  for (const ch of str) n += ch.codePointAt(0) >= 0x2E80 ? 2 : 1;
  return n;
}
function g9Score(diff) {
  return diff <= 2 ? 4 : diff <= 6 ? 3 : diff <= 10 ? 2 : 0;
}
function clampG8TurnMs(v) {
  const n = Number(v);
  return G8_TURN_MS_OPTIONS.includes(n) ? n : 20000;
}
function clampG8Rounds(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 3;
  return Math.min(G8_ROUND_MAX, Math.max(G8_ROUND_MIN, n));
}
// 人數決定可以揀邊啲模式：2 人淨係 1v1，3 人淨係大亂鬥，4–6 人大亂鬥或分隊。
function g8AllowedModes(count) {
  if (count <= 2) return ["duel"];
  if (count === 3) return ["brawl"];
  return ["brawl", "team"];
}
function g7RandInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ===== Game 6 · Sync 唔 Sync：答案正規化 =====
const G6_S2T = (() => {
  const m = new Map();
  for (let i = 0; i + 1 < G6_S2T_PAIRS.length; i += 2) m.set(G6_S2T_PAIRS[i], G6_S2T_PAIRS[i + 1]);
  return m;
})();
function g6Units(text) {
  let units = 0;
  for (const ch of text) units += /[\u0000-\u024F]/.test(ch) ? 7 : 15;
  return units;
}
// 去空格、全形轉半形、大細楷、簡轉繁，之後完全相同就當同一個答案。
function g6Normalize(text) {
  const base = String(text || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  let out = "";
  for (const ch of base) out += G6_S2T.get(ch) || ch;
  return out;
}
function g6PairKey(a, b) {
  return a < b ? a + "|" + b : b + "|" + a;
}

function clampG5Rounds(mode, v) {
  const options = mode==="char" ? G5_CHAR_ROUND_OPTIONS : G5_SENTENCE_ROUND_OPTIONS;
  const n = Number(v);
  return options.includes(n) ? n : options[0];
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
              writeMs:
                body.writeSeconds ? body.writeSeconds*1000 : null,
              language:
                body.language === "zh" ? "zh" : "yue",
              g4Rounds:
                body.g4Rounds || null,
              g4Anonymous:
                body.g4Anonymous !== false,
              g5Mode:
                body.g5Mode === "char" ? "char" : "sentence",
              g5Rounds:
                body.g5Rounds || null,
              g1VoteMs:
                body.g1VoteSeconds ? body.g1VoteSeconds*1000 : null,
              g1Rounds:
                body.g1Rounds || 0,
              g2SpeakMs:
                body.g2SpeakSeconds ? body.g2SpeakSeconds*1000 : null,
              g2Rounds:
                body.g2Rounds || null,
              g6AnswerMs:
                body.g6AnswerSeconds ? body.g6AnswerSeconds*1000 : null,
              g6Rounds:
                body.g6Rounds || null,
              g6VoteMs:
                body.g6VoteSeconds ? body.g6VoteSeconds*1000 : null,
              g7TurnMs:
                body.g7TurnSeconds ? body.g7TurnSeconds*1000 : null,
              g7Rounds:
                body.g7Rounds || null,
              g8TurnMs:
                body.g8TurnSeconds ? body.g8TurnSeconds*1000 : null,
              g8Rounds:
                body.g8Rounds || null,
              g9GuessMs:
                body.g9GuessSeconds ? body.g9GuessSeconds*1000 : null,
              g9Rounds:
                body.g9Rounds || null,
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
    language: room.language==="zh" ? "zh" : "yue",
    g1Settings: room.game==="game1" ? { voteMs: room.g1VoteMs||G1_VOTE_MS, rounds: room.g1Rounds||0 } : null,
    g2Settings: room.game==="game2" ? { speakMs: room.g2SpeakMs||G2_SPEAK_MS, rounds: room.g2Rounds||5 } : null,
    g6Settings: room.game==="game6" ? {
      answerMs: room.g6AnswerMs||20000,
      rounds: room.g6Rounds||10,
      voteMs: room.g6VoteMs||G6_VOTE_MS_DEFAULT
    } : null,
    g8Settings: room.game==="game8" ? {
      turnMs: room.g8TurnMs||20000,
      rounds: room.g8Rounds||3,
      mode: room.g8Mode||null
    } : null,
    g9Settings: room.game==="game9" ? {
      guessMs: room.g9GuessMs||G9_GUESS_MS_DEFAULT,
      hintMs: G9_HINT_MS,
      rounds: room.g9Rounds||G9_ROUND_DEFAULT
    } : null,
    g7Settings: room.game==="game7" ? {
      turnMs: room.g7TurnMs||G7_TURN_MS_OPTIONS[0],
      rounds: room.g7Rounds||5
    } : null,
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
    const lang = room.language==="zh" ? "zh" : "yue";
    const q = g.question;
    const localizedQuestion = q ? {
      id:q.id,
      category:q.category,
      question:q.text?.[lang]?.question || q.question,
      options:q.text?.[lang]?.options || q.options
    } : null;

    return {
      phase:g.phase, round:g.round, endsAt:g.endsAt||null,
      totalRounds:g.totalRounds||0, voteMs:g.voteMs||G1_VOTE_MS,
      question:localizedQuestion,
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
    const order = room.g3RaterOrder || [];
    const nextRaterId =
      g.phase && g.phase!=="gameover" && order.length
        ? order[g.round % order.length]
        : null;

    const base3={
      phase:g.phase,
      round:g.round,
      totalRounds:g.totalRounds,
      raterId:g.raterId||null,
      raterNickname:room.players.find(p=>p.id===g.raterId)?.nickname || "",
      nextRaterId,
      endsAt:g.endsAt||null
    };

    if(g.phase==="writing") {
      const writers = room.players.filter(p=>p.id!==g.raterId);
      base3.submittedCount = (g.submittedIds||[]).length;
      base3.totalToSubmit = writers.length;
      base3.isRater = viewerId===g.raterId;
      if(viewerId && viewerId!==g.raterId){
        base3.myTarget = g.target ?? null;
        base3.mySubmitted = (g.submittedIds||[]).includes(viewerId);
      }
    }

    if(g.phase==="rating") {
      base3.ratingStage = g.ratingStage;
      base3.totalAnswers = (g.ratingOrder||[]).length;
      base3.isRater = viewerId===g.raterId;
      // 匿名答案（次序已經洗牌，冇附連玩家 id）全部人都見到；
      // 邊句對邊個要等 reveal 先揭曉。
      base3.answers = (g.ratingOrder||[]).map(id=>g.answers?.[id] || "");
      base3.currentRatingIndex = g.currentRatingIndex ?? 0;
      if(viewerId===g.raterId){
        base3.givenScores = (g.ratingOrder||[]).map(id=>g.scores?.[id] ?? null);
      }
      // WTF 投票淨係喺 preview 階段開放；非莊家先有得投，見返自己揀咗邊句。
      if(g.ratingStage==="preview" && viewerId && viewerId!==g.raterId){
        base3.myWtfVote = g.wtfVotes?.[viewerId] ?? null;
      }
    }

    if(g.phase==="reveal" || g.phase==="gameover") {
      base3.isRater = viewerId===g.raterId;
      base3.target = g.target;
      base3.wtfWinnerId = g.wtfWinnerId || null;
      base3.results = (g.results||[]).map(r=>({
        playerId:r.playerId,
        nickname:room.players.find(p=>p.id===r.playerId)?.nickname || "",
        target:r.target,
        score:r.score,
        diff:r.diff,
        roundPoints:r.roundPoints,
        text:r.text||"",
        reactions:g.reactions?.[r.playerId] || {up:0,down:0},
        myReaction:viewerId ? (g.reactionVoters?.[viewerId]?.[r.playerId] || null) : null
      }));
      base3.isFinalRound = g.round>=g.totalRounds;
    }

    if(g.phase==="gameover") {
      const finalRanking = [...room.players]
        .sort((a,b)=>(b.score||0)-(a.score||0))
        .map(p=>({playerId:p.id,nickname:p.nickname,score:p.score||0,wtfCount:p.wtfCount||0}));

      const maxWtf = Math.max(0, ...room.players.map(p=>p.wtfCount||0));
      const wtfLeaders = room.players.filter(p=>(p.wtfCount||0)===maxWtf && maxWtf>0);

      base3.finalRanking = finalRanking;
      base3.champion = finalRanking[0] || null;
      base3.wtfChampion = wtfLeaders.length===1
        ? {playerId:wtfLeaders[0].id,nickname:wtfLeaders[0].nickname,wtfCount:wtfLeaders[0].wtfCount||0}
        : null;
      base3.history = room.g3History || [];
    }

    return base3;
  }

  if(room.game==="game4") {
    const g4lang = room.language==="zh" ? "zh" : "yue";
    const base4={
      phase:g.phase,
      round:g.round,
      totalRounds:g.totalRounds,
      question:g.question?.text?.[g4lang]?.question || g.question?.question || "",
      endsAt:g.endsAt||null
    };

    if(g.phase==="voting") {
      const connected=room.players.filter(p=>p.connected);
      base4.votedCount=Object.keys(g.votes||{}).length;
      base4.totalToVote=connected.length;
      base4.myVote = viewerId ? (g.votes?.[viewerId] || null) : null;
    }

    if(g.phase==="reveal" || g.phase==="gameover") {
      const r=g.results||{};
      const anonymous = r.anonymous!==false;
      base4.results = {
        anonymous,
        everyoneCount:r.everyoneCount||0,
        abstainCount:r.abstainCount||0,
        winnerId:r.winnerId||null,
        winnerNickname:r.winnerId ? (room.players.find(p=>p.id===r.winnerId)?.nickname||"") : "",
        maxVotes:r.maxVotes||0,
        tally: Object.entries(r.tally||{}).map(([playerId,count])=>({
          playerId,
          nickname:room.players.find(p=>p.id===playerId)?.nickname||"",
          count,
          // 唔匿名先夾埋邊班人投俾佢。
          voters: anonymous ? null : Object.entries(g.votes||{})
            .filter(([,target])=>target===playerId)
            .map(([voterId])=>room.players.find(p=>p.id===voterId)?.nickname||"")
        })).sort((a,b)=>b.count-a.count),
        everyoneVoters: anonymous ? null : Object.entries(g.votes||{})
          .filter(([,target])=>target==="everyone")
          .map(([voterId])=>room.players.find(p=>p.id===voterId)?.nickname||"")
      };
    }

    if(g.phase==="gameover") {
      const ranking=[...room.players]
        .sort((a,b)=>(b.score||0)-(a.score||0))
        .map(p=>({playerId:p.id,nickname:p.nickname,score:p.score||0,signature:p.g4SignatureRound||null}));
      base4.finalRanking=ranking;
      base4.champion=ranking[0]||null;
      base4.history=room.g4History||[];
    }

    return base4;
  }

  if(room.game==="game5") {
    const currentPlayer = room.players.find(p=>p.id===g.currentTurnPlayerId);
    const base5={
      phase:g.phase,
      mode:g.mode,
      round:g.round,
      totalRounds:g.totalRounds,
      story:(g.story||[]).map(s=>({
        text:s.text,
        authorNickname:s.authorNickname
      })),
      currentTurnPlayerId:g.currentTurnPlayerId||null,
      currentTurnNickname:currentPlayer?.nickname || "",
      isMyTurn: viewerId ? viewerId===g.currentTurnPlayerId : false,
      maxLen: g.mode==="char" ? G5_CHAR_MAX_LEN : G5_SENTENCE_MAX_LEN,
      endsAt:g.endsAt||null
    };

    if(g.phase==="gameover") {
      base5.fullStory = (g.story||[]).map(s=>s.text).join("");
      base5.endedEarly = !!g.endedEarly;
    }

    return base5;
  }

  if(room.game==="game6") {
    const connected = room.players.filter(p=>p.connected);
    const nick = (id)=>room.players.find(p=>p.id===id)?.nickname || "玩家";
    const base6={
      phase:g.phase,
      round:g.round,
      totalRounds:g.totalRounds,
      answerMs:g.answerMs,
      voteMs:g.voteMs,
      endsAt:g.endsAt||null,
      attempt:g.attempt||1,
      maxAttempts:g.maxAttempts||G6_MAX_ATTEMPTS,
      history:g.history||[]
    };

    if(g.phase==="answering"){
      base6.submittedCount=Object.keys(g.answers||{}).length;
      base6.totalCount=connected.length;
      base6.mySubmitted=!!(viewerId && g.answers?.[viewerId]);
      base6.myAnswer=viewerId ? (g.answers?.[viewerId]?.text || null) : null;
    }

    if(g.phase==="merging"){
      const myGroup=(g.groups||[]).find(gr=>viewerId && gr.members.includes(viewerId));
      // 投票階段只公開答案同人數，邊個答咗咩留返去揭曉先講。
      base6.groups=(g.groups||[]).map(gr=>({
        id:gr.id,
        words:gr.words,
        count:gr.members.length
      }));
      base6.myGroupId=myGroup ? myGroup.id : null;
      base6.autoPair=!!g.autoPair;
      base6.proposals=(g.proposals||[]).map(pr=>{
        const yes=Object.values(pr.votes).filter(v=>v===true).length;
        const no=Object.values(pr.votes).filter(v=>v===false).length;
        return {
          id:pr.id,
          kind:pr.kind||"pair",
          a:pr.a,
          b:pr.b,
          wordsA:pr.wordsA,
          wordsB:pr.wordsB,
          byNickname:nick(pr.by),
          status:pr.status,
          yes,
          no,
          eligibleCount:pr.eligible.length,
          myEligible:!!(viewerId && pr.eligible.includes(viewerId)),
          myVote:viewerId && Object.prototype.hasOwnProperty.call(pr.votes,viewerId) ? pr.votes[viewerId] : null
        };
      });
      base6.skipCount=Object.keys(g.skip||{}).length;
      base6.totalCount=connected.length;
      base6.mySkip=!!(viewerId && g.skip?.[viewerId]);
    }

    if(g.phase==="reveal" && g.result){
      base6.result=g.result;
      base6.nextCount=Object.keys(g.next||{}).length;
      base6.totalCount=connected.length;
      base6.myNext=!!(viewerId && g.next?.[viewerId]);
    }

    if(g.phase==="gameover"){
      base6.endedEarly=!!g.endedEarly;
      base6.playedRounds=g.playedRounds||0;
      base6.sync=room.g6Sync||{};
      base6.ranking=[...room.players]
        .sort((a,b)=>(b.score||0)-(a.score||0))
        .map(p=>({id:p.id,nickname:p.nickname,score:p.score||0}));
      const pairs=[];
      for(let i=0;i<room.players.length;i++){
        for(let j=i+1;j<room.players.length;j++){
          const a=room.players[i], b=room.players[j];
          const k=g6PairKey(a.id,b.id);
          const count=(room.g6Sync||{})[k]||0;
          const st=(room.g6PairStats||{})[k]||{rounds:0,first:0,speed:0,scored:0,attempts:0};
          pairs.push({
            a:a.id,b:b.id,aNickname:a.nickname,bNickname:b.nickname,count,
            first:st.first,scored:st.scored,
            speedAvg:st.rounds ? st.speed/st.rounds : 0,
            attemptsAvg:st.rounds ? st.attempts/st.rounds : 0
          });
        }
      }
      base6.pairs=pairs.sort((x,y)=>y.count-x.count);
      const events=room.g6Events||[];
      base6.fastest=events.length ? events.reduce((m,e)=>e.t<m.t ? e : m) : null;
      base6.maxAttempts=G6_MAX_ATTEMPTS;
      base6.log=room.g6Log||[];
    }

    return base6;
  }

  if(room.game==="game8") {
    const myKey = viewerId ? (g.mode==="team"
      ? ((g.teams?.navy||[]).includes(viewerId) ? "navy" : (g.teams?.pirate||[]).includes(viewerId) ? "pirate" : null)
      : (g.boards?.[viewerId] ? viewerId : null)) : null;
    const reveal = g.phase==="roundover" || g.phase==="gameover";
    const iAmOut = g.mode==="brawl" && myKey && g.boards?.[myKey]?.dead;
    const boards = Object.values(g.boards||{}).map(b=>{
      const mine = myKey===b.id;
      const showAll = mine || reveal || iAmOut || !myKey;
      return {
        id:b.id,
        owners:b.owners,
        dead:!!b.dead,
        shipsLeft:b.ships.filter(s=>!s.sunk).length,
        shipsTotal:b.ships.length,
        shots:Object.entries(b.shots||{}).map(([k,v])=>{ const [r,c]=k.split(",").map(Number); return [r,c,v.res,v.air?1:0]; }),
        ships:b.ships
          .filter(s=>s.cells && (showAll || s.sunk))
          .map(s=>({id:s.id,len:s.len,name:s.name,owner:s.owner,cells:s.cells,sunk:!!s.sunk})),
        myShips: (g.phase==="placing" && mine) ? b.ships.map(s=>({id:s.id,len:s.len,name:s.name,owner:s.owner,placed:!!s.cells})) : null
      };
    });
    const base8={
      phase:g.phase,
      mode:g.mode,
      round:g.round,
      totalRounds:g.totalRounds,
      turnMs:g.turnMs,
      size:g.size,
      hotAt:g.hotAt||0,
      hot:!!(g.hotAt && g.cycle>=g.hotAt),
      cycle:g.cycle||1,
      teams:g.teams||null,
      myKey,
      boards,
      order:g.order||[],
      cur:g.cur||null,
      shooter:g.shooter||null,
      turnSeq:g.turnSeq||0,
      endsAt:g.endsAt||null,
      readyCount:Object.keys(g.ready||{}).length,
      readyTotal:room.players.filter(p=>p.connected).length,
      myReady:!!(viewerId && g.ready?.[viewerId]),
      cards:myKey ? (g.cards?.[myKey]||[]) : [],
      pings:myKey && g.pings?.[myKey] ? Object.entries(g.pings[myKey]).map(([id,cell])=>{ const [r,c]=cell.split(",").map(Number); return {id,r,c}; }) : [],
      radar:(g.radar||[]).filter(x=>x.key===myKey),
      last:g.last||null,
      airLog:g.airCycle===g.cycle ? (g.airLog||null) : null,
      roundWinners:g.roundWinners||[],
      winners:room.g8Winners||[],
      teamWins:room.g8TeamWins||null,
      endedEarly:!!g.endedEarly
    };
    if(g.phase==="gameover"){
      base8.ranking=[...room.players]
        .filter(p=>(room.g8Roster||[]).includes(p.id))
        .sort((a,b)=>(b.score||0)-(a.score||0))
        .map(p=>({id:p.id,nickname:p.nickname,score:p.score||0}));
      base8.stats=room.g8Stats||{};
    }
    return base8;
  }

  if(room.game==="game9") {
    const lang=room.language==="zh" ? "zh" : "yue";
    const sp=g.spectrum;
    const isPsychic=!!viewerId && viewerId===g.psychicId;
    const open=g.phase==="reveal" || g.phase==="gameover";
    const base9={
      phase:g.phase,
      round:g.round,
      totalRounds:g.totalRounds,
      turnIndex:g.turnIndex,
      turnCount:(g.order||[]).length,
      turnNo:g.turnNo||0,
      order:g.order||[],
      psychicId:g.psychicId||null,
      spectrum:sp ? { id:sp.id, custom:!!sp.custom, left:sp.text?.[lang]?.left||"", right:sp.text?.[lang]?.right||"" } : null,
      hint:g.hint||"",
      swapsLeft:isPsychic ? (g.swapsLeft||0) : null,
      endsAt:g.endsAt||null,
      guessMs:g.guessMs,
      hintMs:g.hintMs||G9_HINT_MS,
      blank:!!g.blank,
      guesserIds:g.guesserIds||[],
      lockedIds:Object.keys(g.guesses||{}),
      myGuess:viewerId && g.guesses && viewerId in g.guesses ? g.guesses[viewerId] : null,
      // 目標只有出題人睇到；揭曉之後先公開。
      target:(isPsychic || open) ? (g.target ?? null) : null,
      skipped:!!g.skipped,
      result:g.phase==="reveal" ? (g.result||null) : null,
      next:g.phase==="reveal" ? (g.next||null) : null,
      endedEarly:!!g.endedEarly
    };
    if(g.phase==="gameover"){
      const stats=room.g9Stats||{};
      base9.ranking=[...room.players]
        .sort((a,b)=>(b.score||0)-(a.score||0))
        .map(p=>({id:p.id,nickname:p.nickname,score:p.score||0,bulls:stats[p.id]?.bulls||0}));
    }
    return base9;
  }

  if(room.game==="game7") {
    const alive=g.alive||[];
    const viewerAlive=!!(viewerId && alive.includes(viewerId));
    // 炸彈數字只會畀已經出局（或者唔喺呢局）嘅人睇；完場先全部公開。
    const showBomb=g.phase==="gameover" || (!!viewerId && !viewerAlive);
    const base7={
      phase:g.phase,
      round:g.round,
      totalRounds:g.totalRounds,
      turnMs:g.turnMs,
      bombIndex:g.bombIndex||0,
      low:g.low,
      high:g.high,
      order:g.order||[],
      alive,
      direction:g.direction||1,
      currentId:g.currentId||null,
      turnSeq:g.turnSeq||0,
      endsAt:g.endsAt||null,
      via:g.via||null,
      history:(g.history||[]).slice(-G7_HISTORY_MAX),
      myCard:viewerId ? (g.cards?.[viewerId]||null) : null,
      bomb:showBomb ? (g.bomb ?? null) : null,
      lastBoom:g.phase==="boom" ? (g.lastBoom||null) : null,
      roundWinnerId:g.roundWinnerId||null,
      nextStartId:g.nextStartId||null,
      winners:room.g7Winners||[],
      endedEarly:!!g.endedEarly
    };
    if(g.phase==="gameover"){
      base7.ranking=[...room.players]
        .sort((a,b)=>(b.score||0)-(a.score||0))
        .map(p=>({id:p.id,nickname:p.nickname,score:p.score||0}));
    }
    return base7;
  }

  const base={
    phase:g.phase, round:g.round, totalRounds:g.totalRounds||room.g2Rounds||5, term:g.term || null,
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
        writeMs:clampWriteMs(body.writeMs),
        language:body.language==="zh"?"zh":"yue",
        g4Rounds:clampG4Rounds(body.g4Rounds),
        g4Anonymous:body.g4Anonymous!==false,
        g5Mode:body.g5Mode==="char"?"char":"sentence",
        g5Rounds:clampG5Rounds(body.g5Mode,body.g5Rounds),
        g1VoteMs:clampG1VoteMs(body.g1VoteMs),
        g1Rounds:clampG1Rounds(body.g1Rounds),
        g2SpeakMs:clampG2SpeakMs(body.g2SpeakMs),
        g2Rounds:clampG2Rounds(body.g2Rounds),
        g6AnswerMs:clampG6AnswerMs(body.g6AnswerMs),
        g6Rounds:clampG6Rounds(body.g6Rounds),
        g6VoteMs:clampG6VoteMs(body.g6VoteMs),
        g7TurnMs:clampG7TurnMs(body.g7TurnMs),
        g7Rounds:clampG7Rounds(body.g7Rounds),
        g8TurnMs:clampG8TurnMs(body.g8TurnMs),
        g8Rounds:clampG8Rounds(body.g8Rounds),
        g8Mode:null,
        g9GuessMs:clampG9GuessMs(body.g9GuessMs),
        g9Rounds:clampG9Rounds(body.g9Rounds),
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
    if(game==="game3" || game==="game4" || game==="game5" || game==="game6" || game==="game7" || game==="game8" || game==="game9") return [];
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
      case "g2:restart": return this.onG2Restart(session.playerId);
      case "g3:submit": return this.onG3Submit(session.playerId,msg.text);
      case "g3:rating-start": return this.onG3RatingStart(session.playerId);
      case "g3:score": return this.onG3Score(session.playerId,msg.index,msg.score);
      case "g3:wtf": return this.onG3Wtf(session.playerId,msg.index);
      case "g3:react": return this.onG3React(session.playerId,msg.playerId,msg.reaction);
      case "g3:end": return this.onG3End(session.playerId);
      case "g4:vote": return this.onG4Vote(session.playerId,msg.target);
      case "g4:end": return this.onG4End(session.playerId);
      case "g5:submit": return this.onG5Submit(session.playerId,msg.text);
      case "g5:end": return this.onG5End(session.playerId);
      case "g6:submit": return this.onG6Submit(session.playerId,msg.text);
      case "g6:propose": return this.onG6Propose(session.playerId,msg.a,msg.b);
      case "g6:vote": return this.onG6Vote(session.playerId,msg.proposalId,msg.agree);
      case "g6:skip": return this.onG6Skip(session.playerId);
      case "g6:propose-all": return this.onG6ProposeAll(session.playerId);
      case "g6:next": return this.onG6Next(session.playerId);
      case "g6:end": return this.onG6End(session.playerId);
      case "g6:restart": return this.onG6Restart(session.playerId);
      case "g8:mode": return this.onG8Mode(session.playerId,msg.mode);
      case "g8:place": return this.onG8Place(session.playerId,msg.shipId,msg.r,msg.c,msg.horiz);
      case "g8:random": return this.onG8Random(session.playerId);
      case "g8:ready": return this.onG8Ready(session.playerId,msg.ready);
      case "g8:ping": return this.onG8Ping(session.playerId,msg.r,msg.c);
      case "g8:fire": return this.onG8Fire(session.playerId,msg.target,msg.r,msg.c,msg.card);
      case "g8:end": return this.onG8End(session.playerId);
      case "g8:restart": return this.onG8Restart(session.playerId);
      case "g7:guess": return this.onG7Guess(session.playerId,msg.value);
      case "g7:card": return this.onG7Card(session.playerId,msg.targetId);
      case "g7:end": return this.onG7End(session.playerId);
      case "g7:restart": return this.onG7Restart(session.playerId);
      case "g9:swap": return this.onG9Swap(session.playerId);
      case "g9:hint": return this.onG9Hint(session.playerId,msg.text,msg.left,msg.right);
      case "g9:guess": return this.onG9Guess(session.playerId,msg.value);
      case "g9:end": return this.onG9End(session.playerId);
      case "g9:restart": return this.onG9Restart(session.playerId);
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
      if(await this.g6AfterDisconnect()) return;
      if(await this.g7AfterDisconnect()) return;
      if(await this.g8AfterDisconnect()) return;
      if(await this.g9AfterDisconnect()) return;
    }

    await this.save();
    await this.broadcastRoom();
  }

  // Sync 唔 Sync：有人斷線之後，如果剩低嘅人已經全部作答，就唔使等到時間完。
  async g6AfterDisconnect(){
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="answering") return false;
    const connected=this.room.players.filter(p=>p.connected);
    if(!connected.length || !connected.every(p=>g.answers[p.id])) return false;
    await this.startMergingGame6();
    return true;
  }

  async onStart(playerId){
    if(playerId!==this.room.hostId) return this.errorPlayer(playerId,"只有房主可以開始。");
    const connected=this.room.players.filter(p=>p.connected);
    const minRequired = this.room.game==="game4" ? MIN_PLAYERS_GAME4 : MIN_PLAYERS;
    if(connected.length<minRequired || connected.length>MAX_PLAYERS){
      return this.errorPlayer(playerId,`需要${minRequired}-6位已連線玩家。`);
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
    else if(this.room.game==="game4") await this.startGame4();
    else if(this.room.game==="game5") await this.startGame5();
    else if(this.room.game==="game6") await this.startGame6();
    else if(this.room.game==="game7") await this.startGame7();
    else if(this.room.game==="game8") await this.startGame8();
    else if(this.room.game==="game9") await this.startGame9();
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
      question:q,usedIds:[...new Set([...prevUsed,q.id])],votes:{},nextReady:{},winner:null,totalRounds:this.room.g1Rounds||0,voteMs:this.room.g1VoteMs||G1_VOTE_MS,endsAt:Date.now()+(this.room.g1VoteMs||G1_VOTE_MS)
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
    if (await this.g1FinishIfLastRound()) return;
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
    if (await this.g1FinishIfLastRound()) return;
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

    const lang=this.room.language==="zh"?"zh":"yue";
    this.room.g1History=this.room.g1History||[];
    this.room.g1History.push({
      category:g.question?.category||"未分類",
      question:g.question?.text?.[lang]?.question || g.question?.question || "",
      options:g.question?.text?.[lang]?.options || g.question?.options || [],
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

  // 有設回合數嘅話，打完最後一題就直接去結算（結算畫面房主仍然可以揀繼續玩）。
  async g1FinishIfLastRound(){
    const g=this.room.gameState;
    const total=this.room.g1Rounds||0;
    if(!g || g.phase!=="chat" || !total || (g.round||0)<total) return false;
    g.phase="final";
    g.endsAt=null;
    g.results=this.computeG1Results();
    await this.save();
    await this.broadcastRoom();
    return true;
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
      totalRounds: this.room.g2Rounds || 5,
      term: q.text?.[this.room.language==="zh" ? "zh" : "yue"]?.term || q.term,
      category: q.category,
      privateExplanation:
        q.text?.[this.room.language==="zh" ? "zh" : "yue"]?.explanation || q.explanation || null,
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
    g.endsAt=Date.now()+(this.room.g2SpeakMs||G2_SPEAK_MS);

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
    if((g.round||0)>=(this.room.g2Rounds||5)){
      g.phase="gameover";
      g.endsAt=null;
      await this.save();
      await this.broadcastRoom();
      return;
    }
    await this.startGame2();
  }

  // 9upper 打完全部回合之後，房主可以清零再玩一局。
  async onG2Restart(playerId){
    const g=this.room.gameState;
    if(!g||g.game!=="game2"||g.phase!=="gameover"||playerId!==this.room.hostId)return;
    for(const p of this.room.players) p.score=0;
    this.room.gameState=null;
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
    this.room.g3History = [];

    for(const p of this.room.players){
      p.score=0;
      p.wtfCount=0;
    }

    await this.beginRoundGame3(1);
  }

  async beginRoundGame3(round){
    const order = this.room.g3RaterOrder || [];
    const raterId = order[(round-1) % order.length];
    const writeMs = this.room.writeMs || G3_WRITE_MS_DEFAULT;

    this.room.gameState = {
      game:"game3",
      phase:"writing",
      round,
      totalRounds:this.room.g3TotalRounds,
      raterId,
      target: 1 + Math.floor(Math.random()*10),
      answers:{},
      submittedIds:[],
      ratingOrder:[],
      ratingStage:null,
      currentRatingIndex:0,
      scores:{},
      wtfVotes:{},
      wtfWinnerId:null,
      reactions:{},
      results:null,
      endsAt:Date.now()+writeMs
    };

    await this.save();
    await this.ctx.storage.setAlarm(this.room.gameState.endsAt);
    await this.broadcastRoom();
  }

  writersGame3(){
    const g=this.room.gameState;
    if(!g) return [];
    return this.room.players.filter(p=>p.id!==g.raterId);
  }

  async onG3Submit(playerId,text){
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase!=="writing") return;
    if(playerId===g.raterId) return;
    if(!this.room.players.some(p=>p.id===playerId)) return;

    const clean = String(text||"").trim().slice(0,25);
    if(!clean) return;

    g.answers[playerId]=clean;
    if(!g.submittedIds.includes(playerId)){
      g.submittedIds.push(playerId);
    }

    const writers = this.writersGame3().filter(p=>p.connected);
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

    for(const p of this.writersGame3()){
      if(!g.answers[p.id]){
        g.answers[p.id]="（未作答）";
      }
      if(!g.submittedIds.includes(p.id)){
        g.submittedIds.push(p.id);
      }
    }

    await this.startRatingGame3();
  }

  async startRatingGame3(){
    const g=this.room.gameState;
    if(!g || g.game!=="game3") return;

    g.phase="rating";
    g.ratingStage="preview";
    g.ratingOrder=shuffle(this.writersGame3().map(p=>p.id));
    g.currentRatingIndex=0;
    g.endsAt=null;

    await this.save();
    await this.broadcastRoom();
  }

  // Rating-preview 階段冇時限，淨係莊家撳「開始評分」先會觸發呢個。
  // 順便結算 WTF 投票：邊句最多人投，攞最多票嗰句嘅作者記一分 wtfCount；打和就冇人攞。
  async onG3RatingStart(playerId){
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase!=="rating") return;
    if(g.ratingStage!=="preview" || playerId!==g.raterId) return;

    const tally={};
    for(const idx of Object.values(g.wtfVotes||{})){
      tally[idx]=(tally[idx]||0)+1;
    }
    const entries=Object.entries(tally);
    if(entries.length){
      const maxVotes=Math.max(...entries.map(([,c])=>c));
      const winners=entries.filter(([,c])=>c===maxVotes).map(([idx])=>Number(idx));
      if(winners.length===1 && maxVotes>0){
        const winnerId=g.ratingOrder[winners[0]];
        const p=this.room.players.find(x=>x.id===winnerId);
        if(p) p.wtfCount=(p.wtfCount||0)+1;
        g.wtfWinnerId=winnerId;
      }
    }

    g.ratingStage="scoring";
    g.currentRatingIndex=0;
    g.endsAt=Date.now()+G3_SCORE_MS;

    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  // Rating-preview 階段，非莊家玩家投「最WTF」嗰句（可以改票，淨係計最後一次）。
  async onG3Wtf(playerId,index){
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase!=="rating" || g.ratingStage!=="preview") return;
    if(playerId===g.raterId) return;
    if(!Number.isInteger(index) || index<0 || index>=(g.ratingOrder||[]).length) return;

    g.wtfVotes=g.wtfVotes||{};
    g.wtfVotes[playerId]=index;

    await this.save();
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

    const results = this.writersGame3().map(p=>{
      const playerId=p.id;
      const score=g.scores[playerId] ?? Math.ceil(Math.random()*10);
      const diff=Math.abs(g.target-score);
      const roundPoints=10-diff;

      p.score=(p.score||0)+roundPoints;

      return {playerId,target:g.target,score,diff,roundPoints,text:g.answers[playerId]||""};
    }).sort((a,b)=>a.diff-b.diff);

    g.phase="reveal";
    g.results=results;
    g.endsAt=Date.now()+G3_REVEAL_MS;

    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  // Reveal 完（自動 10 秒後，或者房主提前結算），將呢一round嘅結果存落
  // room.g3History，等結算畫面可以逐round回顧。跟住輪唔輪到下一round/gameover。
  async advanceAfterRevealGame3(){
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase!=="reveal") return;

    const wtfWinnerNickname = g.wtfWinnerId
      ? this.room.players.find(p=>p.id===g.wtfWinnerId)?.nickname || ""
      : "";

    this.room.g3History = this.room.g3History || [];
    this.room.g3History.push({
      round:g.round,
      raterId:g.raterId,
      raterNickname:this.room.players.find(p=>p.id===g.raterId)?.nickname || "",
      target:g.target,
      results:(g.results||[]).map(r=>({
        ...r,
        nickname:this.room.players.find(p=>p.id===r.playerId)?.nickname || "",
        reactions:g.reactions?.[r.playerId] || {up:0,down:0}
      })),
      wtfWinnerId:g.wtfWinnerId||null,
      wtfWinnerNickname
    });

    if(g.round >= g.totalRounds){
      g.phase="gameover";
      g.endsAt=null;
      await this.save();
      await this.broadcastRoom();
      return;
    }

    await this.beginRoundGame3(g.round+1);
  }

  // 房主可以隨時提前結算，用返而家累積落嘅 player.score 做最終排名。
  // 如果係響某一round中途提前結算（未到 reveal），嗰round就唔計，直接用返上一round為止嘅分數。
  async onG3End(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase==="gameover") return;

    g.phase="gameover";
    g.endsAt=null;
    await this.save();
    await this.broadcastRoom();
  }

  // Reveal 階段，任何人都可以對某位玩家嗰句俾 👍/👎，純粹表態，唔影響計分。
  // 可以改（up↔down），淨係唔可以同時揸兩邊。
  async onG3React(playerId,targetPlayerId,reaction){
    const g=this.room.gameState;
    if(!g || g.game!=="game3" || g.phase!=="reveal") return;
    if(reaction!=="up" && reaction!=="down") return;
    if(!(g.results||[]).some(r=>r.playerId===targetPlayerId)) return;

    g.reactionVoters=g.reactionVoters||{};
    g.reactions=g.reactions||{};
    g.reactions[targetPlayerId]=g.reactions[targetPlayerId]||{up:0,down:0};

    const prev=g.reactionVoters[playerId]?.[targetPlayerId];
    if(prev===reaction) return; // 冇變

    if(prev) g.reactions[targetPlayerId][prev]=Math.max(0,g.reactions[targetPlayerId][prev]-1);
    g.reactions[targetPlayerId][reaction]+=1;

    g.reactionVoters[playerId]=g.reactionVoters[playerId]||{};
    g.reactionVoters[playerId][targetPlayerId]=reaction;

    await this.save();
    await this.broadcastRoom();
  }

  /* =========================
     Game 4 · 誰最有可能
  ========================= */

  async startGame4(){
    const players = shuffle(
      this.room.players.filter(p=>p.connected)
    );

    this.room.g4Order = players.map(p=>p.id);
    this.room.g4History = [];

    for(const p of this.room.players){
      p.score=0;
      p.g4SignatureRound=null; // 呢個玩家攞最高票嗰round嘅資料
    }

    await this.beginRoundGame4(1);
  }

  async beginRoundGame4(round){
    const pool = GAME4_QUESTIONS;
    const usedIds = this.room.g4UsedIds || [];
    let available = pool.filter(q=>!usedIds.includes(q.id));
    if(available.length===0){
      available = pool;
      this.room.g4UsedIds = [];
    }
    const q = available[Math.floor(Math.random()*available.length)];
    this.room.g4UsedIds = [...(this.room.g4UsedIds||[]), q.id];

    this.room.gameState = {
      game:"game4",
      phase:"voting",
      round,
      totalRounds:this.room.g4Rounds,
      question:{id:q.id,question:q.question,text:q.text},
      votes:{}, // voterId -> targetId | "everyone" | "abstain"
      results:null,
      endsAt:Date.now()+G4_VOTE_MS
    };

    await this.save();
    await this.ctx.storage.setAlarm(this.room.gameState.endsAt);
    await this.broadcastRoom();
  }

  async onG4Vote(playerId,target){
    const g=this.room.gameState;
    if(!g || g.game!=="game4" || g.phase!=="voting") return;
    if(!this.room.players.some(p=>p.id===playerId && p.connected)) return;
    if(g.votes[playerId]) return; // 已經投過票，唔可以再改。

    const validTarget =
      target==="everyone" || target==="abstain" ||
      this.room.players.some(p=>p.id===target);
    if(!validTarget) return;

    g.votes[playerId]=target;

    const connected = this.room.players.filter(p=>p.connected);
    const allVoted = connected.length>0 && connected.every(p=>g.votes[p.id]);

    if(allVoted){
      await this.startRevealGame4();
      return;
    }

    await this.save();
    await this.broadcastRoom();
  }

  async forceCloseVotingGame4(){
    const g=this.room.gameState;
    if(!g || g.game!=="game4" || g.phase!=="voting") return;
    // 未投嘅人自動當棄權。
    for(const p of this.room.players){
      if(p.connected && !g.votes[p.id]) g.votes[p.id]="abstain";
    }
    await this.startRevealGame4();
  }

  async startRevealGame4(){
    const g=this.room.gameState;
    if(!g || g.game!=="game4") return;

    const tally={}; // playerId -> count
    let everyoneCount=0, abstainCount=0;
    for(const target of Object.values(g.votes)){
      if(target==="everyone") everyoneCount++;
      else if(target==="abstain") abstainCount++;
      else tally[target]=(tally[target]||0)+1;
    }

    const entries=Object.entries(tally);
    const maxVotes = entries.length ? Math.max(...entries.map(([,c])=>c)) : 0;
    const winners = entries.filter(([,c])=>c===maxVotes).map(([id])=>id);
    const winnerId = (winners.length===1 && maxVotes>0) ? winners[0] : null;

    if(winnerId){
      const p=this.room.players.find(x=>x.id===winnerId);
      if(p){
        p.score=(p.score||0)+1;
        // 記低呢位玩家自己「代表作」— 攞過最高單輪票數嗰題。
        if(!p.g4SignatureRound || maxVotes>p.g4SignatureRound.votes){
          p.g4SignatureRound={
            question:g.question.question,
            votes:maxVotes,
            round:g.round
          };
        }
      }
    }

    g.phase="reveal";
    g.results={
      tally,
      everyoneCount,
      abstainCount,
      winnerId,
      maxVotes,
      anonymous:this.room.g4Anonymous!==false
    };
    g.endsAt=Date.now()+G4_REVEAL_MS;

    this.room.g4History=this.room.g4History||[];
    this.room.g4History.push({
      round:g.round,
      question:g.question.question,
      winnerId,
      winnerNickname:winnerId ? (this.room.players.find(p=>p.id===winnerId)?.nickname||"") : "",
      maxVotes,
      everyoneCount,
      abstainCount
    });

    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  async advanceAfterRevealGame4(){
    const g=this.room.gameState;
    if(!g || g.game!=="game4" || g.phase!=="reveal") return;

    if(g.round >= g.totalRounds){
      g.phase="gameover";
      g.endsAt=null;
      await this.save();
      await this.broadcastRoom();
      return;
    }

    await this.beginRoundGame4(g.round+1);
  }

  // 房主可以隨時提前結算。
  async onG4End(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game4" || g.phase==="gameover") return;
    g.phase="gameover";
    g.endsAt=null;
    await this.save();
    await this.broadcastRoom();
  }

  /* =========================
     Game 5 · 故事接龍
  ========================= */

  async startGame5(){
    const players = shuffle(
      this.room.players.filter(p=>p.connected)
    );
    const order = players.map(p=>p.id);
    const mode = this.room.g5Mode==="char" ? "char" : "sentence";
    const lang = this.room.language==="zh" ? "zh" : "yue";

    const opener = GAME5_OPENERS[Math.floor(Math.random()*GAME5_OPENERS.length)];
    const openerText = opener.text?.[lang]?.question || "";

    this.room.gameState = {
      game:"game5",
      mode,
      phase:"writing",
      round:1,
      totalRounds:this.room.g5Rounds,
      story:[{text:openerText, authorId:null, authorNickname:"系統"}],
      turnOrder:order,
      currentTurnPlayerId:order[0],
      endedEarly:false,
      endsAt:Date.now()+(mode==="char" ? G5_CHAR_WRITE_MS : G5_SENTENCE_WRITE_MS)
    };

    await this.save();
    await this.ctx.storage.setAlarm(this.room.gameState.endsAt);
    await this.broadcastRoom();
  }

  async onG5Submit(playerId,text){
    const g=this.room.gameState;
    if(!g || g.game!=="game5" || g.phase!=="writing") return;
    if(playerId!==g.currentTurnPlayerId) return;

    const maxLen = g.mode==="char" ? G5_CHAR_MAX_LEN : G5_SENTENCE_MAX_LEN;
    const clean = String(text||"").trim().slice(0,maxLen);
    if(!clean) return;

    await this.advanceGame5(playerId,clean);
  }

  // 交嘅內容有句號就即刻完結；冇就跟正常回合走，够回合數都完結。
  // Timeout（冇人交）都會經呢個function，用「……」頂住等遊戲繼續行落去。
  async advanceGame5(playerId,text){
    const g=this.room.gameState;
    if(!g || g.game!=="game5") return;

    const player=this.room.players.find(p=>p.id===playerId);
    g.story=[...g.story,{
      text,
      authorId:playerId,
      authorNickname:player?.nickname || "玩家"
    }];

    const hasFullStop = /[。.]/.test(text);

    if(hasFullStop || g.round>=g.totalRounds){
      g.phase="gameover";
      g.endsAt=null;
      await this.save();
      await this.broadcastRoom();
      return;
    }

    const order=g.turnOrder;
    const nextIndex=(order.indexOf(g.currentTurnPlayerId)+1) % order.length;

    g.round=g.round+1;
    g.currentTurnPlayerId=order[nextIndex];
    g.endsAt=Date.now()+(g.mode==="char" ? G5_CHAR_WRITE_MS : G5_SENTENCE_WRITE_MS);

    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  // 房主提前結算，直接跳去gameover，唔理你差幾多round先完。
  async onG5End(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game5" || g.phase==="gameover") return;
    g.phase="gameover";
    g.endedEarly=true;
    g.endsAt=null;
    await this.save();
    await this.broadcastRoom();
  }

  /* =========================
     Game 6 · Sync 唔 Sync
  ========================= */

  async startGame6(){
    for(const p of this.room.players) p.score=0;
    this.room.g6Sync={};       // 每對玩家同步咗幾多 round（雷達圖用）
    this.room.g6PairStats={};  // 每對玩家嘅詳細默契數據（二／三人局雷達圖用）
    this.room.g6Events=[];     // 每次 sync 嘅記錄，用嚟搵「最快一次」
    this.room.g6History=[];
    this.room.g6Log=[];        // 每 round 嘅完整紀錄（結算畫面「睇返紀錄」用）
    await this.beginRoundGame6(1);
  }

  // 一個 round 最多估 G6_MAX_ATTEMPTS 次，直至有兩個人寫中同一個詞；5 次都唔中就作廢。
  async beginRoundGame6(round){
    this.room.gameState={
      game:"game6",
      phase:"answering",
      round,
      totalRounds:this.room.g6Rounds||10,
      answerMs:this.room.g6AnswerMs||20000,
      voteMs:this.room.g6VoteMs||G6_VOTE_MS_DEFAULT,
      attempt:0,
      maxAttempts:G6_MAX_ATTEMPTS,
      history:[], // 之前幾次估咗咩：[{attempt, entries:[{id,nickname,text}]}]
      result:null,
      next:{},
      playedRounds:round-1
    };
    await this.beginAttemptGame6();
  }

  async beginAttemptGame6(){
    const g=this.room.gameState;
    const now=Date.now();
    g.phase="answering";
    g.attempt=(g.attempt||0)+1;
    g.startedAt=now;
    g.endsAt=now+g.answerMs;
    g.answers={}; // playerId -> {text, norm, t}
    g.groups=[];
    g.proposals=[];
    g.skip={};
    g.autoPair=false;
    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  async onG6Submit(playerId,text){
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="answering") return;
    if(g.answers[playerId]) return; // 每次估只可以交一次
    if(!this.room.players.some(p=>p.id===playerId && p.connected)) return;

    const clean=String(text||"").trim().replace(/\s+/g," ");
    const norm=g6Normalize(clean);
    if(!norm) return this.errorPlayer(playerId,"答案唔可以留空。");
    if(g6Units(clean.replace(/\s+/g,""))>G6_MAX_UNITS){
      return this.errorPlayer(playerId,"答案太長：中文最多 7 字，英文最多 15 個字元。");
    }

    const t=Math.max(0,Math.min(g.answerMs,Date.now()-g.startedAt));
    g.answers[playerId]={text:clean,norm,t};

    const connected=this.room.players.filter(p=>p.connected);
    if(connected.length && connected.every(p=>g.answers[p.id])){
      await this.startMergingGame6();
      return;
    }
    await this.save();
    await this.broadcastRoom();
  }

  async startMergingGame6(){
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="answering") return;

    const byNorm=new Map();
    for(const [pid,a] of Object.entries(g.answers)){
      if(!byNorm.has(a.norm)) byNorm.set(a.norm,{members:[],words:[]});
      const entry=byNorm.get(a.norm);
      entry.members.push(pid);
      if(!entry.words.includes(a.text)) entry.words.push(a.text);
    }
    g.groups=[...byNorm.values()].map((gr,i)=>({id:"g"+(i+1),members:gr.members,words:gr.words}));
    g.proposals=[];
    g.skip={};

    // 少過兩組答案就冇嘢可以合併，直接揭曉。
    if(g.groups.length<2){
      await this.revealGame6();
      return;
    }

    g.phase="merging";
    g.endsAt=Date.now()+g.voteMs;

    // 得兩個答案（例如二人局）：唔使揀，直接問大家「呢兩個算唔算同一個？」
    g.autoPair=g.groups.length===2;
    if(g.autoPair){
      const [a,b]=g.groups;
      const {list,unanimous}=this.g6EligibleVoters();
      g.proposals.push({
        id:"p1",a:a.id,b:b.id,wordsA:a.words,wordsB:b.words,
        by:null,eligible:list,unanimous,votes:{},status:"open"
      });
    }

    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  // 全部在線玩家都可以投票（包括今次冇交到答案嘅人），過半數同意就合併；二人局即係要兩個都同意。
  g6EligibleVoters(){
    const connected=this.room.players.filter(p=>p.connected).map(p=>p.id);
    return {list:connected,unanimous:false};
  }

  async onG6Propose(playerId,a,b){
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="merging" || g.autoPair) return;
    if(!a || !b || a===b) return;
    const ga=g.groups.find(x=>x.id===a), gb=g.groups.find(x=>x.id===b);
    if(!ga || !gb) return;
    const exists=g.proposals.some(pr=>pr.status==="open" && ((pr.a===a&&pr.b===b)||(pr.a===b&&pr.b===a)));
    if(exists) return;
    if(g.proposals.length>=8) return this.errorPlayer(playerId,"今 round 提議太多，唔可以再加。");

    const {list,unanimous}=this.g6EligibleVoters();
    const pr={
      id:"p"+(g.proposals.length+1),
      a,b,
      wordsA:ga.words,
      wordsB:gb.words,
      by:playerId,
      eligible:list,
      unanimous,
      votes:{},
      status:"open"
    };
    if(list.includes(playerId)) pr.votes[playerId]=true; // 提議人自己當投咗同意
    g.proposals.push(pr);
    // 有新提議就重新計時，等大家有時間投票。
    g.skip={};
    g.endsAt=Date.now()+g.voteMs;
    await this.resolveProposalsGame6(false);
  }

  // 大家寫得好接近：提議「全部人都算 Sync」，所有答案一齊合併。
  async onG6ProposeAll(playerId){
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="merging" || g.autoPair) return;
    if(g.groups.length<3) return;
    if(g.proposals.some(pr=>pr.status==="open" && pr.kind==="all")) return;
    if(g.proposals.length>=8) return this.errorPlayer(playerId,"今 round 提議太多，唔可以再加。");
    const {list,unanimous}=this.g6EligibleVoters();
    const pr={
      id:"p"+(g.proposals.length+1),
      kind:"all",
      a:null,b:null,
      wordsA:g.groups.flatMap(gr=>gr.words),
      wordsB:[],
      by:playerId,
      eligible:list,
      unanimous,
      votes:{},
      status:"open"
    };
    if(list.includes(playerId)) pr.votes[playerId]=true;
    g.proposals.push(pr);
    g.skip={};
    g.endsAt=Date.now()+g.voteMs;
    await this.resolveProposalsGame6(false);
  }

  async onG6Vote(playerId,proposalId,agree){
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="merging") return;
    const pr=g.proposals.find(x=>x.id===proposalId);
    if(!pr || pr.status!=="open") return;
    if(!pr.eligible.includes(playerId)) return;
    if(Object.prototype.hasOwnProperty.call(pr.votes,playerId)) return;
    pr.votes[playerId]=!!agree;
    await this.resolveProposalsGame6(false);
  }

  async onG6Skip(playerId){
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="merging") return;
    g.skip[playerId]=true;
    await this.resolveProposalsGame6(false);
  }

  // 計每個提議：過半數同意就合併、冇可能過就否決；時間到（final）仲未決定就照現時票數計。
  async resolveProposalsGame6(final){
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="merging") return;

    for(const pr of g.proposals){
      if(pr.status!=="open") continue;
      const yes=Object.values(pr.votes).filter(v=>v===true).length;
      const no=Object.values(pr.votes).filter(v=>v===false).length;
      const n=pr.eligible.length;
      const need=pr.unanimous ? n : Math.floor(n/2)+1;
      if(yes>=need) pr.status="passed";
      else if(n-no<need || final) pr.status="failed";
      if(pr.status==="passed"){
        if(pr.kind==="all"){
          // 「全部人都算 Sync」：所有答案併做一組。
          const [first,...rest]=g.groups;
          for(const gr of rest) this.mergeGroupsGame6(first.id,gr.id);
        }else{
          this.mergeGroupsGame6(pr.a,pr.b);
        }
      }
    }

    const open=g.proposals.some(pr=>pr.status==="open");
    const connected=this.room.players.filter(p=>p.connected);
    const allSkip=connected.length && connected.every(p=>g.skip[p.id]);

    if(final || (!open && (allSkip || g.groups.length<2 || g.autoPair))){
      await this.revealGame6();
      return;
    }
    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  mergeGroupsGame6(a,b){
    const g=this.room.gameState;
    const ga=g.groups.find(x=>x.id===a), gb=g.groups.find(x=>x.id===b);
    if(!ga || !gb || ga===gb) return;
    ga.members=[...ga.members,...gb.members];
    ga.words=[...ga.words,...gb.words.filter(w=>!ga.words.includes(w))];
    ga.mergedFrom=[...(ga.mergedFrom||[]),...gb.words];
    g.groups=g.groups.filter(x=>x.id!==b);
    // 指住被合併組別嘅提議改指新組別；變成同一組嘅就作廢。
    for(const pr of g.proposals){
      if(pr.kind==="all") continue;
      if(pr.a===b) pr.a=a;
      if(pr.b===b) pr.b=a;
      if(pr.status==="open" && pr.a===pr.b) pr.status="failed";
    }
  }

  // 一次估完（包括投票合併）：有人 sync 到就成功；否則入下一次估，5 次都唔中就作廢。
  async revealGame6(){
    const g=this.room.gameState;
    if(!g || g.game!=="game6") return;
    const nick=(id)=>this.room.players.find(p=>p.id===id)?.nickname || "玩家";

    if(!g.groups.length){
      const byNorm=new Map();
      for(const [pid,a] of Object.entries(g.answers)){
        if(!byNorm.has(a.norm)) byNorm.set(a.norm,{members:[],words:[]});
        const e=byNorm.get(a.norm);
        e.members.push(pid);
        if(!e.words.includes(a.text)) e.words.push(a.text);
      }
      g.groups=[...byNorm.values()].map((gr,i)=>({id:"g"+(i+1),members:gr.members,words:gr.words}));
    }

    const groups=g.groups.map(gr=>{
      const members=gr.members
        .map(id=>({id,nickname:nick(id),text:g.answers[id]?.text||"",t:g.answers[id]?.t??g.answerMs,merged:!!(gr.mergedFrom||[]).includes(g.answers[id]?.text)}))
        .sort((x,y)=>x.t-y.t);
      return {id:gr.id,words:gr.words,members,syncAt:members.length>=2 ? members[1].t : null};
    });

    const answeredIds=new Set(Object.keys(g.answers));
    const noAnswer=this.room.players.filter(p=>!answeredIds.has(p.id)).map(p=>p.nickname);
    const entries=this.room.players
      .filter(p=>answeredIds.has(p.id))
      .map(p=>({id:p.id,nickname:p.nickname,text:g.answers[p.id].text}));
    g.history=[...(g.history||[]),{attempt:g.attempt,entries}];

    const synced=groups.filter(gr=>gr.syncAt!==null);

    if(!synced.length){
      if(g.attempt<g.maxAttempts){
        await this.beginAttemptGame6();
        return;
      }
      // 5 次都冇人 sync 到：呢 round 作廢。
      g.result={success:false,voided:true,groups,noAnswer,attempt:g.attempt};
      this.room.g6Log=[...(this.room.g6Log||[]),{round:g.round,success:false,history:g.history}];
      g.playedRounds=g.round;
      g.phase="reveal";
      g.next={};
      g.endsAt=Date.now()+G6_VOID_MS;
      await this.save();
      await this.ctx.storage.setAlarm(g.endsAt);
      await this.broadcastRoom();
      return;
    }

    // 最快 sync = 第二個人交出相同答案嗰刻最早嘅組別，頭兩個人得分。
    const winner=synced.reduce((best,gr)=>gr.syncAt<best.syncAt ? gr : best);
    const remaining=Math.max(0,g.answerMs-winner.syncAt);
    const points=Math.round(G6_BASE_POINTS+G6_SPEED_POINTS*remaining/g.answerMs);
    const winnerIds=winner.members.slice(0,2).map(m=>m.id);
    for(const id of winnerIds){
      const p=this.room.players.find(x=>x.id===id);
      if(p) p.score=(p.score||0)+points;
    }

    // 默契數據：同一組入面每一對都計（包括慢咗同第三個人）。
    this.room.g6Sync=this.room.g6Sync||{};
    this.room.g6PairStats=this.room.g6PairStats||{};
    this.room.g6Events=this.room.g6Events||[];
    for(const gr of synced){
      for(let i=0;i<gr.members.length;i++){
        for(let j=i+1;j<gr.members.length;j++){
          const x=gr.members[i], y=gr.members[j];
          const k=g6PairKey(x.id,y.id);
          const at=Math.max(x.t,y.t);
          this.room.g6Sync[k]=(this.room.g6Sync[k]||0)+1;
          const st=this.room.g6PairStats[k]||(this.room.g6PairStats[k]={rounds:0,first:0,speed:0,scored:0,attempts:0});
          st.rounds+=1;
          if(g.attempt===1) st.first+=1;
          st.speed+=Math.max(0,g.answerMs-at)/g.answerMs;
          st.attempts+=g.attempt;
          if(gr.id===winner.id && winnerIds.includes(x.id) && winnerIds.includes(y.id)) st.scored+=1;
        }
      }
      this.room.g6Events.push({
        round:g.round,attempt:g.attempt,t:gr.syncAt,words:gr.words,
        aNickname:gr.members[0].nickname,bNickname:gr.members[1].nickname
      });
    }

    groups.sort((x,y)=>{
      if(x.id===winner.id) return -1;
      if(y.id===winner.id) return 1;
      if(x.syncAt!==null && y.syncAt!==null) return x.syncAt-y.syncAt;
      if(x.syncAt!==null) return -1;
      if(y.syncAt!==null) return 1;
      return 0;
    });

    g.result={success:true,groups,winnerGroupId:winner.id,winnerIds,points,noAnswer,attempt:g.attempt};
    g.playedRounds=g.round;
    this.room.g6History=[...(this.room.g6History||[]),{round:g.round,attempt:g.attempt,winnerWords:winner.words,winnerIds,points}];
    this.room.g6Log=[...(this.room.g6Log||[]),{
      round:g.round,success:true,attempt:g.attempt,history:g.history,
      words:winner.words,syncAt:winner.syncAt,points,
      winners:winner.members.slice(0,2).map(m=>m.nickname)
    }];

    g.phase="reveal";
    g.next={};
    g.endsAt=Date.now()+G6_SUCCESS_MS;
    await this.save();
    await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  async advanceAfterRevealGame6(){
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="reveal") return;
    if(g.round>=g.totalRounds){
      g.phase="gameover";
      g.endsAt=null;
      await this.save();
      await this.broadcastRoom();
      return;
    }
    await this.beginRoundGame6(g.round+1);
  }

  // 成功／作廢畫面：全部在線玩家撳「下一 round」就唔使等夠時間。
  async onG6Next(playerId){
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="reveal") return;
    g.next=g.next||{};
    g.next[playerId]=true;
    const connected=this.room.players.filter(p=>p.connected);
    if(connected.length && connected.every(p=>g.next[p.id])){
      await this.advanceAfterRevealGame6();
      return;
    }
    await this.save();
    await this.broadcastRoom();
  }

  async onG6End(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase==="gameover") return;
    g.phase="gameover";
    g.endedEarly=true;
    g.endsAt=null;
    await this.save();
    await this.broadcastRoom();
  }

  async onG6Restart(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game6" || g.phase!=="gameover") return;
    await this.startGame6();
  }

  /* =========================
     Game 8 · Battleship 海戰棋
  ========================= */

  g8Config(mode){
    if(mode==="brawl") return { size:6, ships:G8_SHIPS_SMALL, hotAt:G8_HOT_BRAWL };
    return { size:8, ships:G8_SHIPS_BIG, hotAt: mode==="team" ? G8_HOT_TEAM : 0 };
  }

  // 參加者：1v1／大亂鬥係玩家 id，分隊係 "navy" / "pirate"。
  g8Members(g,key){
    if(g.mode==="team") return (g.teams?.[key]||[]);
    return [key];
  }

  g8KeyOf(g,playerId){
    if(g.mode==="team"){
      if((g.teams?.navy||[]).includes(playerId)) return "navy";
      if((g.teams?.pirate||[]).includes(playerId)) return "pirate";
      return null;
    }
    return g.boards?.[playerId] ? playerId : null;
  }

  async onG8Mode(playerId,mode){
    if(playerId!==this.room.hostId) return;
    if(this.room.gameState && this.room.gameState.phase!=="waiting") return;
    if(!G8_MODES.includes(mode)) return;
    this.room.g8Mode=mode;
    await this.save();
    await this.broadcastRoom();
  }

  async startGame8(){
    const connected=this.room.players.filter(p=>p.connected);
    const allowed=g8AllowedModes(connected.length);
    let mode=this.room.g8Mode;
    if(!allowed.includes(mode)) mode=allowed[0];
    this.room.g8Mode=mode;
    for(const p of this.room.players) p.score=0;
    this.room.g8Stats={};
    this.room.g8Winners=[];
    this.room.g8TeamWins={navy:0,pirate:0};
    this.room.g8Teams=null;
    if(mode==="team"){
      const ids=shuffle(connected.map(p=>p.id));
      const half=Math.ceil(ids.length/2);
      this.room.g8Teams={navy:ids.slice(0,half),pirate:ids.slice(half)};
    }
    this.room.g8Roster=connected.map(p=>p.id);
    await this.beginRoundGame8(1);
  }

  g8Stat(id){
    this.room.g8Stats=this.room.g8Stats||{};
    return this.room.g8Stats[id] ||= {cells:0,hits:0,sinks:0,airHit:0};
  }

  async beginRoundGame8(round){
    const mode=this.room.g8Mode;
    const cfg=this.g8Config(mode);
    const roster=(this.room.g8Roster||[]).filter(id=>this.room.players.some(p=>p.id===id));
    const participants = mode==="team" ? ["navy","pirate"] : roster;
    const boards={};
    for(const key of participants){
      const members = mode==="team" ? (this.room.g8Teams?.[key]||[]) : [key];
      const ships=cfg.ships.map((s,i)=>({id:"s"+i,len:s.len,name:s.name,owner:null,cells:null,sunk:false}));
      if(mode==="team"){
        const n=members.length||1;
        const pattern = n===1 ? [0,0,0,0] : n===2 ? [0,1,1,0] : [0,1,2,0];
        ships.forEach((s,i)=>{ s.owner=members[pattern[i] % n] || members[0] || null; });
      } else {
        ships.forEach(s=>{ s.owner=key; });
      }
      boards[key]={id:key,owners:members,ships,shots:{},dead:false};
    }
    const prev=this.room.gameState;
    this.room.gameState={
      game:"game8",
      mode,
      phase:"placing",
      round,
      totalRounds:this.room.g8Rounds||3,
      turnMs:this.room.g8TurnMs||20000,
      size:cfg.size,
      hotAt:cfg.hotAt,
      teams:this.room.g8Teams||null,
      boards,
      ready:{},
      order:[],
      cur:null,
      shooter:null,
      shooterIdx:{navy:0,pirate:0},
      cycle:1,
      turnSeq:prev?.game==="game8" ? (prev.turnSeq||0) : 0,
      cards:{},
      pings:{},
      radar:[],
      last:null,
      airLog:null,
      airCycle:0,
      roundWinners:[],
      endsAt:Date.now()+G8_PLACE_MS
    };
    await this.commitGame8();
  }

  async commitGame8(){
    const g=this.room.gameState;
    await this.save();
    if(g?.endsAt) await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  g8Occupied(board,exceptShipId){
    const occ=new Set();
    for(const s of board.ships){
      if(s.id===exceptShipId || !s.cells) continue;
      for(const [r,c] of s.cells) occ.add(r+","+c);
    }
    return occ;
  }

  g8Fits(g,board,ship,r,c,horiz){
    const n=g.size;
    const cells=[];
    for(let i=0;i<ship.len;i++){
      const rr=horiz?r:r+i, cc=horiz?c+i:c;
      if(rr<0||cc<0||rr>=n||cc>=n) return null;
      cells.push([rr,cc]);
    }
    const occ=this.g8Occupied(board,ship.id);
    if(cells.some(([rr,cc])=>occ.has(rr+","+cc))) return null;
    return cells;
  }

  g8RandomPlace(g,board,ship){
    for(let t=0;t<400;t++){
      const horiz=Math.random()<.5;
      const r=Math.floor(Math.random()*g.size), c=Math.floor(Math.random()*g.size);
      const cells=this.g8Fits(g,board,ship,r,c,horiz);
      if(cells){ ship.cells=cells; return true; }
    }
    return false;
  }

  async onG8Place(playerId,shipId,r,c,horiz){
    const g=this.room.gameState;
    if(!g || g.game!=="game8" || g.phase!=="placing") return;
    const key=this.g8KeyOf(g,playerId); const board=key && g.boards[key];
    if(!board) return;
    const ship=board.ships.find(s=>s.id===shipId);
    if(!ship || ship.owner!==playerId) return;
    if(r===null || r===undefined){
      ship.cells=null;
      delete g.ready[playerId];
    } else {
      const cells=this.g8Fits(g,board,ship,Number(r),Number(c),!!horiz);
      if(!cells) return this.errorPlayer(playerId,"呢個位置擺唔到，可能出咗界或者撞到其他船。");
      ship.cells=cells;
    }
    await this.save();
    await this.broadcastRoom();
  }

  async onG8Random(playerId){
    const g=this.room.gameState;
    if(!g || g.game!=="game8" || g.phase!=="placing") return;
    const key=this.g8KeyOf(g,playerId); const board=key && g.boards[key];
    if(!board) return;
    const mine=board.ships.filter(s=>s.owner===playerId);
    for(const s of mine) s.cells=null;
    for(const s of [...mine].sort((a,b)=>b.len-a.len)) this.g8RandomPlace(g,board,s);
    await this.save();
    await this.broadcastRoom();
  }

  async onG8Ready(playerId,ready){
    const g=this.room.gameState;
    if(!g || g.game!=="game8" || g.phase!=="placing") return;
    const key=this.g8KeyOf(g,playerId); const board=key && g.boards[key];
    if(!board) return;
    if(ready){
      if(board.ships.some(s=>s.owner===playerId && !s.cells)){
        return this.errorPlayer(playerId,"仲有船未擺好。");
      }
      g.ready[playerId]=true;
    } else delete g.ready[playerId];
    if(this.g8AllPlaced(g)) return this.finishPlacingGame8();
    await this.save();
    await this.broadcastRoom();
  }

  g8AllPlaced(g){
    const connected=this.room.players.filter(p=>p.connected && this.g8KeyOf(g,p.id));
    return connected.length>0 && connected.every(p=>g.ready[p.id]);
  }

  async finishPlacingGame8(){
    const g=this.room.gameState;
    if(!g || g.game!=="game8" || g.phase!=="placing") return;
    for(const board of Object.values(g.boards)){
      for(const s of [...board.ships].sort((a,b)=>b.len-a.len)){
        if(!s.cells && !this.g8RandomPlace(g,board,s)){
          // 極少數情況擺唔落：全部清咗重新隨機擺。
          for(const t of board.ships) t.cells=null;
          for(const t of [...board.ships].sort((a,b)=>b.len-a.len)) this.g8RandomPlace(g,board,t);
          break;
        }
      }
    }
    // 派技能卡：1v1／大亂鬥每人一張；分隊每隊兩張。
    g.cards={};
    const keys=Object.keys(g.boards);
    for(const k of keys){
      const count = g.mode==="team" ? G8_TEAM_CARDS : 1;
      g.cards[k]=Array.from({length:count},()=>G8_CARDS[Math.floor(Math.random()*G8_CARDS.length)]);
    }
    const start=(g.round-1)%keys.length;
    g.order=[...keys.slice(start),...keys.slice(0,start)];
    g.cycle=1;
    this.setTurnGame8(g.order[0]);
    await this.commitGame8();
  }

  g8Alive(g){
    return g.order.filter(k=>!g.boards[k].dead);
  }

  g8Hot(g){
    return !!(g.hotAt && g.cycle>=g.hotAt);
  }

  setTurnGame8(key){
    const g=this.room.gameState;
    g.phase="turn";
    g.cur=key;
    g.turnSeq=(g.turnSeq||0)+1;
    let shooter=key;
    if(g.mode==="team"){
      const members=g.teams?.[key]||[];
      const online=members.filter(id=>this.room.players.some(p=>p.id===id && p.connected));
      const pool=online.length ? online : members;
      const idx=(g.shooterIdx[key]||0) % Math.max(1,pool.length);
      shooter=pool[idx]||members[0]||null;
    }
    g.shooter=shooter;
    const p=this.room.players.find(x=>x.id===shooter);
    const ms=this.g8Hot(g) ? Math.round(g.turnMs/2) : g.turnMs;
    g.endsAt=Date.now()+(p?.connected ? ms : G8_OFFLINE_TURN_MS);
  }

  g8ShotsLeft(board,size){
    const free=[];
    for(let r=0;r<size;r++) for(let c=0;c<size;c++) if(!board.shots[r+","+c]) free.push([r,c]);
    return free;
  }

  // 打一格：返回結果。sunk 係呢一炮打沉嘅船名。
  g8ShootCell(g,board,r,c,by,air){
    const k=r+","+c;
    if(board.shots[k]) return null;
    const ship=board.ships.find(s=>s.cells && s.cells.some(([rr,cc])=>rr===r&&cc===c));
    const res=ship ? "hit" : "miss";
    board.shots[k]={res,air:!!air};
    if(by){
      const st=this.g8Stat(by); st.cells++; if(ship) st.hits++;
    }
    if(ship && air && ship.owner) this.g8Stat(ship.owner).airHit++;
    let sunk=null;
    if(ship && !ship.sunk && ship.cells.every(([rr,cc])=>board.shots[rr+","+cc])){
      ship.sunk=true; sunk=ship.name;
      if(by) this.g8Stat(by).sinks++;
    }
    if(board.ships.every(s=>s.sunk)) board.dead=true;
    return {r,c,res,sunk};
  }

  async onG8Ping(playerId,r,c){
    const g=this.room.gameState;
    if(!g || g.game!=="game8" || g.phase!=="turn" || g.mode!=="team") return;
    const key=this.g8KeyOf(g,playerId);
    if(!key || key!==g.cur) return;
    g.pings[key]=g.pings[key]||{};
    const cell=Number(r)+","+Number(c);
    if(g.pings[key][playerId]===cell) delete g.pings[key][playerId];
    else g.pings[key][playerId]=cell;
    await this.save();
    await this.broadcastRoom();
  }

  async onG8Fire(playerId,target,r,c,card){
    const g=this.room.gameState;
    if(!g || g.game!=="game8" || g.phase!=="turn") return;
    if(g.shooter!==playerId) return this.errorPlayer(playerId,"未輪到你開炮。");
    r=Number(r); c=Number(c);
    if(!Number.isInteger(r)||!Number.isInteger(c)||r<0||c<0||r>=g.size||c>=g.size) return this.errorPlayer(playerId,"請揀一格。");
    const key=g.cur;
    if(g.mode!=="brawl") target=g.order.find(k=>k!==key);
    const board=g.boards[target];
    if(!board || target===key || board.dead) return this.errorPlayer(playerId,"請揀一個仲未出局嘅對手。");
    if(card && !G8_CARDS.includes(card)) return;
    if(card){
      const hand=g.cards[key]||[];
      const idx=hand.indexOf(card);
      if(idx<0) return this.errorPlayer(playerId,"冇呢張技能卡。");
      hand.splice(idx,1);
    } else if(board.shots[r+","+c]){
      return this.errorPlayer(playerId,"呢格已經打過。");
    }
    await this.fireGame8(playerId,key,target,r,c,card||null,false);
  }

  async fireGame8(by,key,target,r,c,card,auto){
    const g=this.room.gameState;
    const board=g.boards[target];
    const results=[];
    if(card==="radar"){
      let count=0;
      for(let rr=r-1;rr<=r+1;rr++) for(let cc=c-1;cc<=c+1;cc++){
        if(rr<0||cc<0||rr>=g.size||cc>=g.size) continue;
        if(board.shots[rr+","+cc]) continue;
        if(board.ships.some(s=>s.cells && s.cells.some(([a,b])=>a===rr&&b===cc))) count++;
      }
      g.radar.push({key,board:target,r,c,count});
    } else if(card==="cross"){
      for(const [rr,cc] of [[r,c],[r-1,c],[r+1,c],[r,c-1],[r,c+1]]){
        if(rr<0||cc<0||rr>=g.size||cc>=g.size) continue;
        const x=this.g8ShootCell(g,board,rr,cc,by,false); if(x) results.push(x);
      }
    } else if(card==="torpedo"){
      for(let cc=0;cc<g.size;cc++){
        const x=this.g8ShootCell(g,board,r,cc,by,false);
        if(!x) continue;
        results.push(x);
        if(x.res==="hit") break;
      }
    } else {
      const x=this.g8ShootCell(g,board,r,c,by,false); if(x) results.push(x);
    }
    g.last={by,key,target,card,r,c,auto:!!auto,cells:results,radar:card==="radar" ? g.radar[g.radar.length-1].count : null};
    if(g.pings[key]) g.pings[key]={};
    if(g.mode==="team") g.shooterIdx[key]=(g.shooterIdx[key]||0)+1;
    await this.advanceGame8();
  }

  // 下一個參加者；行完一圈 cycle+1，白熱化期間每圈完結空襲每塊板一格。
  async advanceGame8(){
    const g=this.room.gameState;
    if(await this.checkRoundOverGame8()) return;
    const order=g.order;
    const pos=order.indexOf(g.cur);
    let next=null, wrapped=false;
    for(let i=1;i<=order.length;i++){
      const idx=pos+i;
      const k=order[idx % order.length];
      if(idx>=order.length) wrapped=true;
      if(!g.boards[k].dead && k!==g.cur){ next=k; break; }
      if(!g.boards[k].dead && k===g.cur && i===order.length){ next=k; break; }
    }
    if(wrapped){
      const ended=g.cycle;
      g.cycle++;
      if(g.hotAt && ended>=g.hotAt){
        const air=[];
        for(const k of order){
          const b=g.boards[k];
          if(b.dead) continue;
          const free=this.g8ShotsLeft(b,g.size);
          if(!free.length) continue;
          const [rr,cc]=free[Math.floor(Math.random()*free.length)];
          const x=this.g8ShootCell(g,b,rr,cc,null,true);
          if(x) air.push({board:k,...x});
        }
        g.airLog=air;
        g.airCycle=g.cycle;
        if(await this.checkRoundOverGame8()) return;
        if(g.boards[next]?.dead) next=g.order.find(k=>!g.boards[k].dead);
      }
    }
    this.setTurnGame8(next);
    await this.commitGame8();
  }

  async checkRoundOverGame8(){
    const g=this.room.gameState;
    const alive=this.g8Alive(g);
    if(alive.length>1) return false;
    // 剩返一個就佢贏；如果空襲同時炸沉晒最後幾個（同歸於盡），呢輪冇贏家，算平手。
    const winKeys=alive;
    const winners=[...new Set(winKeys.flatMap(k=>this.g8Members(g,k)))];
    for(const id of winners){
      const p=this.room.players.find(x=>x.id===id); if(p) p.score=(p.score||0)+1;
    }
    if(g.mode==="team" && winKeys[0]) this.room.g8TeamWins[winKeys[0]]=(this.room.g8TeamWins[winKeys[0]]||0)+1;
    this.room.g8Winners=[...(this.room.g8Winners||[]),{round:g.round,keys:winKeys,ids:winners}];
    g.roundWinners=winKeys;
    g.phase="roundover";
    g.cur=null; g.shooter=null;
    g.endsAt=Date.now()+G8_ROUNDOVER_MS;
    await this.commitGame8();
    return true;
  }

  async afterRoundGame8(){
    const g=this.room.gameState;
    if(!g || g.game!=="game8" || g.phase!=="roundover") return;
    if(g.round>=g.totalRounds) return this.finishGame8(false);
    await this.beginRoundGame8(g.round+1);
  }

  async timeoutGame8(){
    const g=this.room.gameState;
    if(!g || g.game!=="game8") return;
    if(g.phase==="placing") return this.finishPlacingGame8();
    if(g.phase==="roundover") return this.afterRoundGame8();
    if(g.phase!=="turn") return;
    const key=g.cur;
    let target;
    if(g.mode==="brawl"){
      const opp=g.order.filter(k=>k!==key && !g.boards[k].dead);
      target=opp[Math.floor(Math.random()*opp.length)];
    } else target=g.order.find(k=>k!==key);
    const free=this.g8ShotsLeft(g.boards[target],g.size);
    const [r,c]=free[Math.floor(Math.random()*free.length)]||[0,0];
    await this.fireGame8(g.shooter,key,target,r,c,null,true);
  }

  async finishGame8(endedEarly){
    const g=this.room.gameState;
    if(!g || g.game!=="game8") return;
    g.phase="gameover";
    g.endsAt=null;
    g.cur=null; g.shooter=null;
    g.endedEarly=!!endedEarly;
    await this.save();
    await this.broadcastRoom();
  }

  async g8AfterDisconnect(){
    const g=this.room.gameState;
    if(!g || g.game!=="game8") return false;
    if(g.phase==="placing" && this.g8AllPlaced(g)){
      await this.finishPlacingGame8();
      return true;
    }
    if(g.phase==="turn"){
      const p=this.room.players.find(x=>x.id===g.shooter);
      if(p && !p.connected){
        const soon=Date.now()+G8_OFFLINE_TURN_MS;
        if(!g.endsAt || g.endsAt>soon){
          g.endsAt=soon;
          await this.commitGame8();
          return true;
        }
      }
    }
    return false;
  }

  async onG8End(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game8" || g.phase==="gameover") return;
    await this.finishGame8(true);
  }

  async onG8Restart(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game8" || g.phase!=="gameover") return;
    if(this.room.players.filter(p=>p.connected).length<MIN_PLAYERS){
      return this.errorPlayer(playerId,"最少要 2 位在線玩家先可以再玩。");
    }
    await this.startGame8();
  }

  /* =========================
     Game 7 · 數字炸彈
  ========================= */

  async startGame7(){
    for(const p of this.room.players) p.score=0;
    this.room.g7Winners=[]; // 每個回合嘅贏家：[{round, id}]
    await this.beginRoundGame7(1);
  }

  // 每個回合開始：所有在線玩家復活，每人隨機派一張技能卡。
  async beginRoundGame7(round){
    const order=this.room.players.map(p=>p.id);
    const alive=this.room.players.filter(p=>p.connected).map(p=>p.id);
    const prev=this.room.gameState;
    if(alive.length<MIN_PLAYERS){
      return this.finishGame7(prev?.game==="game7" && round>1);
    }
    const cards={};
    for(const id of alive) cards[id]=G7_CARDS[Math.floor(Math.random()*G7_CARDS.length)];
    this.room.gameState={
      game:"game7",
      phase:"turn",
      round,
      totalRounds:this.room.g7Rounds||5,
      turnMs:this.room.g7TurnMs||G7_TURN_MS_OPTIONS[0],
      order,
      alive,
      direction:1,
      cards,
      strikes:{},
      bombIndex:0,
      turnSeq:prev?.game==="game7" ? (prev.turnSeq||0) : 0,
      history:[],
      lastBoom:null,
      roundWinnerId:null,
      nextStartId:null
    };
    // 每個回合由唔同人開始，輪住嚟。
    await this.newBombGame7(alive[(round-1)%alive.length]);
  }

  async newBombGame7(startId){
    const g=this.room.gameState;
    g.bombIndex=(g.bombIndex||0)+1;
    g.bomb=g7RandInt(G7_BOMB_MIN,G7_BOMB_MAX);
    g.low=G7_BOMB_MIN;
    g.high=G7_BOMB_MAX;
    g.history=[];
    g.lastBoom=null;
    g.nextStartId=null;
    this.setTurnGame7(startId,null);
    await this.commitGame7();
  }

  setTurnGame7(id,via){
    const g=this.room.gameState;
    const now=Date.now();
    g.phase="turn";
    g.currentId=id;
    g.via=via;
    g.turnSeq=(g.turnSeq||0)+1;
    const p=this.room.players.find(x=>x.id===id);
    g.endsAt=now+(p?.connected ? g.turnMs : G7_OFFLINE_TURN_MS);
  }

  async commitGame7(){
    const g=this.room.gameState;
    await this.save();
    if(g?.endsAt) await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  // 由 id 嗰個位開始，跟方向搵下一個仲生存嘅人（id 自己可能啱啱出局）。
  nextAliveGame7(id,dir){
    const g=this.room.gameState;
    const order=g.order||[];
    const n=order.length;
    const i=order.indexOf(id);
    if(i<0) return g.alive[0]||null;
    for(let k=1;k<=n;k++){
      const cand=order[(((i+dir*k)%n)+n)%n];
      if(cand!==id && g.alive.includes(cand)) return cand;
    }
    return null;
  }

  pushHistoryGame7(entry){
    const g=this.room.gameState;
    g.history=[...(g.history||[]),entry].slice(-G7_HISTORY_MAX);
  }

  async onG7Guess(playerId,value){
    const g=this.room.gameState;
    if(!g || g.game!=="game7" || g.phase!=="turn") return;
    if(g.currentId!==playerId) return this.errorPlayer(playerId,"未輪到你。");
    const n=Number(value);
    if(!Number.isInteger(n) || n<g.low || n>g.high){
      return this.errorPlayer(playerId,`請輸入 ${g.low}–${g.high} 之間嘅整數。`);
    }
    g.strikes[playerId]=0;
    await this.applyGuessGame7(playerId,n,false);
  }

  async applyGuessGame7(id,n,auto){
    const g=this.room.gameState;
    if(n===g.bomb) return this.boomGame7(id,n,auto);
    const result=n<g.bomb ? "low" : "high";
    if(result==="low") g.low=n+1; else g.high=n-1;
    this.pushHistoryGame7({kind:"guess",id,value:n,result,auto});
    this.setTurnGame7(this.nextAliveGame7(id,g.direction),null);
    await this.commitGame7();
  }

  async onG7Card(playerId,targetId){
    const g=this.room.gameState;
    if(!g || g.game!=="game7" || g.phase!=="turn") return;
    if(g.currentId!==playerId) return this.errorPlayer(playerId,"未輪到你。");
    const card=g.cards?.[playerId];
    if(!card) return this.errorPlayer(playerId,"你呢個回合已經冇技能卡。");

    let next;
    if(card==="assign"){
      if(!targetId || targetId===playerId || !g.alive.includes(targetId)){
        return this.errorPlayer(playerId,"請揀一個仲未出局嘅玩家。");
      }
      next=targetId;
    } else if(card==="reverse"){
      g.direction=-(g.direction||1);
      next=this.nextAliveGame7(playerId,g.direction);
    } else {
      next=this.nextAliveGame7(playerId,g.direction);
    }

    g.cards[playerId]=null;
    g.strikes[playerId]=0;
    this.pushHistoryGame7({kind:"card",id:playerId,card,targetId:next});
    this.setTurnGame7(next,{card,by:playerId});
    await this.commitGame7();
  }

  // 超時：系統喺範圍入面隨機幫佢估一個（唔會幫佢用卡）。
  // 斷咗線嘅人連續超時兩次就當淘汰，個炸彈照舊，輪去下一位。
  async timeoutGame7(){
    const g=this.room.gameState;
    if(!g || g.game!=="game7" || g.phase!=="turn") return;
    const id=g.currentId;
    const p=this.room.players.find(x=>x.id===id);
    if(!p?.connected){
      g.strikes[id]=(g.strikes[id]||0)+1;
      if(g.strikes[id]>=G7_OFFLINE_STRIKES){
        g.alive=g.alive.filter(x=>x!==id);
        this.pushHistoryGame7({kind:"out",id});
        if(g.alive.length<=1){
          g.lastBoom={kind:"offline",id,bombIndex:g.bombIndex,via:null};
          return this.endRoundGame7(id);
        }
        this.setTurnGame7(this.nextAliveGame7(id,g.direction),null);
        await this.commitGame7();
        return;
      }
    }
    await this.applyGuessGame7(id,g7RandInt(g.low,g.high),true);
  }

  async boomGame7(id,n,auto){
    const g=this.room.gameState;
    this.pushHistoryGame7({kind:"guess",id,value:n,result:"boom",auto});
    g.alive=g.alive.filter(x=>x!==id);
    g.lastBoom={
      kind:"bomb",
      id,
      bomb:g.bomb,
      auto:!!auto,
      via:g.via||null,
      bombIndex:g.bombIndex
    };
    if(g.alive.length<=1) return this.endRoundGame7(id);
    g.phase="boom";
    g.currentId=null;
    g.nextStartId=this.nextAliveGame7(id,g.direction);
    g.endsAt=Date.now()+G7_BOOM_MS;
    await this.commitGame7();
  }

  // 剩返最後一個人：佢贏呢個回合。
  async endRoundGame7(){
    const g=this.room.gameState;
    const winner=g.alive[0]||null;
    if(winner){
      const p=this.room.players.find(x=>x.id===winner);
      if(p) p.score=(p.score||0)+1;
      this.room.g7Winners=[...(this.room.g7Winners||[]),{round:g.round,id:winner}];
    }
    g.phase="boom";
    g.currentId=null;
    g.roundWinnerId=winner;
    g.nextStartId=null;
    g.endsAt=Date.now()+G7_ROUND_WIN_MS;
    await this.commitGame7();
  }

  async afterBoomGame7(){
    const g=this.room.gameState;
    if(!g || g.game!=="game7" || g.phase!=="boom") return;
    if(g.roundWinnerId || g.alive.length<=1){
      if(g.round>=g.totalRounds) return this.finishGame7(false);
      return this.beginRoundGame7(g.round+1);
    }
    let start=g.nextStartId;
    if(!start || !g.alive.includes(start)) start=g.alive[0];
    await this.newBombGame7(start);
  }

  async finishGame7(endedEarly){
    const g=this.room.gameState && this.room.gameState.game==="game7"
      ? this.room.gameState
      : {game:"game7",round:0,totalRounds:this.room.g7Rounds||5,turnMs:this.room.g7TurnMs||G7_TURN_MS_OPTIONS[0],order:[],alive:[],history:[]};
    g.phase="gameover";
    g.endsAt=null;
    g.currentId=null;
    g.endedEarly=!!endedEarly;
    this.room.gameState=g;
    await this.save();
    await this.broadcastRoom();
  }

  // 輪到嘅人斷咗線：唔使等夠時間，好快就當佢超時。
  async g7AfterDisconnect(){
    const g=this.room.gameState;
    if(!g || g.game!=="game7" || g.phase!=="turn") return false;
    const p=this.room.players.find(x=>x.id===g.currentId);
    if(!p || p.connected) return false;
    const soon=Date.now()+G7_OFFLINE_TURN_MS;
    if(g.endsAt && g.endsAt<=soon) return false;
    g.endsAt=soon;
    await this.commitGame7();
    return true;
  }

  async onG7End(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game7" || g.phase==="gameover") return;
    await this.finishGame7(true);
  }

  async onG7Restart(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game7" || g.phase!=="gameover") return;
    if(this.room.players.filter(p=>p.connected).length<MIN_PLAYERS){
      return this.errorPlayer(playerId,"最少要 2 位在線玩家先可以再玩。");
    }
    await this.startGame7();
  }

  /* =========================
     Game 9 · 心中有數
  ========================= */

  async startGame9(){
    for(const p of this.room.players) p.score=0;
    this.room.g9Stats={};
    const prev=this.room.gameState;
    this.room.gameState={
      game:"game9",
      phase:"hint",
      round:1,
      totalRounds:this.room.g9Rounds||G9_ROUND_DEFAULT,
      guessMs:this.room.g9GuessMs||G9_GUESS_MS_DEFAULT,
      // 開局時喺線嘅人，按座位排；每個 round 每人輪流做一次出題人。
      order:this.room.players.filter(p=>p.connected).map(p=>p.id),
      turnIndex:-1,
      turnNo:0,
      usedIds:prev?.game==="game9" ? (prev.usedIds||[]) : [],
      psychicId:null
    };
    // 隨機揀幾題做空白題：大約每 5 題 1 題，最少 1 題。
    const g=this.room.gameState;
    const total=g.order.length*g.totalRounds;
    const count=Math.max(1,Math.round(total/G9_BLANK_EVERY));
    g.blankTurns=shuffle(Array.from({length:total},(_,i)=>i+1)).slice(0,count);
    await this.nextTurnGame9();
  }

  pickSpectrumGame9(){
    const g=this.room.gameState;
    let used=new Set(g.usedIds||[]);
    let pool=GAME9_SPECTRA.filter(x=>!used.has(x.id) && x.id!==g.spectrum?.id);
    if(!pool.length){
      g.usedIds=[];
      used=new Set();
      pool=GAME9_SPECTRA.filter(x=>x.id!==g.spectrum?.id);
    }
    const pick=pool[Math.floor(Math.random()*pool.length)];
    g.usedIds=[...(g.usedIds||[]),pick.id];
    return pick;
  }

  // 由而家個位置開始，搵下一個喺線嘅出題人；跨過 round 尾就入下一個 round。
  // 回傳 {index, round}；冇下一題就回傳 null。
  peekNextGame9(){
    const g=this.room.gameState;
    const n=(g.order||[]).length;
    let idx=g.turnIndex, round=g.round;
    for(let k=0;k<n*2+1;k++){
      idx++;
      if(idx>=n){ idx=0; round++; }
      if(round>g.totalRounds) return null;
      const p=this.room.players.find(x=>x.id===g.order[idx]);
      if(p?.connected) return {index:idx,round};
    }
    return null;
  }

  async nextTurnGame9(){
    const g=this.room.gameState;
    if(!g || g.game!=="game9") return;
    if(this.room.players.filter(p=>p.connected).length<MIN_PLAYERS){
      return this.finishGame9(g.turnNo>0);
    }
    const next=this.peekNextGame9();
    if(!next) return this.finishGame9(false);
    g.turnIndex=next.index;
    g.round=next.round;
    g.turnNo=(g.turnNo||0)+1;
    g.psychicId=g.order[next.index];
    g.blank=(g.blankTurns||[]).includes(g.turnNo);
    g.spectrum=g.blank
      ? {id:"blank",custom:true,text:{yue:{left:"",right:""},zh:{left:"",right:""}}}
      : this.pickSpectrumGame9();
    g.target=Math.floor(Math.random()*101);
    g.swapsLeft=g.blank ? 0 : G9_SWAPS;
    g.hintMs=g.blank ? G9_BLANK_HINT_MS : G9_HINT_MS;
    g.hint="";
    g.guesses={};
    g.guesserIds=[];
    g.result=null;
    g.next=null;
    g.skipped=false;
    g.phase="hint";
    const p=this.room.players.find(x=>x.id===g.psychicId);
    g.endsAt=Date.now()+(p?.connected ? g.hintMs : G9_OFFLINE_HINT_MS);
    await this.commitGame9();
  }

  async commitGame9(){
    const g=this.room.gameState;
    await this.save();
    if(g?.endsAt) await this.ctx.storage.setAlarm(g.endsAt);
    await this.broadcastRoom();
  }

  async onG9Swap(playerId){
    const g=this.room.gameState;
    if(!g || g.game!=="game9" || g.phase!=="hint") return;
    if(g.psychicId!==playerId) return this.errorPlayer(playerId,"你唔係今題嘅出題人。");
    if(g.blank) return this.errorPlayer(playerId,"空白題要自己出光譜。");
    if(!(g.swapsLeft>0)) return this.errorPlayer(playerId,"今題已經冇得再換。");
    g.spectrum=this.pickSpectrumGame9();
    g.swapsLeft-=1;
    await this.commitGame9();
  }

  async onG9Hint(playerId,text,left,right){
    const g=this.room.gameState;
    if(!g || g.game!=="game9" || g.phase!=="hint") return;
    if(g.psychicId!==playerId) return this.errorPlayer(playerId,"你唔係今題嘅出題人。");
    const zh=this.room.language==="zh";
    // 空白題：出題人連光譜兩邊都要自己寫，同提示一齊送出。
    let custom=null;
    if(g.blank){
      const clean=v=>String(v||"").replace(/\s+/g," ").trim();
      const l=clean(left), r=clean(right);
      if(!l || !r) return this.errorPlayer(playerId,zh?"光譜兩邊都要填寫。":"光譜兩邊都要打字。");
      if(g9Units(l)>G9_SPEC_MAX_UNITS || g9Units(r)>G9_SPEC_MAX_UNITS){
        return this.errorPlayer(playerId,zh?"每邊最多 8 個中文字或 16 個英文字母。":"每邊最多 8 個中文字或者 16 個英文字母。");
      }
      if(l.toLowerCase()===r.toLowerCase()) return this.errorPlayer(playerId,zh?"兩邊不能一樣。":"兩邊唔可以一樣。");
      custom={id:"blank",custom:true,text:{yue:{left:l,right:r},zh:{left:l,right:r}}};
    }
    const hint=String(text||"").replace(/\s+/g," ").trim();
    const len=[...hint].length;
    if(!len) return this.errorPlayer(playerId,zh?"請先輸入提示。":"打咗提示先。");
    if(len>G9_HINT_MAX) return this.errorPlayer(playerId,zh?`提示最多 ${G9_HINT_MAX} 個字。`:`提示最多 ${G9_HINT_MAX} 個字。`);
    if(/^[\d\s.,%+\-－。，]+$/.test(hint)) return this.errorPlayer(playerId,zh?"提示不能只有數字。":"提示唔可以淨係數字。");
    if(custom) g.spectrum=custom;
    g.hint=hint;
    g.guesserIds=this.room.players.filter(p=>p.connected && p.id!==g.psychicId).map(p=>p.id);
    g.guesses={};
    if(!g.guesserIds.length) return this.revealGame9();
    g.phase="guess";
    g.endsAt=Date.now()+(g.guessMs||G9_GUESS_MS_DEFAULT);
    await this.commitGame9();
  }

  allLockedGame9(){
    const g=this.room.gameState;
    const waiting=(g.guesserIds||[]).filter(id=>{
      const p=this.room.players.find(x=>x.id===id);
      return p?.connected && !(id in (g.guesses||{}));
    });
    return waiting.length===0;
  }

  async onG9Guess(playerId,value){
    const g=this.room.gameState;
    if(!g || g.game!=="game9" || g.phase!=="guess") return;
    if(!(g.guesserIds||[]).includes(playerId)) return this.errorPlayer(playerId,"今題你唔使估。");
    if(playerId in (g.guesses||{})) return;
    const n=Number(value);
    if(!Number.isInteger(n) || n<0 || n>100) return this.errorPlayer(playerId,"指針位置無效。");
    g.guesses={...(g.guesses||{}),[playerId]:n};
    if(this.allLockedGame9()) return this.revealGame9();
    await this.save();
    await this.broadcastRoom();
  }

  async revealGame9(){
    const g=this.room.gameState;
    if(!g || g.game!=="game9" || (g.phase!=="guess" && g.phase!=="hint")) return;
    const stats=this.room.g9Stats||(this.room.g9Stats={});
    const st=(id)=>stats[id]||(stats[id]={bulls:0,guesses:0,diffSum:0,psyPoints:0,psyTurns:0});
    const rows=[];
    for(const id of g.guesserIds||[]){
      if(!(id in (g.guesses||{}))) continue;
      const value=g.guesses[id];
      const diff=Math.abs(value-g.target);
      const points=g9Score(diff);
      const p=this.room.players.find(x=>x.id===id);
      if(p) p.score=(p.score||0)+points;
      const s=st(id);
      s.guesses+=1; s.diffSum+=diff; if(points===4) s.bulls+=1;
      rows.push({id,value,diff,points});
    }
    rows.sort((a,b)=>a.diff-b.diff);
    const missing=(g.guesserIds||[]).filter(id=>!(id in (g.guesses||{})));
    // 出題人攞所有估咗嘅人嘅平均分（四捨五入）；冇人估就冇分。
    const psychicPoints=rows.length ? Math.round(rows.reduce((a,r)=>a+r.points,0)/rows.length) : 0;
    const psy=this.room.players.find(x=>x.id===g.psychicId);
    if(psy) psy.score=(psy.score||0)+psychicPoints;
    const ps=st(g.psychicId); ps.psyPoints+=psychicPoints; ps.psyTurns+=1;
    g.result={target:g.target,guesses:rows,missing,psychicPoints};
    g.phase="reveal";
    g.skipped=false;
    g.next=this.revealNextInfoGame9();
    g.endsAt=Date.now()+G9_REVEAL_MS;
    await this.commitGame9();
  }

  revealNextInfoGame9(){
    const next=this.peekNextGame9();
    if(!next) return {last:true};
    const g=this.room.gameState;
    return {last:false,psychicId:g.order[next.index],round:next.round,turnIndex:next.index};
  }

  // 出題人夠鐘都未出提示（或者斷咗線）：跳過呢題，冇人有分。
  async skipTurnGame9(){
    const g=this.room.gameState;
    if(!g || g.game!=="game9" || g.phase!=="hint") return;
    g.phase="reveal";
    g.skipped=true;
    g.result=null;
    g.next=this.revealNextInfoGame9();
    g.endsAt=Date.now()+G9_SKIP_MS;
    await this.commitGame9();
  }

  async finishGame9(endedEarly){
    const g=this.room.gameState && this.room.gameState.game==="game9"
      ? this.room.gameState
      : {game:"game9",round:0,totalRounds:this.room.g9Rounds||G9_ROUND_DEFAULT,order:[],turnIndex:0,turnNo:0};
    g.phase="gameover";
    g.endsAt=null;
    g.endedEarly=!!endedEarly;
    this.room.gameState=g;
    await this.save();
    await this.broadcastRoom();
  }

  async g9AfterDisconnect(){
    const g=this.room.gameState;
    if(!g || g.game!=="game9") return false;
    if(g.phase==="hint"){
      const p=this.room.players.find(x=>x.id===g.psychicId);
      if(!p || p.connected) return false;
      const soon=Date.now()+G9_OFFLINE_HINT_MS;
      if(g.endsAt && g.endsAt<=soon) return false;
      g.endsAt=soon;
      await this.commitGame9();
      return true;
    }
    if(g.phase==="guess" && this.allLockedGame9()){
      await this.revealGame9();
      return true;
    }
    return false;
  }

  async onG9End(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game9" || g.phase==="gameover") return;
    await this.finishGame9(true);
  }

  async onG9Restart(playerId){
    if(playerId!==this.room.hostId) return;
    const g=this.room.gameState;
    if(!g || g.game!=="game9" || g.phase!=="gameover") return;
    if(this.room.players.filter(p=>p.connected).length<MIN_PLAYERS){
      return this.errorPlayer(playerId,"最少要 2 位在線玩家先可以再玩。");
    }
    await this.startGame9();
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

    if(await this.g6AfterDisconnect()) return;
    if(await this.g7AfterDisconnect()) return;
    if(await this.g8AfterDisconnect()) return;
    if(await this.g9AfterDisconnect()) return;

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

    if(g?.game==="game4" && g.phase==="voting" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.forceCloseVotingGame4();
      return;
    }

    if(g?.game==="game4" && g.phase==="reveal" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.advanceAfterRevealGame4();
      return;
    }

    if(g?.game==="game5" && g.phase==="writing" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.advanceGame5(g.currentTurnPlayerId,"……");
      return;
    }

    if(g?.game==="game6" && g.phase==="answering" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.startMergingGame6();
      return;
    }

    if(g?.game==="game6" && g.phase==="merging" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.resolveProposalsGame6(true);
      return;
    }

    if(g?.game==="game6" && g.phase==="reveal" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.advanceAfterRevealGame6();
      return;
    }

    if(g?.game==="game8" && (g.phase==="placing" || g.phase==="turn" || g.phase==="roundover") && g.endsAt && Date.now()+50>=g.endsAt){
      await this.timeoutGame8();
      return;
    }

    if(g?.game==="game7" && g.phase==="turn" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.timeoutGame7();
      return;
    }

    if(g?.game==="game7" && g.phase==="boom" && g.endsAt && Date.now()+50>=g.endsAt){
      await this.afterBoomGame7();
      return;
    }

    if(g?.game==="game9" && g.endsAt && Date.now()+50>=g.endsAt){
      if(g.phase==="hint") { await this.skipTurnGame9(); return; }
      if(g.phase==="guess") { await this.revealGame9(); return; }
      if(g.phase==="reveal") { await this.nextTurnGame9(); return; }
    }

    if(this.room.players.every(x=>!x.connected) && (!g || g.phase==="waiting" || g.phase==="result" || g.phase==="gameover")){
      await this.ctx.storage.deleteAll();
    }
  }
}
