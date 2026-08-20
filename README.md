# PLAY TOGETHER · Cloudflare Workers 版

呢個版本用 **Cloudflare Workers + Durable Objects** 做房間邏輯同即時同步，前端純靜態（GitHub Pages 或者 Cloudflare Pages 都得）。

## 專案結構

```text
/
├── index.html          前端頁面
├── style.css
├── app.js               前端邏輯，透過 WebSocket 連去 Worker
├── config.js             設定 Worker 網址
├── index.js               Cloudflare Worker + Durable Object（GameRoom）
├── question-bank.js        題庫（Worker 匯入呢個檔案，唔係 questions.json）
├── wrangler.json
├── package.json
├── .github/workflows/deploy.yml   推去 main 分支自動 wrangler deploy
└── README.md
```

> `questions.json` 而家冇任何程式碼會讀取（前端、Worker 都唔會），純粹係舊版留低嘅資料備份，可以刪除或者當備份保留，睇你哋需要。

## 部署步驟

### 1. Cloudflare Worker（房間邏輯）

```bash
npm install
npx wrangler deploy
```

部署完成之後，終端機會印出一個類似
`https://404err404r--github-io-boardgame.<你嘅-subdomain>.workers.dev`
嘅網址。將呢個網址填入 `config.js` 嘅 `WORKER_URL`。

如果想用 GitHub Actions 自動部署，喺 repo 嘅 `Settings → Secrets and variables → Actions` 入面加一個
`CLOUDFLARE_API_TOKEN`，推去 `main` 分支就會自動觸發 `.github/workflows/deploy.yml`。

### 2. 前端靜態頁面

`index.html` / `style.css` / `app.js` / `config.js` 純靜態，可以：

- 用 GitHub Pages（`Settings → Pages → Deploy from a branch`），或者
- 用 Cloudflare Pages（連埋個 repo，Build command 留空，Output directory 用 `/`）。

記得 `config.js` 嘅 `WORKER_URL` 一定要指返去上面部署好嘅 Worker 網址。

## 運作方式

- 房主喺前端建立房間 → 前端 `POST /api/rooms` 去 Worker，Worker 開一個 Durable Object 代表呢間房。
- 之後所有玩家（包括房主）透過 `wss://.../websocket?room=CODE` 連 WebSocket，直接同 Durable Object 通訊。
- 投票、聊天、計時、角色分配全部喺 Durable Object 入面處理，並透過 WebSocket 即時 broadcast 俾房入面所有人。
- 房間狀態存喺 Durable Object 嘅 SQLite storage，6 小時冇活動會自動清理。

## 題庫

`question-bank.js` 包含：

- 遊戲一（心有靈犀一點通）：8 個分類 × 共 568 題
- 遊戲二（9upper 瞎掰王）：5 個分類 × 30 題 = 150 題

> 遊戲二嘅 `explanation`（畀「老實人」睇嘅正確解釋）目前係 AI 根據術語常見定義寫嘅草稿，
> 建議入正式局之前自己快速覆核一次，尤其係「網絡梗起源」呢類同時效有關嘅題目。

## 設計

- Pure Light `#FEFEF2`：網站主底色
- Serenity Blue `#929FC1`：主要冷色裝飾
- Golden Custard `#F2D965`：CTA / 高亮 / 互動色
- display：Fredoka
- body：Nunito

視覺採用大型標題、圓角卡片、貼紙式標籤、遊戲化 CTA 和大留白的版型。
