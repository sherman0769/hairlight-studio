#!/usr/bin/env node
import 'dotenv/config'
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GoogleGenAI } from "@google/genai";

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (!v || v.startsWith("--")) ? def : v;
}
function mimeOf(p) {
  const ext = path.extname(String(p)).toLowerCase();
  return ext === ".png" ? "image/png" : "image/jpeg";
}
function usage() {
  console.log("Usage: node scripts/gemini-one.mjs --user <path> --style <path> [--out dir] [--max-size 1024]");
  process.exit(1);
}

const userPath = arg("--user");
const stylePath = arg("--style");
const outDir = arg("--out", "storage/results/real-one");
const maxSize = parseInt(arg("--max-size", "1024"), 10) || 1024;
if (!userPath || !stylePath) usage();

if (!process.env.GEMINI_API_KEY) {
  console.error("[error] GEMINI_API_KEY missing in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const userB64  = fs.readFileSync(userPath).toString("base64");
const styleB64 = fs.readFileSync(stylePath).toString("base64");

const prompt = [
  { text:
`你會看到兩張影像：
(1) 第一張是顧客的人像照片（保持臉部五官、臉型與膚色完全一致，不得改動身份特徵）。
(2) 第二張是髮型參考範例。

請「將第一張的整體髮型」完整替換為「第二張的髮型樣式」，嚴格遵循長度、層次、輪廓、分線與髮色；髮際線與耳際需自然融合，避免僅修改瀏海或局部。保持原照片的光影方向與膚色一致，只輸出編輯後的人像照片（不添加文字或邊框）。輸出邊長約 ${maxSize}px。`
  },
  { inlineData: { mimeType: mimeOf(userPath),  data: userB64  } },
  { inlineData: { mimeType: mimeOf(stylePath), data: styleB64 } }
];

const res = await ai.models.generateContent({
  model: "gemini-2.5-flash-image-preview",
  contents: prompt
});

fs.mkdirSync(outDir, { recursive: true });
let saved = 0;
const parts = res?.candidates?.[0]?.content?.parts ?? [];
for (const part of parts) {
  if (part?.inlineData?.data) {
    saved++;
    const buf = Buffer.from(part.inlineData.data, "base64");
    const file = path.join(outDir, `cand_${saved}.jpg`);
    fs.writeFileSync(file, buf);
  }
}
if (!saved) {
  console.error("[warn] 沒有收到影像輸出（可能被安全政策或流量限制擋下）。");
  process.exit(2);
}
console.log(JSON.stringify({ outDir, saved, model: "gemini-2.5-flash-image-preview" }, null, 2));
