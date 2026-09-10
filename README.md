# Dating with me~

一個單頁互動約會邀請網頁：對方打開連結後，經過 6 個步驟的互動，確認約會的日期、時間、活動與餐飲。

- 純前端單檔 `index.html`（內聯 CSS + Vanilla JS），雙擊即可在瀏覽器打開
- 無需後端、無需建置工具、無外部依賴
- Neo-Brutalism 風格：粗黑邊框、大圓角、亮粉主調、浮動小花
- 桌面端與行動端皆適配

## 自動收集她填的結果（Cloudflare Pages + KV）

網頁本身是純前端，她填的內容預設**不會離開她的瀏覽器**。要自動收到結果，需要在 Cloudflare Pages 專案裡做兩項設定：

1. **建立 KV namespace 並綁定**
   Cloudflare dashboard → Storage & Databases → KV → Create namespace（名字隨意，例如 `dating`）
   再到 Pages 專案 → Settings → Bindings（或 Functions → KV namespace bindings）
   新增綁定：**Variable name 必須填 `DATES`**，選剛建立的 namespace。

2. **設定管理密碼**
   Pages 專案 → Settings → Environment variables
   新增：**Variable name 填 `ADMIN_KEY`**，值自己定一串密碼，建議選 Secret（加密）。

設定完要**重新部署一次**，綁定才會生效。

### 怎麼看結果

打開 `https://<你的站>/admin.html`，輸入 `ADMIN_KEY` 即可。
沒有密碼的人打開這一頁看不到任何資料。

### 相關檔案

| 檔案 | 作用 |
|---|---|
| `functions/api/submit.js` | 她按到確認頁時，把結果寫進 KV |
| `functions/api/list.js` | 憑 `ADMIN_KEY` 讀出所有結果 |
| `admin.html` | 給你看結果的頁面 |

沒有綁定 KV 時，前端的回傳會靜默失敗，網頁一切照常 —— 直接雙擊 `index.html` 也能完整跑完。
