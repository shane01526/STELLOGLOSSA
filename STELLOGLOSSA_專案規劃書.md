# 🌌 STELLOGLOSSA — 讓宇宙自己說話的語言考古機
### 專案規劃書 v2.2（肖像融合版）

> 撰寫時間：2026-04-21
> 對應程式碼：`stelloglossa/` 倉內最新 master
> 本版與 v1.1 的差異：把原本停留在構想階段的 12 章規劃，重寫為「**規劃書 ＋ 實作現況** 雙層文件」——每個模組都附已完成的檔案路徑、呼叫介面與實測結果。
> v2.1 變更：音訊層從「未渲染」升級為 **MBROLA + ffmpeg 物理驅動語音合成**，12,000 個詞 100% 成功，前端 ▶ 按鈕改吃真實 .wav。
> v2.2 變更：新增 **融合式肖像 (Portrait)** 視覺層——logogram 墨環 × avatar 物理肖像合而為一。每顆星有獨一無二的「圓相」，detail 頁動、map popup 靜、可匯出 PNG。§3 教學區保留純 logogram。

---

## 目錄

1. [專案概述](#1-專案概述)
2. [研究動機與背景](#2-研究動機與背景)
3. [系統架構（已實作版）](#3-系統架構已實作版)
4. [技術棧與相依性](#4-技術棧與相依性)
5. [Pipeline 執行流程（10 stage）](#5-pipeline-執行流程10-stage)
6. [後端模組細節](#6-後端模組細節)
7. [前端視覺化與互動功能](#7-前端視覺化與互動功能)
8. [資料產出與規模](#8-資料產出與規模)
9. [研究假說與實測結果](#9-研究假說與實測結果)
10. [目前進度、限制與 Known Issues](#10-目前進度限制與-known-issues)
11. [下一階段規劃](#11-下一階段規劃)
12. [延伸方向](#12-延伸方向)
13. [附錄：關鍵檔案索引](#附錄關鍵檔案索引)

---

## 1. 專案概述

**STELLOGLOSSA**（拉丁 stella「星」＋希臘 glossa「語言」）是一個跨領域計算專案，核心命題：

> **如果語言不是人類發明的，而是宇宙的物理節奏自然生長出來的——它會長什麼樣子？**

本專案從 ATNF 脈衝星資料庫抓取真實觀測參數，以確定性的映射規則把物理參數（自轉週期 P、色散量 DM、自轉減慢率 Ṗ、脈衝寬度 W50）轉為音系／語法／文字特徵，並以 LLM 或合成規則產生完整詞彙表、信件、詩歌，最後透過 Three.js + D3 + Web Audio 在瀏覽器端呈現 3D 星圖、語言家譜樹、假說儀表板、Arrival 風格 logogram 與 IPA 即時發音。

**專案已從規劃階段進入可運行的 MVP。** 全 pipeline 能在單機跑完，產出 50 顆脈衝星、50 份音系側寫、10,000 個詞條（50 顆 × 10 語義場 × 20 詞）、659 條接觸邊的完整資料集，並在 http://localhost:8765 啟動互動前端。

本專案融合三個子領域：

| 子領域 | 來源靈感 | 貢獻內容 |
|--------|----------|----------|
| 脈衝星時序分析 | 專案5（宇宙節奏詩歌） | 語言的音系原材料 |
| 外星語言生成 | 專案2（外星語言模擬器） | 詞彙與語法結構建構 |
| 跨語言語義漂移 | 專案1（星名語義考古） | 語言在星際間的演化與接觸 |

---

## 2. 研究動機與背景

### 2.1 天文學視角

脈衝星（Pulsar）是高速自轉的中子星，每顆物理特性各異：

- **自轉週期** P：毫秒到數秒
- **色散量** DM：反映星際介質密度
- **自轉減慢率** Ṗ：星體老化指標
- **脈衝寬度** W50：信號時間輪廓

這四個物理量構成每顆脈衝星獨一無二的「聲紋」。本專案將其當作語言憲法。

### 2.2 語言學視角

- **音系**（Phonology）：一門語言使用哪些聲音
- **聲調**（Tone）：音高是否攜帶意義
- **時態觀**（Tense-Aspect）：語言如何概念化時間
- **語義場**（Semantic Field）：詞彙如何組織概念

**聲象徵**（Sound Symbolism）如 Bouba/Kiki 效應：人類普遍傾向將圓潤形狀配對柔音。本專案把此概念擴展到天文尺度。

### 2.3 跨領域原創性

在此之前未有專案系統性地將脈衝星物理參數作為語言生成的規則，並進一步模擬星際語義接觸。STELLOGLOSSA 的原創性：

1. 物理決定語言結構（非任意性被物理法則取代）
2. 地理距離（星際距離）驅動語言演化
3. 生成的語言具有內在一致性與可驗證的統計特性

---

## 3. 系統架構（已實作版）

```
┌─────────────────────────────────────────────────────────────────────┐
│                 STELLOGLOSSA 實作架構（2026-04 版）                  │
├─────────────────────────────────────────────────────────────────────┤
│ LAYER 1 · 物理層 ─────────────────────────────────────────────────  │
│   psrqpy ─► ATNF Pulsar Catalogue（>2000 顆，離線快取）             │
│             │                                                       │
│             ▼                                                       │
│   pulsar_extractor.py  (stratified sample 50 顆 → pulsars.json)     │
│   constellation_mapper.py (astropy 赤道→銀河笛卡爾 + IAU 星座名)    │
│                                                                     │
│ LAYER 2 · 語言層 ─────────────────────────────────────────────────  │
│   phonology_engine.py  (P/DM/Ṗ/W50 → 音節/聲調/時態/母音+子音)      │
│   grammar.py          (jname-seeded 確定性文法：語序/形容詞位/否定) │
│   phonology_validator.py (regex 驗證 LLM 回傳詞是否符合音節模板)    │
│             │                                                       │
│             ▼                                                       │
│   llm_provider.py     (Anthropic / OpenAI / Gemini 統一介面)        │
│   lexicon_generator.py (10 語義場 × 20 詞；無 key 走確定性 fallback) │
│   lexicon_glosses.py  (200 詞中文主檔 + POS + 別名索引)             │
│                                                                     │
│ LAYER 3 · 漂移層 ─────────────────────────────────────────────────  │
│   contact_model.py    (歐式距離 + 指數衰減權重 + 4 種接觸 regime)   │
│   semantic_embedder.py (Voyage voyage-3，無 key 用 SHA-256 偽向量)  │
│   drift_simulator.py  (label-propagation 5 步迭代；ndarray 快照)    │
│                                                                     │
│ LAYER 4 · 敘事層 ─────────────────────────────────────────────────  │
│   letter_composer.py  (每星一封 150 字抒情信，subtitle/衍生/body)   │
│   poem_composer.py    (每星一首詩，詞取自該星 lexicon；中譯潤飾)    │
│   translator.py       (中文 → 該星語言，jieba 斷詞 + 文法重排)      │
│                                                                     │
│ LAYER 5 · 分析層 ─────────────────────────────────────────────────  │
│   hypothesis_tester.py (H1 Mann-Whitney / H2 χ² / H3 Wilcoxon)      │
│   family_tree.py      (Ward linkage → D3 + Newick)                  │
│   drift_export.py     (壓縮 60MB drift_snapshots.npy → 前端 JSON)   │
│   report_writer.py    (STELLOGLOSSA_Report.md 自動生成)             │
│                                                                     │
│ LAYER 5.5 · 音訊合成層 ─────────────────────────────────────────────│
│   sampa_mapper.py     (IPA → SAMPA per-voice;12,000 詞 100% 可映射) │
│   audio_renderer.py   (物理→語速/音高/reverb → .pho → MBROLA → wav) │
│                         → ffmpeg aecho 加 reverb + EQ)              │
│                                                                     │
│ LAYER 5.6 · 肖像視覺層 ─────────────────────────────────────────────│
│   public/portrait.js  (融合 logogram 墨環 × 物理光球,detail 頁動態) │
│   public/logogram.js  (純 logogram,供 §3 教學解剖)                  │
│                                                                     │
│ LAYER 6 · 視覺化層 ───────────────────────────────────────────────  │
│   bundle_data.py      (全體資料打包為 public/data/bundle.json)      │
│   serve.py            (http 8765 + /translate REST + /audio/* mount)│
│   public/  ── index.html + 9 個 ES modules：                        │
│     app.js         Three.js 3D 星圖 + OrbitControls + PointerLock   │
│     pulsar_detail.js  §1–§9 敘事詳細頁                              │
│     features.js   11 個互動功能（搜尋/quiz/custom/earth-compare…）  │
│     speech.js     Web Audio 雙共振峰 IPA formant synth              │
│     ambient.js    Interstellar / Kamakura 雙氛圍 Web Audio 合成     │
│     tree_view.js  D3 家譜樹                                         │
│     results_view.js 假說儀表板（inline SVG chart）                  │
│     logogram.js   Arrival 風格 SVG logogram（依音系確定性繪製）     │
│     about_view.js 專案說明                                          │
│     intro.js      進場動畫                                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. 技術棧與相依性

### 4.1 後端（Python ≥3.11）

`requirements.txt`：

```
astropy>=6.0         # 赤道↔銀河座標、IAU 88 星座對應
psrqpy>=1.3          # ATNF Pulsar Catalogue 客戶端
numpy/pandas/scipy   # 數值 + Mann-Whitney / χ² / Wilcoxon / ward linkage
networkx>=3.2        # 接觸網絡圖，GraphML / JSON
gensim>=4.3          # 詞向量後處理（已預備，尚未使用）
anthropic>=0.40      # Claude（詞彙/信/詩 LLM 選項一）
openai>=1.50         # GPT-4o（選項二）
google-generativeai  # Gemini 2.5 Flash（選項三）
voyageai>=0.3        # voyage-3 embedding（語義向量）
jieba>=0.42          # 翻譯器中文斷詞
python-dotenv>=1.0   # .env 讀取
pytest>=8.0          # 單元測試
```

### 4.2 前端（瀏覽器原生）

- **Three.js** 0.160+（CDN import map，含 OrbitControls / PointerLockControls）
- **D3.js** v7（CDN）— 家譜樹、假說圖表
- **Web Audio API** — 純瀏覽器 IPA 發音 + 兩種原創氛圍音樂合成
- **原生 SVG** — logogram 手繪風、儀表板 chart
- **localStorage** — 已探索脈衝星進度、使用者筆記

### 4.3 外部工具（音訊合成必要，其它選用）

三個工具全部放在使用者可寫的 `%USERPROFILE%\tools\`，不動 Program Files、不需 admin、不需裝 eSpeak NG：

| 工具 | 路徑 | 用途 | 來源 |
|------|------|------|------|
| **MBROLA 3.3**（Windows binary）| `~\tools\mbrola\mbrola.exe` + `mbrola.dll` | diphone concat 合成 | [thiekus/MBROLA](https://github.com/thiekus/MBROLA/releases) |
| **MBROLA voices** | `~\tools\mbrola\voices\{fr4,de6,us1,us2,us3,en1}\` | 法女聲 / 德男聲（實測只用到前兩個）| [numediart/MBROLA-voices](https://github.com/numediart/MBROLA-voices) raw files |
| **ffmpeg**（master build）| `~\tools\ffmpeg\bin\ffmpeg.exe` | reverb (aecho) + highpass/lowpass EQ 後處理 | [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds/releases/latest) |

三者都由 `config.py` 的 `MBROLA_EXE` / `MBROLA_VOICES_DIR` / `FFMPEG_EXE` 指向絕對路徑；未找到時 `audio_renderer.run()` 會寫 manifest 但 skip 合成，前端遇到 manifest 沒有 rendered=true 的詞會自動 fallback 到 `speech.js` 的 Web Audio formant 合成。

### 4.4 LLM Provider 抽象

`src/api/llm_provider.py` 以 Protocol + dataclass 封裝三家 API，統一只暴露 `.generate(prompt) -> str` 與 `.available: bool`。切換方式：

```bash
# .env
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...

# 或 CLI 覆寫
python pipeline.py --stage lexicon --provider openai --force-lexicon
```

**目前預設**：`anthropic` + `claude-sonnet-4-6`。任一 provider 無 key 時，`lexicon_generator` 會 fallback 到確定性合成詞彙表（`_synthetic_lexicon()`），讓 pipeline 在離線環境仍能跑完。

---

## 5. Pipeline 執行流程（10 stage）

主入口 `pipeline.py`，支援單 stage 或 `--stage all`：

| Stage | 函式 | 輸入 | 輸出 | 備註 |
|-------|------|------|------|------|
| `extract` | `pulsar_extractor.run()` | ATNF / seed | `data/processed/pulsars.json` | stratified sample (period×DM×RA bins) |
| `phonology` | `phonology_engine.run()` | pulsars.json | `phonology_profiles/*.json` | 音系+文法 |
| `lexicon` | `lexicon_generator.run()` | profiles | `lexicons/*.json` | 每顆 10 場 × 20 詞；可選 LLM |
| `contact` | `contact_model.run()` | pulsars.json | `contact_graph.graphml/.json` | 50 node / 659 edge |
| `embed` | `semantic_embedder.run()` | lexicons | `output/embeddings.npz` | Voyage voyage-3 或 SHA-256 fallback |
| `drift` | `drift_simulator.run()` | graph + embeddings | `drift_snapshots.npy`, `drift_asymmetry.json` | 5 步 label-propagation |
| `analyze` | `hypothesis_tester.run()` | 上述全部 | `hypothesis_results.json` | H1/H2/H3 |
| `drift_summary` | `drift_export.run()` | snapshots | `drift_summary.json` | 60MB → 幾十 KB |
| `tree` | `family_tree.run()` | profiles | `language_tree.json/.nwk` | Ward linkage |
| `report` | `report_writer.run()` | 全部 | `STELLOGLOSSA_Report.md` | 自動報告 |
| `audio` | `audio_renderer.run()` | lexicons | `output/audio/*.wav` | 需 eSpeak NG；否則只寫 manifest |
| `poems` | `poem_composer.compose_all()` | profiles+lexicons | `output/poems/*.json` | 每星一首 |
| `letters` | `letter_composer.compose_all()` | profiles+lexicons+graph | `output/letters/*.json` | 每星一封 |
| `bundle` | `bundle_data.run()` | 全部 | `src/viz/public/data/bundle.json` | 前端單檔載入 |

最終只要：

```bash
python pipeline.py --stage all
python -m src.viz.serve                # http://localhost:8765/
```

---

## 6. 後端模組細節

### 6.1 Module 1 · 脈衝星擷取（`src/core/pulsar_extractor.py`）

- 優先用 **psrqpy** 查 ATNF（離線快取於 `data/raw/atnf_cache.json`，現已 502 KB / 2000+ 顆）。
- ATNF 不通時 fallback 到 49 顆手工 seed（含 Crab、Vela、J0437、J1939 等代表性脈衝星）。
- **分層抽樣** `filter_sample()`：以 log10(P) × log10(DM) × RA 象限建 3D bucket，round-robin 取樣 50 顆，保證參數空間與天區覆蓋多樣性（固定 seed=42，可重現）。
- `enrich()` 以 astropy SkyCoord 把 RA/DEC 轉成銀河笛卡爾座標（單位 kpc），同時貼上 IAU 星座名。

### 6.2 Module 2 · 音系引擎（`src/core/phonology_engine.py`）

**四個物理參數 → 四條映射規則**：

```
P (s)          DM (pc/cm³)     Ṗ                 W50 (ms)
│              │               │                 │
▼              ▼               ▼                 ▼
音節結構       聲調數          時態豐富度        母音庫
CV   < 0.01s   0  < 10         none   < 1e-19    3 母音  < 1ms
CVC  < 0.1s    2  < 50         P/NP   < 1e-17    5 母音  < 5ms
CCVC < 1s      4  < 200        P/Prs/F< 1e-15    7 母音  < 20ms
CCCVCC ≥ 1s    6+ ≥ 200        compound ≥ 1e-15  10 母音（含 y ø ã）
```

**子音庫有兩軸**（v2.0 新增）：
- **size** ← 音節結構：CV=6、CVC=9、CCVC=12、CCCVCC=15
- **flavour** ← 聲調數：無聲調 → 擦音豐富；多聲調 → 塞音為主、彈舌音增加（模仿普通話/越南語 vs 夏威夷語/日語差異）

**complexity_score** = `len(syllable) × max(tones, 1) × len(vowels)`，範圍 6（CV/0/3）~360（CCCVCC/6/10）。

### 6.3 Module 2.5 · 文法生成器（`src/core/grammar.py`）

為每顆脈衝星以 **jname hash seed** 確定性抽取 9 個文法參數：

| 參數 | 取值 | 分布 |
|------|------|------|
| word_order | SOV/SVO/VSO/VOS/OSV/OVS | 按世界語言頻率加權（SOV 41%, SVO 35%） |
| adjective_position | before/after | 50/50 |
| negation | prefix/suffix/particle-before/particle-after | 均勻 |
| tense_marker | prefix/suffix/particle/none | 均勻 |
| plural_marker | suffix/reduplication/none | 均勻 |
| question_marker | final/initial particle/intonation | 均勻 |
| possessive | N-of-N / NN-concat | 50/50 |
| vowel_harmony | none ×3 / front-back / round | 偏無諧 |
| emphasis_position | initial/final | 50/50 |

保證「相同 jname → 相同文法」，跨 run 穩定。前端翻譯器會依此重排語序、插入形態標記。

### 6.4 Module 3 · 詞彙生成器（`src/api/lexicon_generator.py` + `lexicon_glosses.py`）

- **語義場：12 個**（v2.0 從原規劃的 10 個擴增，加入 `pronoun` + `function`）：
  `celestial, time, death, light, return, distance, density, direction, contact, myth, pronoun, function`
- **每場 20 詞**（WORDS_PER_FIELD），每星 240 詞（實際 10 語義場×20 詞 = 200 詞表中有 entry 的），總計 ~10,000 詞。
- **中文 gloss 主檔**：`lexicon_glosses.py` 內嵌 200 個概念（每場 20 個），每個概念含 `gloss` / `explanation` / `pos` / `aliases`，供翻譯器反查。
- **驗證**：`phonology_validator.py` 用 regex `^(CONS_CLASS|VOWEL_CLASS)+$` 檢查 LLM 回傳詞是否合法；最多重試 3 次，仍失敗則 fallback 到合成詞。
- **LLM prompt** 明確要求：音節結構、聲調數、時態、母音清單，輸出純 JSON（`response_format={"type":"json_object"}` for OpenAI、`response_mime_type` for Gemini）。
- **快取機制**：`data/processed/lexicons/{jname}.json` 存在即跳過，用 `--force-lexicon` 強制重生。

### 6.5 Module 4 · 接觸模型（`src/core/contact_model.py`）

- **距離**：歐式距離於銀河笛卡爾座標（kpc）。
- **權重**：`w = exp(-d / λ)`，λ=1 kpc（可調）。
- **4 種接觸 regime**：
  - `borrowing`    d < 0.5 kpc
  - `extension`    0.5 ≤ d < 2
  - `narrowing`    2 ≤ d < 5
  - `isolation`    d ≥ 5（這些邊不加入圖）
- **網絡產出**：`contact_graph.graphml`（可匯 Gephi）+ `contact_graph.json`（前端用）。實測 50 顆 → **659 條邊**。

### 6.6 Module 4.5 · 語義漂移（`src/core/drift_simulator.py`）

Label-propagation-style 迭代：

```
vectors[i] ← (1-α) · vectors[i] + α · weighted_mean(neighbours_matching_field)
```

- α = 0.15，steps = 5。
- **逐欄位配對**：只讓「同語義場」的向量漂移（例如 A 星的「光」只吸收鄰星的「光」，不會跟「死亡」混）。
- 每步保留一個快照 → `drift_snapshots.npy`（shape: `(6, 2500, 1024)`，約 60 MB）。
- `_asymmetry_report()` 比對「低複雜度星 vs 高複雜度星」每對每場的漂移距離，供 H3 使用。

### 6.7 Module 5 · 敘事生成（`src/api/letter_composer.py` + `poem_composer.py`）

**letter_composer.py**（約 360 行）：
- 為每顆脈衝星產一份含 **subtitle / derivations / greeting / body / signoff** 的 JSON。
- 可用 LLM 一次生成全部五段；離線時走 `_synthetic_letter()`：
  - subtitle 優先查 `UNIQUE_SUBTITLES` 手寫字典，沒有則用 `{constellation}-{distance}-{period}` 樣板。
  - derivations 從 `PERIOD_LINES / DM_LINES / PDOT_LINES / W50_LINES` 四個池各抽一條，以該星數值填槽。
  - body 從 `LETTER_INTROS / RHYTHMS / WORDS / NEIGH / CODAS` 組合，插入該星至少兩個自造詞；會依文法 `word_order` 多加一句「語序提示」。
- jname-seeded RNG → 相同星每次相同信。

**poem_composer.py**：
- 詩的長度由週期決定（短週期 → 短詩）。
- 詞完全取自該星既有 lexicon，保證音系一致。
- 有 5 套中文樣板（`_TMPL_NN/NV/VN/NA/AN`）做逐句潤飾，避免直譯生硬。

### 6.8 Module 6 · 翻譯器（`src/api/translator.py`）

**中文 → 該星語言** 的 Phase-1 離線規則版：

1. `jieba.posseg.cut` 斷詞 + POS 標註。
2. 查 `build_chinese_index()`（從 `lexicon_glosses.SEMANTIC_GLOSSES` 反查 gloss + aliases）→ (field, idx)。
3. 查該星 lexicon → 拿 `form` (IPA/羅馬化)。
4. 套用文法：
   - 語序重排（SVO → 該星語序）
   - 形容詞前/後置
   - 時態標記（偵測「了/過/曾/將/會」）
   - 否定標記（偵測「不/沒/未」）
   - 複數標記（偵測「們/幾個/許多」+ 數詞）
5. 回傳 `{tokens, output, grammar}` 供前端顯示逐詞對照。

已掛在 `serve.py` 的 `/translate?jname=...&text=...` REST 端點，前端 `features.js` 的 B6 功能即時查詢。

### 6.9 Module 7 · 分析（`src/analysis/`）

#### `hypothesis_tester.py` — H1/H2/H3（見 §9 實測結果）

- **H1**：Mann-Whitney U（DM 中位數分組，比較聲調數）+ Spearman ρ(DM, 網絡度數)
- **H2**：2×2 χ² 列聯表（light/death field × 高前母音/低後母音）+ Cramér's V
- **H3**：Wilcoxon signed-rank（低複雜度 vs 高複雜度星逐對漂移量）

#### `family_tree.py`
- 5 維特徵向量：[音節長度, 聲調數, 時態等級, 母音數, log10(DM)]
- Z-normalise → pdist(euclidean) → scipy `linkage(method="ward")`
- 匯出兩格式：D3 hierarchy JSON（前端用）+ Newick（FigTree/Dendroscope 可讀）

#### `drift_export.py`
- 把 60 MB 的 `drift_snapshots.npy` 壓成 `drift_summary.json`（每星每場 6 步漂移距離的純數字表）給前端。

#### `report_writer.py`
- 自動輸出 `STELLOGLOSSA_Report.md`：音系類型分布 / H1~H3 / 最複雜 / 最簡單 / 網絡 hub / 孤島。

### 6.10 Module 8 · 音訊合成（v2.1 全面重寫）

### 6.10.1 設計目標
每顆脈衝星的物理參數要**真的能聽得出差異**——不是同一個 TTS 聲線加不同 pitch，而是語速、音高、母音長度、殘響深度、空間感全部由物理決定。捨棄 v1 的 eSpeak NG 方案（需 admin 安裝 MSI），改走純 user-dir 的 **MBROLA + ffmpeg** 組合。

### 6.10.2 合成流程（每個詞）
```
IPA form (e.g. "ʃa")
    │
    ▼
sampa_mapper.pick_voice(jname, inventory, words)   # fr4 or de6
sampa_mapper.to_sampa(word, voice)                 # ['S', 'a:']
    │
    ▼
audio_renderer.build_pho(sampas, params, tone_idx)
    ; 產生 MBROLA .pho，含逐音素時長 + pitch contour
    ▼
mbrola.exe -e voices/{voice}/{voice} input.pho output_raw.wav
    │
    ▼
ffmpeg -af "aecho={in_gain}:{decay}:{delay}:0.4,
             highpass=80, lowpass=7200"
    │
    ▼
output/audio/{jname}/{field}_{idx}.wav   (22kHz mono PCM 16)
```

### 6.10.3 物理 → 語音參數映射
定義在 `config.AUDIO_CONFIG`，由 `audio_renderer.speech_params_for()` 與 `reverb_params_for()` 套用：

| 物理量 | 合成參數 | 範圍 | 直覺 |
|--------|---------|------|------|
| `period_s` 短 ↔ 長 | base pitch (Hz) | 220 ↔ 80 | 快轉高亢、慢轉沉鬱（log scale）|
| `period_s` 短 ↔ 長 | 語速 (wpm) | 260 ↔ 130 | 毫秒脈衝星像鳥鳴、秒級脈衝星像誦經 |
| `w50_ms` 窄 ↔ 寬 | 母音時長 (ms) | 120 ↔ 220 | 脈寬 = 母音「被允許的時間」|
| `tone_count` 0 ↔ 6 | pitch 變動幅度 (Hz) | 0 ↔ 150 | 聲調越多 pitch 起伏越大 |
| `dm` 低 ↔ 高 | reverb decay | 0.3 ↔ 0.85 | 訊號穿越厚實星際介質 → 更長殘響 |
| `distance_kpc` 近 ↔ 遠 | reverb delay (ms) | 30 ↔ 120 | 遠的星空間感更深 |
| `jname` SHA-256 | voice 選擇 | fr4 / de6 | 每星固定一個聲線 |

### 6.10.4 Voice pool（v2.1 精簡結果）
起初計畫 6 個 MBROLA voice（us1/us2/us3/en1/de6/fr4），實測 diphone 覆蓋後：
- **fr4**（法女聲）用純母音 SAMPA `a e i o u`，除 /h/ 外對我們的詞彙 100% 覆蓋
- **de6**（德男聲）用德文長母音 SAMPA `a: e: i: o: u:`，含 /h/，對我們 100% 覆蓋
- **us1/us2/us3/en1** 的英文 SAMPA（diphthong 為主）diphone 缺口 40-60%，放棄

最終 voice pool 簡化為 **fr4 + de6 兩選一**（hash 決定），搭配物理驅動的 pitch/speed/reverb，每顆星仍有顯著可聽差異。實測 50 顆分布 **28 : 22**。

### 6.10.5 `sampa_mapper.py`（新模組，~85 行）
per-voice 映射表 + 三條選擇規則：
1. 硬規則：inventory 含 /ã/ 必用 fr4（只有 fr4 有 `a~` diphone）
2. 硬規則：lexicon 內實際出現 /h/ 必用 de6（fr4 把 /h/ 映為 `""` 對應法文「h muet」自然脫落）
3. 其餘：`hash(jname) % 2` 挑選

### 6.10.6 踩到的 3 個坑與修法
| 坑 | 症狀 | 修法 |
|----|------|------|
| mbrola.exe 不支援 Unicode 檔名 | 以 IPA 當檔名的 .wav 寫不出 | 檔名改為全 ASCII 的 `{field}_{idx}.wav` |
| MBROLA 在 CCC 叢集爆 "Concat PANIC" | CCCVCC 結構星 47% 失敗 | `build_pho()` 在**第一個音素**強制加 pitch 錨點 |
| 低 pitch + 大 spread → 負 Hz | mbrola 回 `rc=3221226505` | contour clamp 到 `[55, 380]` Hz + spread cap 到 `base × 0.45` |

### 6.10.7 前端播放整合（`app.js` + `pulsar_detail.js`）
- `app.js:speak(form, jname, field, idx)` 依 `(jname, field, idx)` 在 `bundle.audio_manifest` 查 path，有 rendered=true → `new Audio("/audio/" + path).play()`；失敗或 manifest 無項 → fallback 到 `speech.js` 的 Web Audio formant。
- `pulsar_detail.js` 詞彙列表改 `items.forEach((entry, idx) => ...)` 把 idx 傳進 click handler。
- `serve.py` 加 `Cache-Control: no-cache, no-store, must-revalidate` 給 `.js/.json/.html`，避免瀏覽器 cache 住舊 ES module 造成改動不生效。

### 6.10.8 `speech.js`（前端 Web Audio fallback，未刪）
純瀏覽器 formant synth，母音用 F1/F2/F3 三共振峰、子音分類（stop/fric/nasal/liquid/glide）各自合成。v2.0 時是主力，v2.1 變成 MBROLA 失靈時的退路。

### 6.10.9 實測結果（2026-04-21 實跑）
- **12,000 / 12,000 詞合成成功（100%）**
- 0 mbrola failures, 0 unmappable phonemes
- 總 .wav 檔：361 MB，每檔平均 ~30 KB（22 kHz mono PCM 16）
- 整批合成時間：~8 分鐘（Windows 11 單機，single-thread）

### 6.11 Module 9 · 融合式肖像 Portrait（v2.2 新增）

#### 6.11.1 設計命題
每顆星需要一個「獨一無二的視覺身份」。選項有三：疊合 / 共用環 / 相位切換。選定 **共用環（策略 B+）**——讓 logogram 的墨環**就是**星體光球的邊界，而非環繞星體的外加符號。

#### 6.11.2 設計演變
| 版本 | 階段 | 做法 | 保留？ |
|------|------|------|--------|
| v2.1.1 | 原 `avatar.js`（已刪）| Avatar 肖像與 logogram 並存、同時出現於 detail 頁與 map popup | ❌ 已被 Portrait 取代 |
| v2.2 | `portrait.js`（現行）| 墨環 + 物理光球 合體，一個視覺元素同時表達語言與物理 | ✅ |

#### 6.11.3 視覺語法（portrait.js）
單一 SVG，`viewBox='-120 -120 240 240'`。分兩個圖層組：

**固定層（不隨自轉）：**
- 背景徑向漸變（`distance_kpc` → alpha，愈遠愈暗）
- **Jet beams**（從 `bulge[0]` 軸方向射出，長度 log scale 自 `period_s`；固定在空間中，形成燈塔效應——脈衝星的 bulge 轉過 jet 位置時產生 pulse 觀感）
- 中子星核心（中心亮點，`tense_richness` 決定大小 + 可選虛線圈）
- Frame hairline（#22304a 極細圓框，天文觀測板意象）

**旋轉層（`<g class="portrait-spin">`，以 `period × 10` 秒一圈旋轉）：**
- Corona 噴濺（`syllable.length × 3 + consonants × 0.3` 根輻射線）
- **Ring fill disc**（DM palette 半透明填色，過 glow filter）
- **Ring stroke**（融合式墨環——見 6.11.4）
- Secondary ink trace（偏移副環，logogram 雙筆墨感）
- Tonal bulges（`tones+1` 個突起，視為磁極）
- 內部 vowel arcs（弦線，數量 = 母音庫大小）
- Drip tails（從 bulge 外流的墨跡痕）

#### 6.11.4 融合式墨環邊界
```
ring_radius(θ) = R · (1 + low(θ) + tremor + notch)
  low(θ)   = sin(3θ+φ₁)·A·0.55 + sin(5θ+φ₂)·A·0.30   低頻 body 形狀
  tremor   = rand()±0.04                                 高頻墨汁手抖
  notch    = CCCVCC 時 10% 機率 −0.15                    晶體碎口
  A = {CV: 0.03, CVC: 0.05, CCVC: 0.12, CCCVCC: 0.20}    按音節結構
```

兩個頻率層同時疊加：高頻保留 logogram 的書法手繪感、低頻帶入 avatar 的星體形變。CV 結構接近「圓相」；CCCVCC 破碎多邊形。

#### 6.11.5 物理 × 語言對照表
| 視覺元素 | 物理意義 | 語言意義 |
|---------|---------|---------|
| 墨環邊界抖動 | 星體輪廓不規則 | 音節結構複雜度 |
| 墨環填色 hue | DM 導致星際消光紅化 | —— |
| 墨環突起（bulges）| 磁極 | 聲調數量 |
| Jet beams（不隨 spin） | 自轉軸輻射，lighthouse 觀感 | —— |
| 背景光暈 alpha | 距離 | —— |
| 環內弧線 | 光球表面紋路 | 母音庫 |
| 墨汁流痕（drips）| —— | logogram 書法質感 |
| 外部噴濺（corona）| 日冕塵流 | 音節 + 子音複雜度 |
| 中心發光點大小 | 中子星緻密核心 | 時態豐富度 |
| 自轉速度 | P 真實週期 | —— |

#### 6.11.6 §3 純 logogram 保留理由
§3「圓環符號解剖」需要**清晰對應每個語言參數到視覺元素**作教學用途，融合版把物理質感疊進來會干擾這個對應。因此保留 `logogram.js` 純粹版本僅供 §3 使用；其他所有「這顆星的臉」之處（detail hero / map popup）一律走 portrait.js。

#### 6.11.7 PNG 匯出
`downloadPortraitPNG(jname, svg, scale=3)`：
1. cloneNode SVG 並移除所有 `<animateTransform>` / `<animate>` 節點（匯出靜態 snapshot）
2. SVG → Blob → Image → Canvas（3× scale 達 720×720 或依 size 放大）
3. Canvas 先填 `#05060a` 背景（避免白底貼圖時不透明度漏掉）
4. `canvas.toBlob` → 下載 `{jname}-portrait.png`

#### 6.11.8 整合點
| 位置 | 尺寸 | 動畫 |
|------|------|------|
| Detail view §1 Identity hero | 320 px | ✅ 按 `period × 10` 秒轉一圈 + 核心呼吸 |
| 3D 星圖 card popup | 180 px | ❌ 靜態 |
| Map node 本身 | — | 不加（會干擾 3D 分佈） |
| §3 圓環符號解剖 | 320 px | ❌ 純 logogram（非 portrait） |

---

## 7. 前端視覺化與互動功能

進入點：`python -m src.viz.serve` → http://localhost:8765/

### 7.1 5 個頂部分頁（view）

| Tab | 檔案 | 內容 |
|-----|------|------|
| Map | `app.js` Three.js scene | 50 顆脈衝星 3D 散佈；節點大小 ∝ complexity_score，顏色 ∝ tone_count |
| Tree | `tree_view.js` | D3 hierarchical tree（Ward linkage）|
| Results | `results_view.js` | H1/H2/H3 卡片 + DM-聲調散佈圖 + 母音熱度圖 + inline SVG |
| About | `about_view.js` | 專案敘事 + 方法論說明 |
| Detail (dropdown) | `pulsar_detail.js` | 選定脈衝星的 §1–§9 頁 |

### 7.2 Map 視圖互動

- **OrbitControls**（預設）+ **PointerLockControls**（按 F 切飛行模式，WASD + Shift boost）
- 點擊脈衝星 → 彈出詳細卡，顯示：
  - 物理參數（P/DM/Ṗ/W50/距離）
  - 音系側寫（含 grammar）
  - **Arrival 風格 logogram**（`logogram.js` 確定性 SVG，依音系參數繪製）
  - 詞彙面板，每詞可 ▶ 試聽（`speech.js` Web Audio formant）
  - 接觸鄰居連線（藍色邊，按距離加權）
  - 該星的信件 + 詩（折疊展開）

### 7.3 11 個互動功能（`features.js`）

| ID | 功能 | 說明 |
|----|------|------|
| A1 | 搜尋 | 即時模糊搜尋 jname/星座/音系 |
| A2 | 隨機跳躍 | 隨機挑一顆 |
| A3 | 幫助面板 | 快捷鍵說明 |
| A4 | 已探索進度 | localStorage 記錄，HUD 顯示 `X/50` |
| B5 | Compare | 挑兩顆脈衝星做並排音系對比 |
| B6 | Earth compare | 6 種地球語言（普通話/日/英/越/芬/夏威夷）投影到音系 5 維空間，找最近的脈衝星 |
| B7 | Custom pulsar | 四個 slider 實時調 P/DM/Ṗ/W50，即時算出對應音系與 5 個核心詞 |
| B8 | Translate | 輸入中文 → 顯示該星語言譯文 + 逐詞對照 |
| C9 | Quiz | 隨機出一個詞，選它屬於哪個語義場 |
| C10 | Daily star | 依今日日期 hash 挑選今日之星 |
| C11 | Notes | 使用者可對脈衝星寫筆記（localStorage） |

### 7.4 氛圍音樂（`ambient.js`）

兩種純 Web Audio 合成、無版權檔案：
- **Interstellar**：低頻 organ drone + pad + bell（宇宙冷感）
- **Kamakura**：D 大調 pad + 五聲音階鋼琴 arpeggio + wind chime（日式溫情）

支援外部檔覆寫：若 `/audio/background-{mode}.mp3` 存在則優先用。`duckAmbient()` 在詞彙試聽時壓低音量。

### 7.5 敘事性細節（`pulsar_detail.js`）

每顆脈衝星的詳細頁有 9 區段（對應規劃書 §1–§9）：
1. 該星的「詩意副標」
2. 物理參數
3. 音系從何而來（四個 derivations，帶該星實際數值與比喻）
4. 音系側寫
5. logogram
6. 核心詞彙
7. 接觸鄰居
8. 信件
9. 詩

---

## 8. 資料產出與規模

實測（`data/processed/` + `output/`）：

| 檔案 | 大小 | 內容 |
|------|------|------|
| `data/raw/atnf_cache.json` | 502 KB | ATNF 2000+ 顆原始查詢結果 |
| `data/processed/pulsars.json` | 19 KB | 50 顆分層抽樣結果（含銀河笛卡爾座標、星座名） |
| `data/processed/phonology_profiles/*.json` | 50 檔 × ~900 B | 每星完整音系＋文法 |
| `data/processed/lexicons/*.json` | 50 檔 × ~41 KB | 每星 10 場詞彙 |
| `output/contact_graph.graphml` | 130 KB | networkx → GraphML（Gephi 可讀）|
| `output/contact_graph.json` | 135 KB | 同上的 node-link JSON |
| `output/embeddings.npz` | 9.5 MB | 2,500 詞 × 1024 dim |
| `output/drift_snapshots.npy` | 60 MB | (6 steps, 2500 words, 1024 dim) |
| `output/drift_asymmetry.json` | 948 KB | H3 用的逐對漂移摘要 |
| `output/drift_summary.json` | 57 KB | 前端用的壓縮版 |
| `output/hypothesis_results.json` | 1 KB | H1/H2/H3 統計結果 |
| `output/language_tree.json/.nwk` | 20 KB / 1.3 KB | 家譜樹 |
| `output/audio_manifest.json` | ~3 MB | 12,000 詞 × {jname, field, idx, voice, path, rendered} |
| `output/audio/{jname}/*.wav` | **361 MB 共 12,000 檔** | MBROLA 合成 + ffmpeg 殘響（22 kHz mono）|
| `output/audio/{jname}/voice.txt` | 50 檔 × ~200 B | 該星所用 voice + 物理映射參數（除錯用）|
| `output/STELLOGLOSSA_Report.md` | 2 KB | 自動生成的總結報告 |
| `output/letters/*.json` | 50 檔 × ~1.4 KB | 每星一信 |
| `output/poems/*.json` | 50 檔 × ~1 KB | 每星一詩 |

---

## 9. 研究假說與實測結果

**資料規模**：50 顆脈衝星 / 50 份 lexicon / 659 接觸邊

| 假說 | 通過? | 統計量 | p 值 | 效應量 | 解讀 |
|------|:----:|-------:|-----:|-------:|------|
| **H1** 銀河核心語言複雜度 | ❌ | U=625.0 | 1.9e-10 | ρ=-0.423 | 聲調數量與 DM 的關係**方向相反**——這是因為映射規則本身決定了高 DM→多聲調，U 檢定顯示高 DM 組的聲調**確實更多**（p=4e-11），但 Spearman ρ(DM, 網絡度數)=-0.423 顯示**DM 越高反而接觸鄰居越少**（因為高 DM 星常位於銀河盤內較遠處），與「中心語言接觸更密集」的假說方向相反。H1 被 **部分證偽**。 |
| **H2** 聲象徵的宇宙版本 | ❌ | χ²=12.89 | 3e-4 | V=0.116 | 母音-語義場確實有顯著關聯（p<0.001），但**方向錯誤**：light 反而 fh/bl=0.34（低後母音更多），death bl/fh=1.74（確實低後多）。可能因為詞彙來自確定性合成規則，合成時沒有 sound symbolism bias，母音完全由 vowel_inventory 隨機取。換 LLM provider 產詞或許會改善。 |
| **H3** 借用不對稱性 | ✅ | W=1.08e7 | 4e-20 | priority ratio=1.01 | 低複雜度星的漂移量顯著高於高複雜度星（p<0.001，Wilcoxon signed-rank）。priority(time+death) 低/高比 = 1.01，幾乎沒有場別偏好，但**方向符合假說**：結構簡單的語言更容易被複雜語言影響。 |

> **重要觀察**：H1/H2 顯示「p 值 < 0.05 不等於假說成立」——效應方向同樣關鍵。本專案的 hypothesis_tester 已把 passed 定義為「顯著且方向一致」，所以 H1/H2 雖然統計顯著但仍判定未通過，是一個**可審查、可反駁的誠實設計**。

音系類型分布（`STELLOGLOSSA_Report.md`）：

- **音節結構**：CCVC=20, CCCVCC=16, CV=13, CVC=1（CVC 極少，因為週期 0.01~0.1s 的脈衝星在採樣中不多）
- **聲調**：0=13, 2=12, 4=15, 6=10（分布均勻）
- **時態**：compound=20, past-present-future=14, none=13, past-nonpast=3
- **母音系統**：10=20, 3=13, 7=13, 5=4

**最複雜的語言**：J1550-5317 / J1609-5158 / J1819-1408（complexity_score=360）
**最簡單的語言**：J0125-2327 / J0437-4715 / J1012+5307（complexity_score=6）
**網絡中心**：J1755-2725 (degree=39), J1822+0705 (37), J1101-6424 (36)
**孤島**：J0134-2937, J0514-4002A, J0137+6349, J1018-1642, J1019-5749

---

## 10. 目前進度、限制與 Known Issues

### 10.1 已完成 ✅

- [x] ATNF 即時查詢 + 離線 seed 雙路
- [x] 分層抽樣的 50 顆代表集
- [x] 音系引擎（4 參數 → 音節/聲調/時態/母音），加掛子音庫兩軸規則
- [x] 確定性文法生成器（9 維，jname-seeded）
- [x] 詞彙生成三 provider（Anthropic/OpenAI/Gemini）+ 合成 fallback + 音系驗證
- [x] 接觸網絡 + 4 regime + GraphML 匯出
- [x] Voyage embedding + SHA-256 fallback
- [x] 5 步 label-propagation 漂移模擬
- [x] H1/H2/H3 統計檢定（含方向一致性判定）
- [x] 家譜樹（Ward linkage + Newick）
- [x] 自動報告生成
- [x] 每星一信 / 每星一詩 / 中→X 翻譯器
- [x] Three.js 3D 星圖 + 飛行模式
- [x] D3 家譜樹 + 儀表板
- [x] Arrival 風格 logogram
- [x] Web Audio formant 發音（現為 fallback）
- [x] **MBROLA + ffmpeg 物理驅動語音合成**（v2.1，12,000 詞 100% 成功）
- [x] **前端 ▶ 播放整合**：app.js `speak()` 優先吃 audio_manifest 的 .wav，失敗退回 formant
- [x] **serve.py no-cache headers**：避免瀏覽器 cache ES module 造成改動不生效
- [x] **融合式肖像 Portrait**（v2.2，logogram ⊗ avatar，detail 頁動、map popup 靜、PNG 可匯出）
- [x] **detail-select dropdown 修復**：修正 `!sel.options.length - 1` 運算子優先序 bug，「語言檔案」tab 選單現在會列出 50 顆脈衝星
- [x] Interstellar / Kamakura 雙氛圍音樂
- [x] 11 個互動功能（搜尋/quiz/custom/earth-compare/translate…）
- [x] `/translate` REST 端點
- [x] 單元測試（4 檔：phonology / contact / letter_composer / llm_provider）

### 10.2 已知限制 / 待改進 ⚠️

1. **合成詞彙缺乏語義層次**：`_synthetic_lexicon()` 以 SHA-256 抽 consonant+vowel，同一星的 200 詞彼此「看起來像同一種語言」但**沒有真正的構詞邏輯**（沒有詞根衍生、沒有同場內的音位相似度）。H2 聲象徵之所以方向錯誤，八成就是這個原因。
   **解決方向**：實際跑一次 LLM provider 生成真正的詞彙；或在合成層加入「同場詞共享 1-2 個音位」的 constraint。

2. **H1 方向錯誤的詮釋**：銀河盤內 DM 高的脈衝星在笛卡爾座標上距離彼此也遠（因為都集中在盤面但離我們遠），導致 `exp(-d/1kpc)` 權重幾乎為 0。可以考慮：
   - 把 λ 從 1 kpc 改成 5 kpc（接觸半徑放大）
   - 或改用 2D 天球角距 + DM 作為代理距離

3. **音節驗證正則不支援聲調 diacritics**：`phonology_validator.py` 用 `re.sub("[̀-ͯ˦˥˧˨˩ˈˌ.ː-]", "", word)` 把聲調去掉再驗音段，**但聲調本身沒驗**。LLM 可能回傳「規則 4 聲調但實際只標 2 個」。

4. **音訊 voice pool 只剩 2 個**：v2.1 實測後發現英文 MBROLA voices（us1/us2/us3/en1）diphone 缺口太多，只能用 fr4 + de6。50 顆星仍能靠物理驅動的 pitch/speed/reverb 變化做出差異，但若要 4 種以上聲線差異需要額外 voice（建議 de4/de7、it3、pt1 等）。

5. **翻譯器只做 POS 層級重排**：沒有處理代詞、sentential modality、focus。複雜中文句子譯出後會相當生硬。

6. **bundle.json 體積**：全部打包後約 **~15 MB**（包含 12,000 條 audio_manifest）；前端首屏載入有感。未來可按需分片（Map 只載摘要，詳細頁再 fetch），或把 manifest 查找改成 HEAD fetch `/audio/...wav` 動態驗證存在與否。

7. **音訊 361 MB 的部署體積**：12,000 個 .wav 若要上線展示需處理 CDN 或 on-the-fly 合成；目前只適合單機或區網展示。可考慮加一個 `--audio-format=mp3` 用 ffmpeg 轉 128kbps 把總體積縮到 ~80 MB。

8. **測試覆蓋率仍 ~20%**：`tests/` 覆蓋 phonology/contact/letter_composer/llm_provider，drift_simulator / hypothesis_tester / sampa_mapper / audio_renderer 尚無測試。

### 10.3 潛在挑戰與因應

| 挑戰 | 風險 | 因應 |
|------|------|------|
| ATNF 資料不完整 | 中 | 中位數填補 + data_quality.log |
| LLM 詞彙不符音系 | 高 | 驗證層 + 重試 3 次 + 合成 fallback（**已實作**） |
| 星際距離誤差 20-50% | 低 | 記錄 NE2001/YMW16 兩值，權重取平均；有視差測量者優先 |
| 語義向量缺人類錨點 | 中 | Voyage 已內建人類語義空間；可加英語錨點投影比較 |
| 視覺化效能 | 中 | 3D LOD + Web Workers（待實作） |
| API 成本 | 中 | 本地 lexicon 快取（**已實作**） |

---

## 11. 下一階段規劃

### Phase A（短期，1-2 週）

1. **實跑一次 LLM 詞彙生成**（不用合成）。目標：檢驗 H2 的方向錯誤是否是合成層帶來的 artifact。
2. **接觸半徑 λ sweep**：從 1 kpc 跑到 10 kpc，找出 H1 方向翻轉的臨界值，寫進 report。
3. **聲調驗證**：在 `phonology_validator` 加聲調數量檢查。
4. **family_tree 視覺加強**：加入「點擊內部節點 → 看該分支共同特徵」的互動。
5. **測試補齊**：drift_simulator / hypothesis_tester / translator / sampa_mapper / audio_renderer 的單元測試。
6. **擴增 voice pool**：加入 it3、pt1、ro1 等 MBROLA voice 提高聲線多樣性；per-star SAMPA 覆蓋測試工具化。

### Phase B（中期，1 月）

7. **大樣本擴張**：從 50 顆 → 200 顆，重跑 H1/H2/H3，讓統計功效更強。
8. **Bundle 分片**：依 view 按需載入，或把 audio_manifest 改為 HEAD 驗證以縮減 bundle 體積。
9. **詩歌 + 信件 LLM 迭代**：跑 LLM 版，並在前端加「模板 vs LLM」切換比較。
10. **聲音裝置原型**：把脈衝星真實信號驅動語言朗誦（配合 Web Audio 的 PeriodicWave）。
11. **整首詩 / 整封信的連續語音**：目前每個詞是獨立 .wav；連起來讀整首詩時有頓挫。可改為一次 mbrola 一段文本，或前端用 Web Audio 做 crossfade。

### Phase C（長期，3-6 月）

10. **FRB（快速射電暴）模組**：一次性信號 → 「已滅絕語言」或「語言孤島」。
11. **時間演化**：以 Ṗ 推進 100 萬年、1 億年後的語言樣貌。
12. **麥哲倫雲**：加入 SMC/LMC 的脈衝星，模擬跨星系語言接觸。
13. **論文投稿**：《Digital Humanities Quarterly》或《Language Documentation & Conservation》。

---

## 12. 延伸方向

### 12.1 學術潛力
- *Digital Humanities Quarterly*（跨領域計算人文）
- *Language Documentation & Conservation*
- *Planetarium* 類科普刊物

### 12.2 藝術裝置潛力
- **聲音裝置**：在天文台／博物館，以真實脈衝星信號驅動語言朗誦
- **詩集出版**：選 12 個黃道星座各一首詩，配星圖排版
- **互動展演**：觀眾輸入自己的生日時間，映射到一顆脈衝星，聽它「說出的語言」

### 12.3 教學應用
- 大學「計算語言學」、「語言類型學」、「資料藝術」課程的教材範例
- 科普活動：高中生可以用 `Custom pulsar` slider 理解「語言的物理基礎」

---

## 附錄：關鍵檔案索引

```
STELLOGLOSSA/
├── STELLOGLOSSA_專案規劃書.md        ← 本文件 (v2.1)
└── stelloglossa/
    ├── README.md                     — 快速上手
    ├── config.py                     — 全域設定、映射閾值、語義場清單、AUDIO_CONFIG
    ├── pipeline.py                   — 主入口（10+ stage）
    ├── requirements.txt
    ├── .env.example
    │
    ├── src/core/                     ← 純計算、無 API 依賴
    │   ├── pulsar_extractor.py       — ATNF 抓取 + 分層抽樣
    │   ├── constellation_mapper.py   — astropy 座標轉換 + IAU 星座
    │   ├── phonology_engine.py       — 物理→音系 映射
    │   ├── grammar.py                — jname-seeded 文法
    │   ├── phonology_validator.py    — 音節 regex 驗證
    │   ├── contact_model.py          — 接觸網絡 + 4 regime
    │   ├── drift_simulator.py        — label-propagation 漂移
    │   ├── sampa_mapper.py           — IPA→SAMPA per-voice + pick_voice （v2.1 新）
    │   └── audio_renderer.py         — MBROLA + ffmpeg 合成（v2.1 重寫）
    │
    ├── src/api/                      ← 外部 API wrappers
    │   ├── llm_provider.py           — Anthropic/OpenAI/Gemini 抽象
    │   ├── lexicon_generator.py      — 詞彙生成 + 合成 fallback
    │   ├── lexicon_glosses.py        — 200 詞中文主檔
    │   ├── semantic_embedder.py      — Voyage voyage-3
    │   ├── letter_composer.py        — 每星一信
    │   ├── letter_content.py         — 信件模板池
    │   ├── poem_composer.py          — 每星一詩
    │   └── translator.py             — 中→X 翻譯
    │
    ├── src/analysis/                 ← 統計與報告
    │   ├── hypothesis_tester.py      — H1/H2/H3
    │   ├── family_tree.py            — Ward linkage → D3+Newick
    │   ├── drift_export.py           — 60MB → 57KB 摘要
    │   └── report_writer.py          — Report.md 自動生成
    │
    ├── src/viz/                      ← 前端
    │   ├── serve.py                  — HTTP 8765 + /translate REST + no-cache headers
    │   ├── bundle_data.py            — 打包 bundle.json
    │   └── public/
    │       ├── index.html            — 入口（含 inline SVG favicon）
    │       ├── app.js                — Three.js 3D 星圖 + speak() 吃 MBROLA .wav
    │       ├── pulsar_detail.js      — 詳細頁（§1–§9）+ idx-aware play buttons
    │       ├── features.js           — 11 個互動
    │       ├── portrait.js           — 融合肖像 (v2.2 新)
    │       ├── logogram.js           — 純墨環 logogram（§3 教學用）
    │       ├── speech.js             — Web Audio formant（v2.1 退為 fallback）
    │       ├── ambient.js            — 兩套氛圍音樂
    │       ├── tree_view.js          — D3 家譜樹
    │       ├── results_view.js       — 假說儀表板
    │       ├── about_view.js         — 專案說明
    │       └── intro.js              — 進場動畫
    │
    ├── data/
    │   ├── raw/
    │   │   ├── atnf_cache.json       — ATNF 2000+ 顆快取
    │   │   └── seed_pulsars.json     — 49 顆離線備援
    │   └── processed/
    │       ├── pulsars.json          — 50 顆抽樣結果
    │       ├── phonology_profiles/*.json  (50 檔)
    │       └── lexicons/*.json       (50 檔)
    │
    ├── output/
    │   ├── contact_graph.graphml / .json
    │   ├── embeddings.npz            (9.5 MB)
    │   ├── drift_snapshots.npy       (60 MB)
    │   ├── drift_asymmetry.json
    │   ├── drift_summary.json
    │   ├── hypothesis_results.json
    │   ├── language_tree.json / .nwk
    │   ├── audio_manifest.json       (~3 MB, 12,000 條)
    │   ├── STELLOGLOSSA_Report.md    — 自動總結
    │   ├── letters/*.json            (50 檔)
    │   ├── poems/*.json              (50 檔)
    │   └── audio/{jname}/                     — 12,000 個 .wav，361 MB
    │       ├── {field}_{idx}.wav     (~30 KB each, 22 kHz mono PCM16)
    │       └── voice.txt             — 該星所用 voice + 映射參數
    │
    └── tests/
        ├── test_phonology.py
        ├── test_contact_model.py
        ├── test_letter_composer.py
        └── test_llm_provider.py

# 使用者 home dir 的音訊工具（由 config.py 絕對路徑指向）
~/tools/
├── mbrola/
│   ├── mbrola.exe           — MBROLA 3.3 Windows binary
│   ├── mbrola.dll
│   └── voices/
│       ├── fr4/fr4          — 法女聲（實際 primary voice）
│       ├── de6/de6          — 德男聲（實際 fallback）
│       └── {us1,us2,us3,en1}/...   — 已下載但未使用
└── ffmpeg/bin/
    └── ffmpeg.exe           — BtbN master build
```

### 關鍵物理參數快速參考

| 符號 | 全名 | 典型範圍 | 本專案用途 |
|------|------|----------|------------|
| P | 自轉週期（秒） | 0.001 – 10 s | 音節結構複雜度 |
| DM | 色散量（pc/cm³） | 1 – 1000 | 聲調系統複雜度 |
| Ṗ | 自轉減慢率（無因次） | 10⁻²¹ – 10⁻¹³ | 時態豐富度 |
| W50 | 半高寬脈衝寬度（ms） | 0.1 – 100 ms | 母音系統豐富度 |
| DIST | 距離（kpc） | 0.1 – 30 kpc | 語言接觸權重 |

### 語義場清單（12 個）

```
celestial 天體   time 時間     death 死亡     light 光
return 回歸      distance 距離  density 密度   direction 方向
contact 接觸     myth 神話     pronoun 代詞   function 虛詞
```

---

*STELLOGLOSSA 專案規劃書 v2.2*
*撰寫日期：2026-04-21*
*v2.2 變更摘要：**新增融合式肖像視覺層**。新檔 `src/viz/public/portrait.js` 把 logogram 墨環與 avatar 物理肖像合而為一——墨環即光球邊界、tones 突起即磁極、jets 沿 bulge[0] 軸射出（固定不隨 spin，形成 lighthouse 觀感）、DM 驅動 HSL hue、距離驅動背景光暈 alpha、period 驅動整個 spin group 旋轉速度、syllable 結構疊加高頻 tremor + 低頻 body 變形成唯一墨環邊界。Detail 頁 320 px 動態 + map popup 180 px 靜態；PNG 匯出（自動剝除 SMIL）。§3「圓環符號解剖」教學區保留純 logogram.js，避免物理質感干擾語言參數對應。同時修正「語言檔案」tab 下拉選單的運算子優先序 bug。舊檔 avatar.js 已刪除。*
*v2.1 變更摘要：**音訊層從「未渲染」升級為可用產品**。捨棄 v2.0 的 eSpeak NG 方案（需 admin 安裝），改走 **MBROLA 3.3 + ffmpeg** 純 user-dir 安裝路線。新增 `src/core/sampa_mapper.py` 負責 IPA→SAMPA per-voice mapping 與 deterministic voice 選擇；重寫 `src/core/audio_renderer.py` 含物理驅動的 `speech_params_for()` / `reverb_params_for()` / `build_pho()` 三層；前端 `app.js:speak()` 改為先查 audio_manifest 再走 `/audio/*.wav`，失敗 fallback 到 speech.js formant；`serve.py` 加 `Cache-Control: no-cache` 解 ES module 更新不生效問題。實測 12,000 / 12,000 詞 100% 成功，總合成時間 ~8 分鐘，產生 361 MB .wav 檔。*
*v2.0 變更摘要：從「僅規劃」升級為「規劃+實作進度雙層文件」；補齊所有已落地模組的細節、實測資料規模、H1/H2/H3 真實統計結果、已知限制與下一階段規劃；新增前端 11 互動、Web Audio formant、Arrival logogram、敘事層（letter/poem/translator）、文法生成器、子音庫兩軸規則、分層抽樣策略等章節。*
*授權：MIT License（程式碼）/ CC BY 4.0（文件與語言資料）*
