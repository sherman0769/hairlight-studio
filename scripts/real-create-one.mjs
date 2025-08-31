#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath, pathToFileURL } from "node:url";

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (!v || v.startsWith("--")) ? def : v;
}
function usage(code = 1) {
  console.log("Usage: node scripts/real-create-one.mjs --user <path> --style <path> [--candidates 1..3] [--max-size 512..2048] [--outdir dir]");
  process.exit(code);
}
function mimeOf(p) {
  const ext = path.extname(String(p)).toLowerCase();
  return ext === ".png" ? "image/png" : "image/jpeg";
}
function toAbs(p) { return path.resolve(String(p)); }

const userPath = arg("--user");
const stylePath = arg("--style");
if (!userPath || !stylePath) usage(1);
const candidates = Math.max(1, Math.min(parseInt(arg("--candidates","1"),10)||1, 3));
const maxSize = Math.max(512, Math.min(parseInt(arg("--max-size","1024"),10)||1024, 2048));
const outRoot = arg("--outdir", "storage/results");

if (!process.env.GEMINI_API_KEY) {
  console.error("[error] GEMINI_API_KEY missing in .env");
  process.exit(2);
}
const modelId = "gemini-2.5-flash-image-preview";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 準備 job 與輸出資料夾
const jobId = `mvp_real_${Date.now()}`;
const outDir = path.join(outRoot, jobId);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync("storage/jobs", { recursive: true });

const userB64  = fs.readFileSync(toAbs(userPath)).toString("base64");
const styleB64 = fs.readFileSync(toAbs(stylePath)).toString("base64");

const sysPrompt = (size) => 
`你會看到兩張影像：
(1) 第一張是顧客人像照片（保持臉部五官、臉型與膚色完全一致，不得更動身份特徵）。
(2) 第二張是髮型參考。

請將第一張的整體髮型完整替換為第二張的髮型樣式，嚴格遵循長度、層次、輪廓、分線與髮色；
髮際線與耳際需自然融合，避免僅修改瀏海或局部；保持原照光影方向與膚色一致。
輸出邊長約 ${size}px，僅輸出編輯後的人像照片。`;

const t0 = Date.now();
const results = [];
for (let i = 1; i <= candidates; i++) {
  const res = await ai.models.generateContent({
    model: modelId,
    contents: [
      { text: sysPrompt(maxSize) },
      { inlineData: { mimeType: mimeOf(userPath),  data: userB64  } },
      { inlineData: { mimeType: mimeOf(stylePath), data: styleB64 } }
    ]
  });

  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  // 取第一個影像 part 存檔（若模型回多張，這裡可擴充）
  const imgPart = parts.find(p => p?.inlineData?.data);
  if (imgPart?.inlineData?.data) {
    const buf = Buffer.from(imgPart.inlineData.data, "base64");
    const file = path.join(outDir, `cand_${i}.jpg`);
    fs.writeFileSync(file, buf);
    results.push({ url: pathToFileURL(path.resolve(file)).href });
  }
}

const latency = Date.now() - t0;
const meta = {
  latency_ms: latency,
  cost_estimate_usd: Number((0.039 * results.length).toFixed(3)),
  model: modelId,
  region: process.env.REGION || "asia-east1"
};

const jobRecord = results.length
  ? { status: "succeeded", results, meta }
  : { status: "failed", error: { code: "MODEL_HARD_ERROR", message: "No image returned" }, meta };

fs.writeFileSync(path.join("storage/jobs", `${jobId}.json`), JSON.stringify(jobRecord, null, 2));

// 回應與 mock 相容（前端可沿用）
console.log(JSON.stringify({ job_id: jobId, status: "queued", eta_ms: latency }, null, 2));
