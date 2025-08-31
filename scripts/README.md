# Hair Try-On MVP — CLI 規格（草案）

> 本階段僅定義規格，不含任何執行程式碼。

## 指令
### 1) mvp:create
- 必填：
  - `--user <path|url>`：顧客原照
  - `--style <path|url>`：髮型參考
- 可選：
  - `--candidates <1..3>`（預設 3）
  - `--format <jpeg|png>`（預設 jpeg）
  - `--max-size <512..2048>`（預設 1024）
  - `--outdir <dir>`（預設 storage/results）
  - `--async`（預設 true）或 `--sync`
  - `--dry-run`（不呼叫模型、僅列印 payload）
  - `--local`（預設 true；未來可改走簽名上傳）
- 期望回傳（非同步）：
```json
{ "job_id": "mvp_2025_0001", "status": "queued", "eta_ms": 8000 }
2) mvp:result

必填：--job <id>

可選：--json（預設 true）、--watch <sec>（輪詢秒數，0 表示不輪詢）

期望成功回傳：
{
  "status": "succeeded",
  "results": [{ "url": "https://.../cand_1.jpg" }],
  "meta": { "latency_ms": 7340, "cost_estimate_usd": 0.117, "model": "gemini-2.5-flash-image", "region": "asia-east1" }
}
契約對應

/v1/uploads/sign → api/contracts/uploads.sign.schema.json

/v1/hair-preview/create → api/contracts/hair-preview.create.schema.json

/v1/hair-preview/result → api/contracts/hair-preview.result.schema.json

環境變數

.env 內需有 GEMINI_API_KEY

REGION 預設 asia-east1
