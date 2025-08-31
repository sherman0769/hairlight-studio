#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GoogleGenAI } from "@google/genai";
import { pathToFileURL, fileURLToPath } from "node:url";

function arg(f,d){ const i=process.argv.indexOf(f); if(i===-1) return d; const v=process.argv[i+1]; return (!v||v.startsWith("--"))?d:v; }
function usage(){ console.log("Usage: node scripts/real-create-topup.mjs --user <path> --style <path> [--job <job_id>] [--style-desc \"文字\"] [--min-candidates 3] [--max-rounds 2] [--max-size 512..2048]"); process.exit(1); }
function mimeOf(p){ return path.extname(String(p)).toLowerCase()===".png" ? "image/png" : "image/jpeg"; }

const userPath = arg("--user");
const stylePath = arg("--style");
const existingJobId = arg("--job","");
const styleDesc = arg("--style-desc","");
const minCandidates = Math.max(1, Math.min(parseInt(arg("--min-candidates","3"),10)||3, 6));
const maxRounds = Math.max(1, Math.min(parseInt(arg("--max-rounds","2"),10)||2, 5));
const maxSize = Math.max(512, Math.min(parseInt(arg("--max-size","1024"),10)||1024, 2048));

if(!userPath || !stylePath){ usage(); }
if(!process.env.GEMINI_API_KEY){ console.error("[error] GEMINI_API_KEY missing in .env"); process.exit(2); }

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const modelId = "gemini-2.5-flash-image-preview";

const basePrompt = (size) => `
你會看到兩張圖：
(1) 顧客人像：臉部/膚色/身份不得改變。
(2) 髮型【樣板】：嚴格遵循其長度、層次、輪廓、分線與髮色。
${styleDesc ? "額外髮型語意："+styleDesc : ""}

請把(1)的整體髮型完整替換為(2)的樣式；髮際線與耳際需自然融合，避免僅修改瀏海或局部；保持原照光影方向與臉部結構一致。輸出僅為編輯後的人像照片，長邊約 ${size}px。`.trim();

const userB64  = fs.readFileSync(userPath).toString("base64");
const styleB64 = fs.readFileSync(stylePath).toString("base64");

let jobId = existingJobId;
let outDir = "";
let jobFile = "";

if (existingJobId) {
  jobId = existingJobId;
  jobFile = path.join("storage","jobs",`${jobId}.json`);
  if(!fs.existsSync(jobFile)){ console.error("[error] job not found:", jobFile); process.exit(3); }
  const job = JSON.parse(fs.readFileSync(jobFile,"utf8"));
  const firstUrl = job?.results?.[0]?.url;
  if(!firstUrl){ console.error("[error] job has no results to locate folder."); process.exit(4); }
  const firstPath = firstUrl.startsWith("file://") ? fileURLToPath(firstUrl) : firstUrl;
  outDir = path.dirname(firstPath);
} else {
  jobId = `mvp_real_${Date.now()}_topup`;
  outDir = path.join("storage","results", jobId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync("storage/jobs", { recursive: true });
  jobFile = path.join("storage","jobs",`${jobId}.json`);
  fs.writeFileSync(jobFile, JSON.stringify({ status:"processing", results:[], meta:{} }, null, 2));
}

const t0 = Date.now();

// 讀現有結果數
let job = JSON.parse(fs.readFileSync(jobFile,"utf8"));
let saved = (job.results||[]).length;

let roundsUsed = 0;
outer:
for (let round=1; round<=maxRounds; round++){
  roundsUsed = round;
  while (saved < minCandidates){
    const res = await ai.models.generateContent({
      model: modelId,
      contents: [
        { text: basePrompt(maxSize) },
        { inlineData: { mimeType: mimeOf(userPath),  data: userB64 } },
        { inlineData: { mimeType: mimeOf(stylePath), data: styleB64 } }
      ],
      generationConfig: { responseMimeType: "image/jpeg", temperature: 0.2, topP: 0.4 }
    });
    const parts = res?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find(p=>p?.inlineData?.data);
    if (!img?.inlineData?.data) break outer;
    const buf = Buffer.from(img.inlineData.data, "base64");
    const file = path.join(outDir, `cand_${saved+1}.jpg`);
    fs.writeFileSync(file, buf);

    const url = pathToFileURL(path.resolve(file)).href;
    job.results = job.results || [];
    job.results.push({ url });
    saved++;
    if (saved >= minCandidates) break;
  }
}

const latency = Date.now() - t0;
job.meta = job.meta || {};
job.meta.latency_ms = (job.meta.latency_ms||0) + latency;
job.meta.cost_estimate_usd = Number(((job.meta.cost_estimate_usd||0) + 0.039*(saved - ((job.results?.length||0) - saved))).toFixed(3));
job.meta.model = modelId;
job.meta.region = process.env.REGION || "asia-east1";
job.status = "succeeded";
fs.writeFileSync(jobFile, JSON.stringify(job, null, 2));

console.log(JSON.stringify({ job_id: jobId, status:"queued", rounds_used: roundsUsed, saved, eta_ms: latency }, null, 2));
