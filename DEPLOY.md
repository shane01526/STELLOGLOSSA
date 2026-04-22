# 部署指南 · STELLOGLOSSA on Render

從零到 `https://stelloglossa.onrender.com` 的完整步驟。預計首次 10–15 分鐘。

---

## 前置條件

- [x] git repo 已初始化於專案根（`C:/Users/user/Desktop/Claude_project/STELLOGLOSSA/`）
- [x] `render.yaml` blueprint 就緒
- [x] `requirements-deploy.txt` 精簡依賴
- [x] `scripts/encode_audio_mp3.py` 已把 `.wav` 轉 `.mp3`（~100 MB）
- [x] `audio_manifest.json` + `bundle.json` 已用 `.mp3` 路徑重建
- [ ] 有 GitHub 帳號
- [ ] 有 Render 帳號（可用 GitHub 登入）

---

## 步驟 1：把 MP3 納入 git

預設 `.gitignore` 只排除 `*.wav`，`.mp3` 會自動被追蹤。

```bash
cd C:/Users/user/Desktop/Claude_project/STELLOGLOSSA
git add stelloglossa/output/audio/**/*.mp3
git add stelloglossa/output/audio_manifest.json
git add stelloglossa/src/viz/public/data/bundle.json
git add requirements-deploy.txt render.yaml DEPLOY.md scripts/
git add stelloglossa/src/viz/serve.py
git commit -m "Prepare for Render deploy: MP3 audio + cloud-ready serve.py"
```

---

## 步驟 2：建立 GitHub 公開倉庫

### 2a. 瀏覽器做法（無 gh CLI）

1. 打開 https://github.com/new
2. **Repository name**: `stelloglossa`（或你想要的名字）
3. **Public**（不要打勾 README / license / gitignore，我們已經有內容要 push）
4. 點 **Create repository**
5. 複製頁面上顯示的 HTTPS URL，例如 `https://github.com/你的帳號/stelloglossa.git`

### 2b. 推上去

```bash
cd C:/Users/user/Desktop/Claude_project/STELLOGLOSSA
git remote add origin https://github.com/你的帳號/stelloglossa.git
git branch -M main
git push -u origin main
```

第一次推大檔（~100 MB）會花 1-3 分鐘，看你的上行頻寬。

---

## 步驟 3：連結 Render 做第一次部署

1. 登入 https://dashboard.render.com
2. 點 **New +** → **Blueprint**
3. 授權 Render 存取你的 GitHub，選剛建立的 `stelloglossa` repo
4. Render 自動讀到 `render.yaml`，顯示將建立的服務清單（應該只有一個 Web Service）
5. 點 **Apply**
6. 等 build 完成（首次約 2-5 分鐘，pip install 只需 `jieba` + `python-dotenv`）
7. 部署成功後，Render dashboard 會顯示 URL 類似 `https://stelloglossa-XXXX.onrender.com`

---

## 步驟 4：驗證部署

瀏覽器打開 Render 給的 URL，檢查以下功能：

| 測試 | 預期 |
|------|------|
| 首頁 | STELLOGLOSSA intro 動畫 → 3D 星圖載入 |
| 點任一顆脈衝星 | card popup 彈出，Portrait 顯示 |
| 點詞彙 ▶ | 播放 MP3（Chrome DevTools → Network 應該看到 `audio/XXX/celestial_0.mp3` 200 OK）|
| 語言檔案 tab 下拉選單 | 列出 50 顆脈衝星 |
| 家譜樹 / 實驗結果 tab | 正常顯示 D3 圖表 |
| 翻譯器（detail 頁）| 輸入中文 → fetch `/translate?jname=X&text=Y` → 回傳該星語言 |
| MediaPipe 手勢 | **可能無法用** —— 雲端 HTTPS 沒問題，但 MediaPipe model 從 google CDN 抓需要時間，且需要同意授權 webcam |

---

## 步驟 5：之後的更新

每次 `git push` 到 `main` 分支，Render 會**自動重新部署**（`autoDeploy: true`）。若要停用：在 Render dashboard 的 service settings 關掉 Auto-Deploy。

```bash
# 做完修改
git add -A
git commit -m "your message"
git push
# Render 開始 rebuild,dashboard 會顯示 deploy 進度
```

---

## 冷啟動與喚醒策略

Render 免費方案 15 分鐘沒流量會休眠，下一個請求觸發冷啟動（~30 秒首次載入時間）。展覽時有幾種應對：

1. **UptimeRobot** / **cron-job.org**（免費）：每 10 分鐘 ping 一次網址防休眠
2. **升級到 Starter $7/月**：不休眠
3. **展台自架**：展台電腦本地跑 `python -m src.viz.serve`，完全不依賴 Render

---

## 為什麼不用 Docker？

免費 plan + pure Python + 只用標準庫 HTTP server + 兩個套件——用 Render native Python runtime 最簡單，建置快（<60 秒），不需寫 `Dockerfile`。若將來加重依賴（例如 WebSocket、Redis、資料庫）再考慮 Docker。

---

## 常見問題

### Q: 部署成功但首頁空白
開 DevTools Console 看紅字。多半是 `/data/bundle.json` 404（還在重新部署中）或 CORS（不太可能，同源）。

### Q: MP3 播不出來
- 確認 `audio_manifest.json` 裡的 `path` 是 `.mp3` 不是 `.wav`
- 確認 `output/audio/<jname>/<field>_<idx>.mp3` 實際存在（Render build log 會印檔案列表）
- 瀏覽器 Network tab 看 HTTP status

### Q: git push 被拒絕「file too large」
GitHub 單檔限制 100 MB、repo 總量建議 <1 GB。我們的 MP3 單檔 ~8 KB、總共 ~100 MB，不會觸發。如果觸發了，檢查有沒有意外把某個 `.npy` 或 `.wav` commit 進去：
```bash
git ls-files | xargs -I{} du -b "{}" | sort -rn | head
```

### Q: Render build 失敗
- Build log 看 `pip install` 錯誤
- 最常見是 Python 版本：確認 `render.yaml` 的 `PYTHON_VERSION` 為 `3.11.9`（Render 支援 3.7-3.12）

---

## 部署後的資產清單

| URL | 提供者 | 內容 |
|-----|-------|------|
| `/` | Render | index.html + 前端 JS bundle |
| `/data/bundle.json` | Render | 全體 50 顆星資料（~15 MB）|
| `/audio/<jname>/<field>_<idx>.mp3` | Render | 12,000 個語音檔 |
| `/translate?jname=X&text=Y` | Render | 即時翻譯 REST |
| MediaPipe wasm + model | Google CDN | 手勢偵測（lazy load）|
| three.js / d3.js | jsdelivr CDN | 前端繪圖庫 |
