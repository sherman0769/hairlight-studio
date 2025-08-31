#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GoogleGenAI } from "@google/genai";
import { pathToFileURL } from "node:url";

function arg(f, d){ const i = process.argv.indexOf(f); if (i === -1) return d; const v = process.argv[i+1]; return (!v || v.startsWith("--")) ? d : v; }
function usage(){ console.log("Usage: node scripts/real-create.mjs --user <path> --style <path> [--candidates 1..3] [--max-size 512..2048] [--outdir dir] [--style-desc \"文字\"]"); process.exit(1); }
function mimeOf(p){ return path.extname(String(p)).toLowerCase()===".png" ? "image/png" : "image/jpeg"; }

const userPath = arg("--user");
const stylePath = arg("--style");
if(!userPath || !stylePath) usage();
const candidates = Math.max(1, Math.min(parseInt(arg("--candidates","3"),10)||3, 3));
const maxSize    = Math.max(512, Math.min(parseInt(arg("--max-size","1024"),10)||1024, 2048));
const outRoot    = arg("--outdir", "storage/results");
const styleDesc  = arg("--style-desc", "");

if(!process.env.GEMINI_API_KEY){ console.error("[error] GEMINI_API_KEY missing in .env"); process.exit(2); }

const modelId = "gemini-2.5-flash-image-preview";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const jobId = `mvp_real_${Date.now()}`;
const outDir = path.join(outRoot, jobId);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync("storage/jobs", { recursive: true });

const userB64  = fs.readFileSync(userPath).toString("base64");
const styleB64 = fs.readFileSync(stylePath).toString("base64");

const basePrompt = (size) => `
你會看到兩張圖：
(1) 顧客人像：臉部/膚色/身份不得改變。
(2) 髮型【樣板】：請嚴格遵循其長度、層次、輪廓、分線與髮色。
${styleDesc ? "額外髮型語意："+styleDesc : ""}

請把(1)的整體髮型完整替換成(2)的樣式；髮際線與耳際需自然融合，避免僅修改瀏海或局部；
保持原照光影方向與臉部結構一致。輸出僅為編輯後的人像照片，長邊約 ${size}px。`.trim();

const t0 = Date.now();
const results = [];

for (let i=1; i<=candidates; i++){
  const res = await ai.models.generateContent({
    model: modelId,
    contents: [
      { text: basePrompt(maxSize) },
      { inlineData: { mimeType: mimeOf(userPath),  data: userB64  } },
      { inlineData: { mimeType: mimeOf(stylePath), data: styleB64 } }
    ],
    generationConfig: { responseMimeType: "image/jpeg", temperature: 0.2, topP: 0.4 }
  });
  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find(p => p?.inlineData?.data);
  if (img?.inlineData?.data){
    const buf = Buffer.from(img.inlineData.data, "base64");
    const file = path.join(outDir, `cand_${i}.jpg`);
    fs.writeFileSync(file, buf);
    results.push({ url: pathToFileURL(path.resolve(file)).href });
  }
}

const latency = Date.now() - t0;
const record = results.length
  ? { status: "succeeded", results, meta: { latency_ms: latency, cost_estimate_usd: Number((0.039*results.length).toFixed(3)), model: modelId, region: process.env.REGION || "asia-east1" } }
  : { status: "failed",    error: { code: "MODEL_HARD_ERROR", message: "No image returned" }, meta: { latency_ms: latency, model: modelId, region: process.env.REGION || "asia-east1" } };

fs.writeFileSync(path.join("storage/jobs", `${jobId}.json`), JSON.stringify(record, null, 2));

console.log(JSON.stringify({ job_id: jobId, status: "queued", eta_ms: latency }, null, 2));
