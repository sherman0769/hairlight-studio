#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL, fileURLToPath } = require("url");

const args = process.argv.slice(2);
function getVal(flag, def) {
  const i = args.indexOf(flag);
  if (i === -1) return def;
  const nxt = args[i + 1];
  if (!nxt || nxt.startsWith("--")) return true;
  return nxt;
}
function usage(code = 1) {
  console.log("Usage: node scripts/mock-create.js --user <path|url> --style <path|url> [--candidates 1..3] [--max-size 512..2048] [--format jpeg|png] [--outdir dir]");
  process.exit(code);
}

// 參數（沿用 compose-create 的旗標）
const user = getVal("--user");
const style = getVal("--style");
if (!user || !style) usage(1);
const candidatesIn = parseInt(getVal("--candidates", "3"), 10);
const maxSizeIn = parseInt(getVal("--max-size", "1024"), 10);
let format = String(getVal("--format", "jpeg")).toLowerCase();
const outRoot = getVal("--outdir", "storage/results");

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
const candidates = clamp(Number.isNaN(candidatesIn) ? 3 : candidatesIn, 1, 3);
const maxSize = clamp(Number.isNaN(maxSizeIn) ? 1024 : maxSizeIn, 512, 2048);
if (!["jpeg","png"].includes(format)) format = "jpeg";

// 1) 先呼叫 compose-create，取得最終 create payload（含 file:// public_url）
const comp = execFileSync(process.execPath, ["scripts/compose-create.js",
  "--user", user, "--style", style, "--candidates", String(candidates),
  "--max-size", String(maxSize), "--format", format
], { encoding: "utf8" });

let req;
try { req = JSON.parse(comp); } catch (e) { console.error("[error] compose-create 輸出不是 JSON"); process.exit(1); }
const body = req.body || {};
const userURL = body.user_photo_url;
const styleURL = body.style_photo_url;

// 2) 建立 job_id 與輸出資料夾
const jobId = `mvp_${Date.now()}`;
const outDir = path.join(outRoot, jobId);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync("storage/jobs", { recursive: true });

// 3) 從 file:// 轉回本機路徑
function toLocal(p) {
  if (!p) return null;
  if (/^file:\/\//i.test(p)) return fileURLToPath(p);
  return p; // 已是本機路徑或 http(s)
}
const srcUser = toLocal(userURL);
const srcStyle = toLocal(styleURL);
const src = fs.existsSync(srcUser || "") ? srcUser : (fs.existsSync(srcStyle || "") ? srcStyle : null);

// 4) 產生候選檔（簡化：複製來源圖做佔位），並回填可公開 URL（file://）
const ext = format === "png" ? ".png" : ".jpg";
const results = [];
for (let i = 1; i <= candidates; i++) {
  const dst = path.join(outDir, `cand_${i}${ext}`);
  if (src) {
    fs.copyFileSync(src, dst);
  } else {
    fs.writeFileSync(dst, `mock image ${i}`, "utf8");
  }
  results.push({ url: pathToFileURL(path.resolve(dst)).href });
}

// 5) 寫入本地 job 狀態（直接標記為 succeeded；之後 result 腳本會讀它）
const latency = Math.floor(5000 + Math.random() * 5000); // 5~10 秒假延遲
const cost = Number((0.039 * candidates).toFixed(3));
const jobRecord = {
  status: "succeeded",
  results,
  meta: {
    latency_ms: latency,
    cost_estimate_usd: cost,
    model: "gemini-2.5-flash-image",
    region: process.env.REGION || "asia-east1"
  }
};
fs.writeFileSync(path.join("storage/jobs", `${jobId}.json`), JSON.stringify(jobRecord, null, 2));

// 6) 依照 create API 慣例回傳「已排隊」的回應
const resp = { job_id: jobId, status: "queued", eta_ms: latency };
console.log(JSON.stringify(resp, null, 2));
