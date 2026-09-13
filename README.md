# Dating with me~

一個單頁互動約會邀請網頁：對方打開連結後，經過 6 個步驟的互動，確認約會的日期、時間、活動與餐飲。

- 純前端單檔 `index.html`（內聯 CSS + Vanilla JS），雙擊即可在瀏覽器打開
- 無需後端、無需建置工具、無外部依賴
- Neo-Brutalism 風格：粗黑邊框、大圓角、亮粉主調、浮動小花
- 桌面端與行動端皆適配

## 專案結構

```
public/index.html   約會邀請頁（雙擊即可在瀏覽器打開）；日期與活動皆可多選
public/admin.html   你看結果的頁面
src/index.js        Worker：處理 /api/submit 與 /api/list，其餘交給靜態資源
wrangler.jsonc      Cloudflare Worker 設定
```

## 自動收集她填的結果（Cloudflare Worker + KV）

網頁本身是純前端，她填的內容預設**不會離開她的瀏覽器**。要自動收到結果，需要三步：

### 1. 建立 KV namespace，把 ID 填進設定

Cloudflare 後台 → Storage & Databases → KV → Create namespace（名字隨意），
複製 **Namespace ID**，然後打開 `wrangler.jsonc`，把註解掉的那段取消註解並填入：

```jsonc
"assets": { ... },
"kv_namespaces": [
  { "binding": "DATES", "id": "你的32位KVNamespaceID" }
]
```

> ⚠️ 只有真實有效的 ID 才行。填假值或佔位符會讓 Cloudflare 部署失敗
> （wrangler 本機不檢查，要上傳到 Cloudflare 才會報錯）。

### 2. 設定管理密碼（三選一）

**最簡單：存在 KV 裡**（不用 CLI、不用額外產品）

Cloudflare 後台 → Storage & Databases → KV → 進入你的 namespace → 新增一筆：

| Key | Value |
|---|---|
| `config:admin_key` | 你自己定的密碼 |

存好即時生效，不用重新部署。`config:` 開頭的記錄不會出現在結果列表裡。

**其他兩種也支援**（`src/index.js` 的 `resolveAdminKey` 會依序嘗試）：

- 名為 `ADMIN_KEY` 的純文字變數，或 `npx wrangler secret put ADMIN_KEY`
- Secrets Store 綁定，變數名 `ADMIN_KEY`（會用 `await env.ADMIN_KEY.get()` 讀）

優先順序：變數 → Secrets Store → KV。

> 注意：Worker 後台的 **Settings → Builds → Variables and secrets** 是**建置時**的變數，
> Worker 執行時讀不到，放在那裡沒有用。

### 3. 開啟網址

Settings → Domains & Routes → 啟用 `workers.dev` 子網域，或綁定自己的網域。
沒開啟的話沒有人打得開這個站。

### 怎麼看結果

打開 `https://<你的站>/admin`，輸入 `ADMIN_KEY` 即可。
（注意是 `/admin`，Cloudflare 的靜態資源會自動去掉 `.html`。）
沒有密碼的人打開這一頁看不到任何資料。

### 本機開發

```bash
npm install
echo "ADMIN_KEY=test123" > .dev.vars   # 本機用，不會進 git
npx wrangler dev --local
```

沒有綁定 KV 時，前端的回傳會靜默失敗，網頁一切照常 —— 直接雙擊 `public/index.html` 也能完整跑完。
