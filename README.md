# IQC Wafer CP 審核系統

晶圓 CP 測試資料的來料品質管控（IQC）內部管理工具。支援資料上傳、電性參數審核、SPC/Cpk 分析、廠商評分與 AI 異常偵測，提供繁體中文、簡體中文及英文三語介面。

---

## 技術架構

| 層級 | 技術 |
|---|---|
| 前端 | React 19、TypeScript、Vite、Tailwind CSS v4 |
| 狀態 / 路由 | Zustand、React Router v7 |
| 圖表 | ECharts（echarts-for-react） |
| 多語系 | i18next、react-i18next |
| 後端 | FastAPI、Uvicorn |
| ORM / 資料庫遷移 | SQLAlchemy 2、Alembic |
| 資料庫 | MySQL 8 |
| 資料處理 | pandas、numpy、scipy |
| AI | OpenAI 相容 API（DeepSeek / OpenAI） |
| 身份驗證 | JWT（python-jose）、bcrypt |

---

## 功能模組

- **資料上傳** — 拖拽或批次上傳 `.xlsx`，依廠商格式模板自動解析並預覽後匯入
- **CP 審核** — 逐 Wafer 呈現 BIN1 良率、Q1/Q2 合規等級與 PASS/WARN/FAIL 狀態；詳細頁含 SPC 管制圖與 Cpk 圖
- **AI 摘要報告** — 自動生成逐 Wafer 審核摘要，依語言分別快取（繁中 / 簡中 / 英文）
- **規格比較** — 跨批次電性規格橫向比對，超限值以紅色標示
- **歷史查詢** — 可篩選批次記錄與良率走勢折線圖
- **數據分析** — SPC X-bar 管制圖、數值分布直方圖（含 Cpk）、Pearson 相關矩陣
- **AI 異常偵測** — 依語言分別快取異常分析結果；切換語言且無快取時自動重新偵測
- **廠商評分** — 月度廠商績效評分（良率 × 50% + Cpk × 30% + 無異常 × 20%），金銀銅排名
- **系統設定** — 廠商管理、格式模板、審核規則（Q1/Q2/Q3 上下限）、封裝測規管理
- **PDF 匯出** — 審核詳情、規格比較、歷史查詢均可匯出 PDF 報告
- **多語介面** — 繁體中文 / 简体中文 / English，執行時即時切換

---

## 專案結構

```
pj-chinese-iqc/
├── src/                        # 前端（React + TypeScript）
│   ├── pages/                  # 頁面元件
│   │   └── settings/           # 設定子頁面
│   ├── components/             # 共用 UI 元件
│   │   └── layout/             # App Shell、導覽列、頁頭
│   ├── services/               # API 呼叫函式
│   ├── config/                 # 路由設定、常數
│   ├── i18n/locales/           # 翻譯檔（en / zh-TW / zh-CN）
│   └── store/                  # Zustand 全域狀態
│
└── server/                     # 後端（FastAPI + Python）
    ├── app/
    │   ├── routers/            # API 路由處理器
    │   ├── models/             # SQLAlchemy ORM 模型
    │   └── config.py           # 環境設定（從 .env 載入）
    ├── alembic/
    │   └── versions/           # 資料庫遷移腳本
    ├── uploads/                # 上傳的 Excel 檔（已加入 .gitignore）
    ├── requirements.txt
    └── run.py
```

---

## 快速開始

### 環境需求

- Node.js 20+
- Python 3.11+
- MySQL 8

### 1. 安裝依賴

```bash
git clone <repo-url>
cd pj-chinese-iqc

# 前端
npm install

# 後端
cd server
pip install -r requirements.txt
```

### 2. 設定環境變數

在專案根目錄建立 `.env`：

```env
# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DB=db_pj_chinese_iqc
MYSQL_USER=root
MYSQL_PASSWORD=your_password

# AI（DeepSeek 或 OpenAI 相容 API）
DEEPSEEK_API_KEY=sk-...
OPENAI_KEY=sk-...          # 選填，直接使用 OpenAI 時填入

# 安全性
SECRET_KEY=請修改此金鑰於正式環境
```

### 3. 建立資料庫

```sql
CREATE DATABASE db_pj_chinese_iqc CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. 執行資料庫遷移

```bash
cd server
alembic upgrade head
```

### 5. 啟動開發伺服器

```bash
# 從專案根目錄執行，同時啟動 API 與前端
npm run dev
```

或分開執行：

```bash
npm run dev:api   # FastAPI on http://localhost:8000
npm run dev:web   # Vite on http://localhost:5173
```

---

## 資料庫遷移

遷移腳本位於 `server/alembic/versions/`，使用 Alembic 管理。

```bash
# 套用所有待執行的遷移
cd server && alembic upgrade head

# 建立新遷移腳本
cd server && alembic revision -m "描述變更內容"
```

---

## AI 設定說明

系統使用 OpenAI 相容 API 執行以下兩項功能：

- **審核摘要** — 逐 Wafer 電性參數分析（依批次 + Wafer + 語言分別快取）
- **異常偵測** — SPC 離群值與變異模式分析（依批次 + 語言分別快取）

在 `.env` 中填入 `DEEPSEEK_API_KEY` 或 `OPENAI_KEY`，後端依有效金鑰自動選擇供應商。

AI 結果依語言獨立快取，切換 UI 語言時若該語言無快取，會自動觸發重新分析。

---

## 指令總覽

| 指令 | 說明 |
|---|---|
| `npm run dev` | 同時啟動前端與後端 |
| `npm run dev:web` | 僅啟動前端（Vite） |
| `npm run dev:api` | 僅啟動後端（FastAPI） |
| `npm run build` | TypeScript 檢查 + Vite 生產環境打包 |
| `npm run lint` | ESLint 檢查 |
