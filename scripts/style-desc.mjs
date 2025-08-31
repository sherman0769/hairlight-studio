#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { GoogleGenAI } from "@google/genai";

function arg(f,d){const i=process.argv.indexOf(f);if(i===-1)return d;const v=process.argv[i+1];return(!v||v.startsWith("--"))?d:v;}
function mimeOf(p){return path.extname(String(p)).toLowerCase()===".png"?"image/png":"image/jpeg";}
function usage(){console.log("Usage: node scripts/style-desc.mjs --style <path> [--out jsonPath] [--debug]");process.exit(1);}

const stylePath = arg("--style"); const outPath = arg("--out",""); const debug = process.argv.includes("--debug");
if(!stylePath) usage();
if(!process.env.GEMINI_API_KEY){ console.error("[error] GEMINI_API_KEY missing"); process.exit(2);}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const styleB64 = fs.readFileSync(stylePath).toString("base64");

const prompt = `
請解析這張髮型參考圖，輸出 JSON（繁體中文），欄位固定：
{
  "length": "短/中短/中/中長/長/極長",
  "curl": "直/微捲/S捲/大捲/羊毛捲",
  "bangs": "無瀏海/齊瀏海/空氣瀏海/旁分瀏海/幕簾瀏海/八字瀏海",
  "parting": "中分/三七分/四六分/偏左/偏右",
  "color_family": "自然黑/冷棕/暖棕/奶茶棕/亞麻棕/金棕/紅棕",
  "color_hex": "#RRGGBB",
  "layers": "無層次/輕層次/層次明顯/狼尾層次",
  "volume": "偏薄/中等/偏厚"
}
規則：只看**頭髮**，忽略背景/皮膚/衣服。若髮色帶棕/金/紅，請勿輸出「自然黑」。只輸出 JSON。
`;

const res = await ai.models.generateContent({
  model: "gemini-1.5-pro",
  contents: [
    { text: prompt.trim() },
    { inlineData: { mimeType: mimeOf(stylePath), data: styleB64 } }
  ],
  generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
});

let rawText = res?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
if (debug) console.error("[debug raw]", rawText);

let raw = {};
try {
  raw = JSON.parse(rawText);
} catch {
  // 若模型外包了 ```json 區塊，清一次再 parse
  rawText = rawText.replace(/```json|```/g, "");
  try { raw = JSON.parse(rawText); } catch { raw = {}; }
}

const pick = (v,f)=> (typeof v==="string"&&v.trim().length)?v.trim():f;

// 支援多種鍵名（避免模型偶爾用 color/hair_color）
const colorFamily = raw.color_family || raw.color || raw.hair_color || "";
const colorHex    = raw.color_hex    || raw.hex   || raw.hair_hex   || "";

// 正規化輸出
const attrs = {
  length:  pick(raw.length,"中長"),
  curl:    pick(raw.curl,"微捲"),
  bangs:   pick(raw.bangs,"無瀏海"),
  parting: pick(raw.parting,"中分"),
  color_family: pick(colorFamily,"自然黑"),
  color_hex:    pick(colorHex,"#222222"),
  layers:  pick(raw.layers,"輕層次"),
  volume:  pick(raw.volume,"中等")
};

const styleDesc = [
  `${attrs.length}${attrs.curl==="直"?"":attrs.curl}`,
  attrs.parting, attrs.bangs, attrs.color_family,
  attrs.layers==="無層次"?null:attrs.layers,
  attrs.volume==="中等"?null:`髮量${attrs.volume}`
].filter(Boolean).join("、");

const fullPrompt = `請將顧客照片的整體髮型，完整替換為參考圖的樣式（${styleDesc}，指定髮色${attrs.color_family} ${attrs.color_hex}）。保持臉部與膚色一致，嚴格遵循長度、層次、輪廓、分線與髮色；髮際線與耳際自然融合，避免僅改瀏海或局部，輸出長邊約 1024px 的寫實照片。`;

const out = { attributes: attrs, style_desc: styleDesc, prompt: fullPrompt };
if (outPath) fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
