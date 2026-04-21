# STELLOGLOSSA

讓宇宙自己說話的語言考古機 — 以脈衝星物理參數為「憲法」,自動生成 50 種具有內部一致性的外星語言,並模擬其在星際距離上的語義接觸與漂移。

## 快速開始

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # 填入 ANTHROPIC_API_KEY, VOYAGE_API_KEY

python pipeline.py --stage extract        # 1. ATNF 物理參數
python pipeline.py --stage phonology      # 2. 物理 → 音系矩陣
python pipeline.py --stage lexicon        # 3. LLM 生詞彙 (Anthropic/OpenAI/Gemini)
python pipeline.py --stage contact        # 4. 星際接觸圖
python pipeline.py --stage embed          # 5. Voyage 語義嵌入
python pipeline.py --stage drift          # 6. 語義漂移模擬
python pipeline.py --stage analyze        # 7. H1/H2/H3 假說檢定
python pipeline.py --stage audio          # 8. eSpeak NG 批次合成 (可選)
python pipeline.py --stage report         # 9. STELLOGLOSSA_Report.md
python pipeline.py --stage bundle         # 10. 前端資料打包
python pipeline.py --stage all            # 全流程
```

## 啟動視覺化前端

```bash
python -m src.viz.serve
# 開 http://localhost:8765/
```

3D 星圖(Three.js)渲染 50 顆脈衝星於銀河座標系。點擊任一顆:
- 彈出音系側寫(音節結構/聲調/時態/母音)
- 列出 10 語義場的完整詞彙,每個詞可點 ▶ 試聽
- 高亮顯示接觸鄰居(藍色連線)
- 節點大小 ∝ 音系複雜度,顏色 ∝ 聲調數

## 選擇 LLM Provider

詞彙生成支援三個 provider,擇一使用即可:

| Provider | 預設模型 | 需要的 Key |
|----------|----------|-----------|
| `anthropic` | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| `openai` | `gpt-4o` | `OPENAI_API_KEY` |
| `gemini` | `gemini-2.5-flash` | `GEMINI_API_KEY` |

```bash
# 方法 1: 環境變數 (.env)
LLM_PROVIDER=gemini

# 方法 2: CLI flag (覆寫環境變數)
python pipeline.py --stage lexicon --provider openai --force-lexicon
```

更換 provider 後記得加 `--force-lexicon` 才會重新生成 (否則會吃舊快取)。


## 目錄

| 路徑 | 用途 |
|------|------|
| `src/core/` | 不依賴外部 API 的純計算模組 |
| `src/api/` | Anthropic / Voyage API wrapper |
| `src/viz/` | 前端視覺化 (JSX) |
| `data/raw/` | ATNF 原始抓取 |
| `data/processed/` | 清洗後的資料 + 音系側寫 + 詞彙庫 |
| `output/` | 最終產出的圖/網絡/報告 |
| `tests/` | 單元測試 |

詳見 `../STELLOGLOSSA_專案規劃書.md`。
