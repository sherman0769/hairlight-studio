#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import { pathToFileURL } from "node:url";

function arg(f,d){ const i=process.argv.indexOf(f); if(i===-1) return d; const v=process.argv[i+1]; return (!v||v.startsWith("--"))?d:v; }
function usage(){ console.log("Usage: node scripts/real-create-color.mjs --user <path> --style <path> --color-hex #RRGGBB [--candidates 1..3] [--max-size 512..2048]"); process.exit(1); }
function mimeOf(p){ return path.extname(String(p)).toLowerCase()===".png" ? "image/png" : "image/jpeg"; }

const userPath = arg("--user"), stylePath = arg("--style"), colorHex = (arg("--color-hex","")||"").toLowerCase();
if(!userPath || !stylePath || !/^#?[0-9a-f]{6}$/.test(colorHex)) usage();
const hex = colorHex.startsWith("#") ? colorHex : ("#"+colorHex);
const candidates = Math.max(1, Math.min(parseInt(arg("--candidates","3"),10)||3, 3));
const maxSize    = Math.max(512, Math.min(parseInt(arg("--max-size","1024"),10)||1024, 2048));
const outRoot    = "storage/results";

if(!process.env.GEMINI_API_KEY){ console.error("[error] GEMINI_API_KEY missing"); process.exit(2); }
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const modelId = "gemini-2.5-flash-image-preview";

const jobId = `mvp_real_${Date.now()}_color`;
const outDir = path.join(outRoot, jobId);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync("storage/jobs", { recursive: true });

// 準備三張輸入：顧客、參考、色票
const userB64  = fs.readFileSync(userPath).toString("base64");
const styleB64 = fs.readFileSync(stylePath).toString("base64");
const chipBuf  = await sharp({ create: { width: 128, height: 128, channels: 3, background: hex } }).png().toBuffer();
const chipB64  = chipBuf.toString("base64");

const sysPrompt = (size) => `
你會收到三張影像：
(1) 顧客人像：臉部/膚色/身份不得改變。
(2) 髮型【樣板】：請遵循其長度、層次、輪廓、分線。
(3) 髮色色票：請務必將髮色調整為與此色票一致（色相/明度接近），**禁止保留或回退到原髮色**。

請把(1)的整體髮型完整替換為(2)的樣式，並依照(3)套用髮色；髮際線與耳際需自然融合，避免僅修改瀏海或局部；保持原照光影方向。輸出僅為編輯後的人像照片，長邊約 ${size}px。`;

const t0 = Date.now();
const results = [];
for (let i=1; i<=candidates; i++){
  const res = await ai.models.generateContent({
    model: modelId,
    contents: [
      { text: sysPrompt(maxSize) },
      { inlineData: { mimeType: mimeOf(userPath),  data: userB64  } }, // 顧客
      { inlineData: { mimeType: mimeOf(stylePath), data: styleB64 } }, // 參考
      { inlineData: { mimeType: "image/png",       data: chipB64  } }  // 色票
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
console.log(JSON.stringify({ job_id: jobId, status: "queued", eta_ms: latency, color_hex: hex }, null, 2));
