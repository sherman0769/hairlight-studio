#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GoogleGenAI } from "@google/genai";

function arg(f, d){const i=process.argv.indexOf(f);if(i===-1)return d;const v=process.argv[i+1];return(!v||v.startsWith("--"))?d:v;}
function mimeOf(p){return path.extname(String(p)).toLowerCase()===".png"?"image/png":"image/jpeg";}
function usage(){console.log("Usage: node scripts/gemini-one-strong.mjs --user <path> --style <path> [--out dir] [--max-size 1024] [--candidates 3]");process.exit(1);}

const userPath=arg("--user"), stylePath=arg("--style");
const outDir=arg("--out","storage/results/real-strong");
const maxSize=parseInt(arg("--max-size","1024"),10)||1024;
const candidates=Math.max(1,Math.min(parseInt(arg("--candidates","3"),10)||3,3));
if(!userPath||!stylePath) usage();
if(!process.env.GEMINI_API_KEY){console.error("[error] GEMINI_API_KEY missing in .env");process.exit(2);}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const userB64 = fs.readFileSync(userPath).toString("base64");
const styleB64 = fs.readFileSync(stylePath).toString("base64");

const promptText = `
你現在執行「髮型替換」任務。輸入有兩張圖：
- image#1：顧客人像（保持臉部五官、臉型、膚色與身份100%一致）
- image#2：髮型【樣板】（作為唯一準則）

務必遵守（違反視為失敗）：
1) 100% 替換 image#1 的整體頭髮；**完全忽略原本髮型**。
2) 嚴格遵循 image#2 的「長度、層次、輪廓、分線、髮色與髮量」。
3) 髮際線與耳際需自然融合；**不得只改瀏海或局部**，不得新增帽子/飾品/文字。
4) 保持原照光影方向、膚色與臉部結構一致。
5) 只輸出編輯後的人像照片；長邊約 ${maxSize}px。`;

fs.mkdirSync(outDir,{recursive:true});

let saved=0;
for(let i=1;i<=candidates;i++){
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-image-preview",
    contents: [
      { text: promptText.trim() },
      { inlineData: { mimeType: mimeOf(userPath), data: userB64 } },
      { inlineData: { mimeType: mimeOf(stylePath), data: styleB64 } }
    ],
    generationConfig: { responseMimeType: "image/jpeg", temperature: 0.2 }
  });

  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  const imgParts = parts.filter(p => p?.inlineData?.data);
  if(imgParts.length===0){
    console.error("[warn] 本次未回影像，可能被安全門檻或模型判定忽略。");
    continue;
  }
  for(const [k,p] of imgParts.entries()){
    const buf = Buffer.from(p.inlineData.data,"base64");
    const file = path.join(outDir, `cand_${i}${imgParts.length>1?`_${k+1}`:""}.jpg`);
    fs.writeFileSync(file, buf); saved++;
  }
}
console.log(JSON.stringify({ outDir, saved }, null, 2));
