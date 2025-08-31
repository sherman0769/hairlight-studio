#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GoogleGenAI } from "@google/genai";

function arg(f,d){const i=process.argv.indexOf(f);if(i===-1)return d;const v=process.argv[i+1];return(!v||v.startsWith("--"))?d:v;}

const prompt = arg("--prompt", "A studio photo of a red apple on a white table, soft shadows, 3/4 view, high detail.");
const outDir = arg("--out", "storage/results/t2i");
const maxSize = parseInt(arg("--max-size","1024"),10) || 1024;
const candidates = Math.max(1, Math.min(parseInt(arg("--candidates","1"),10)||1, 3));

if(!process.env.GEMINI_API_KEY){ console.error("[error] GEMINI_API_KEY missing in .env"); process.exit(2); }

const model = "gemini-2.5-flash-image-preview";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

fs.mkdirSync(outDir, { recursive: true });

let saved = 0;
for (let i = 1; i <= candidates; i++) {
  const res = await ai.models.generateContent({
    model,
    contents: [{ text: `${prompt}\nOutput image side ~${maxSize}px, photorealistic.` }],
    generationConfig: { responseMimeType: "image/jpeg", temperature: 0.2 }
  });
  const parts = res?.candidates?.[0]?.content?.parts ?? [];
  for (const [k,p] of parts.entries()) {
    if (p?.inlineData?.data) {
      const buf = Buffer.from(p.inlineData.data, "base64");
      const file = path.join(outDir, `cand_${i}${parts.length>1?`_${k+1}`:""}.jpg`);
      fs.writeFileSync(file, buf);
      saved++;
    }
  }
}

if (!saved) { console.error("[warn] No image returned (maybe safety blocked). Try a safer prompt."); process.exit(3); }
console.log(JSON.stringify({ outDir, saved, model }, null, 2));
