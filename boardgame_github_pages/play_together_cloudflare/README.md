# PLAY TOGETHER · GitHub Pages + Cloudflare Durable Objects

這一版是正式的「靜態前端 + 權威 WebSocket 後端」架構：

```text
GitHub Pages
  ├─ index.html
  ├─ style.css
  ├─ app.js
  ├─ config.js
  └─ questions.json   ← 公開題庫（不含 9upper 正解）

Cloudflare Worker
  └─ Durable Object / GameRoom
      ├─ 房間
      ├─ 玩家
      ├─ WebSocket
      ├─ 倒計時 Alarm
      ├─ 投票
      ├─ 身份分配
      ├─ 聊天
      └─ 私有答案
```

## 為什麼身份真正保密

9upper 的正確解釋不放在 GitHub Pages 的 `questions.json`。

- GitHub Pages：只公開術語、分類。
- Cloudflare Worker：保存完整術語 + 正確解釋。
- Durable Object 產生 `judge / truth / bluffer` 身份。
- 伺服器只把 `role` 發給對應玩家。
- 正確解釋只發給直言者。
- 法官直到自己作出選擇後，伺服器才公布真正直言者。

因此房主即使開 DevTools，也不會從公開遊戲狀態得到其他人的身份。

## 部署步驟

### A. GitHub Pages

把 repository 根目錄中的：

```text
index.html
style.css
app.js
config.js
questions.json
```

推到 GitHub。

然後修改：

```text
config.js
```

把：

```js
API_BASE_URL: "https://YOUR-WORKER.workers.dev"
```

換成你部署後的 Cloudflare Worker URL。

GitHub Pages 設定為從 `main` branch / root 發布即可。

### B. Cloudflare Worker + Durable Object

先安裝 Node.js，進入：

```text
cloudflare/
```

執行：

```bash
npm install
npx wrangler login
npm run dev
```

本地測試：

```bash
npx wrangler dev
```

部署：

```bash
npm run deploy
```

Cloudflare 會建立 `GameRoom` Durable Object 命名空間。這個專案使用 SQLite-backed Durable Object；Cloudflare 對新的 Durable Object namespace 現在要求 SQLite 儲存。citeturn966210search2turn922046search0

部署後會得到：

```text
https://play-together-game-server.<你的帳號>.workers.dev
```

把它填入 GitHub Pages 的 `config.js`。

## 遊戲同步

Cloudflare Durable Object 使用 WebSocket Hibernation API：

- `acceptWebSocket()` 建立可休眠的 WebSocket。
- `getWebSockets()` 找到房間中的所有連線。
- `serializeAttachment()` 保存每個連線的 playerId/token。
- `alarm()` 執行準時階段切換。

Cloudflare 官方目前建議 Durable Object 的多人遊戲 / WebSocket 應用使用 Hibernation API，因為 DO 可以在閒置時休眠而不斷線。citeturn345117search1turn345117search0

遊戲倒計時不是靠玩家瀏覽器的 `setTimeout()` 決定；伺服器用 Durable Object Alarm 設定階段切換時間，客戶端只顯示 `endsAt`。Alarm 在排程時間呼叫 `alarm()`，並支援失敗重試。citeturn693150search0

## 房間

- 6 位上限
- 4 位才可開始
- 無註冊
- 暱稱即可
- 6 位英數字房間號
- 房主離線會把房主權限轉移給下一位在線玩家
- 玩家可以用瀏覽器儲存的 token 重連

## 注意

Cloudflare Worker 和 GitHub Pages 是兩個部署單元：

- GitHub Pages：前端
- Cloudflare Worker：後端

這仍然符合「前端網站放 GitHub Pages」，但要真正做到身份保密、服務器權威同步和跨裝置 WebSocket，就必須有這個 Cloudflare 後端。
