# PLAY TOGETHER · GitHub Pages 版

這個版本完全移除 Node.js、Express、Socket.io 與 `server.js`。

## 專案結構

```text
/
├── index.html
├── style.css
├── app.js
├── questions.json
├── .nojekyll
└── README.md
```

## GitHub Pages 部署

1. 建立一個 GitHub repository。
2. 把以上檔案直接上傳到 repository 根目錄。
3. GitHub → `Settings` → `Pages`。
4. 選擇 `Deploy from a branch`，Branch 選你的主分支、Folder 選 `/ (root)`。
5. 儲存後等待 GitHub Pages 完成部署。

網站會直接載入 `questions.json`，所以不需要 `npm install` 或 `npm start`。

## 純靜態聯機方式

GitHub Pages 本身只負責提供靜態 HTML/CSS/JS/JSON。

跨裝置聯機使用瀏覽器原生 WebRTC：

- 房主建立房間。
- 房主按 `CREATE INVITE` 產生一次性邀請資料。
- 把邀請資料貼給一位玩家。
- 玩家產生 `ANSWER` 後貼回房主。
- P2P DataChannel 建立成功後，雙方直接傳遞遊戲狀態。
- 房主瀏覽器負責回合、倒計時、投票與遊戲狀態。
- 每局支援 4–6 人，房主需要逐一邀請其他玩家。

### 很重要的限制

這是真正的「零應用後端」版本，因此房主瀏覽器取代了原本的 Socket.io 伺服器。

優點：
- 不需要 Node.js。
- 不需要 npm。
- 可以直接放 GitHub Pages。
- 遊戲資料透過 P2P DataChannel 傳輸。

限制：
- 房主關閉頁面，遊戲房間就會消失。
- 手動交換 WebRTC 邀請 / Answer，比真正的房間伺服器麻煩。
- 某些公司、學校或嚴格 NAT 網路可能無法建立 P2P 連線；本版使用公開 STUN 服務協助穿透 NAT，但沒有 TURN 中繼。
- 房主的瀏覽器保存整個遊戲狀態，因此「法官 / 知情人 / 騙子」並非像真正服務器那樣對房主完全保密。這是零後端架構的安全邊界。

## 題庫

`questions.json` 包含：

- 遊戲1：6 類 × 180 題 = 1,080 題
- 遊戲2：5 類 × 30 題 = 150 題
- 總共 1,230 題

## 設計

- Pure Light `#FEFEF2`：網站主底色
- Serenity Blue `#929FC1`：主要冷色裝飾
- Golden Custard `#F2D965`：CTA / 高亮 / 互動色
- display：Fredoka
- body：Nunito

視覺採用大型標題、圓角卡片、貼紙式標籤、遊戲化 CTA 和大留白的版型。
