#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GoogleGenAI } from "@google/genai";

function arg(f,d){const i=process.argv.indexOf(f);if(i===-1)return d;const v=process.argv[i+1];return(!v||v.startsWith("--"))?d:v;}
function mimeOf(p){return path.extname(String(p)).toLowerCase()===".png"?"image/png":"image/jpeg";}
function usage(){console.log("Usage: node scripts/gemini-one-mask.mjs --user <path> --style <path> --mask <path> [--out dir] [--max-size 1024] [--candidates 3]");process.exit(1);}

const userPath=arg("--user"), stylePath=arg("--style"), maskPath=arg("--mask");
const outDir=arg("--out","storage/results/real-mask");
const maxSize=Math.max(512,Math.min(parseInt(arg("--max-size","1024"),10)||1024,2048));
const candidates=Math.max(1,Math.min(parseInt(arg("--candidates","3"),10)||3,3));
if(!userPath||!stylePath||!maskPath) usage();
if(!process.env.GEMINI_API_KEY){console.error("[error] GEMINI_API_KEY missing");process.exit(2);}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const userB64  = fs.readFileSync(userPath).toString("base64");
const styleB64 = fs.readFileSync(stylePath).toString("base64");
const maskB64  = fs.readFileSync(maskPath).toString("base64");

const promptText = `
你會收到三張圖：
- image#1：顧客人像（臉部與膚色必須保持一致；身份不可改）
- image#2：髮型【樣板】，請嚴格遵循其長度、層次、輪廓、分線、髮色
- image#3：黑白遮罩；白色=允許編輯區域（髮區），黑色=不可改動

請在 image#3 的白色範圍內，將 image#1 的髮型完整替換為 image#2 的髮型；務必自然融合髮際線與耳際，保持原圖光影方向與臉部結構；其他黑色區域嚴禁變動。輸出僅為編輯後的人像照片（長邊約 ${maxSize}px）。`;

fs.mkdirSync(outDir,{recursive:true});

let saved=0;
for(let i=1;i<=candidates;i++){
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-image-preview",
    contents: [
      { text: promptText.trim() },
      { inlineData: { mimeType: mimeOf(userPath),  data: userB64  } }, // image#1
      { inlineData: { mimeType: mimeOf(stylePath), data: styleB64 } }, // image#2
      { inlineData: { mimeType: mimeOf(maskPath),  data: maskB64  } }  // image#3 = mask
    ],
    generationConfig: { responseMimeType: "image/jpeg", temperature: 0.1, topP: 0.4 }
  });

  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  const imgs  = parts.filter(p=>p?.inlineData?.data);
  if(imgs.length===0){ console.error("[warn] 本次未回影像"); continue; }
  for(const [k,p] of imgs.entries()){
    const buf = Buffer.from(p.inlineData.data,"base64");
    const file = path.join(outDir, `cand_${i}${imgs.length>1?`_${k+1}`:""}.jpg`);
    fs.writeFileSync(file, buf); saved++;
  }
}
console.log(JSON.stringify({ outDir, saved }, null, 2));
