#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Jimp from "jimp";

function arg(f,d){ const i=process.argv.indexOf(f); if(i===-1) return d; const v=process.argv[i+1]; return (!v||v.startsWith("--"))?d:v; }
function usage(){ console.log("Usage: node scripts/make-compare.mjs --user <path> --style <path> --job <job_id> [--out path] [--title \"中長微捲…\"]"); process.exit(1); }
function toLocal(p){ if(!p) return null; return p.startsWith("file://") ? fileURLToPath(p) : path.resolve(p); }

const userPath = arg("--user");
const stylePath = arg("--style");
const jobId    = arg("--job");
const outPath  = arg("--out", `storage/compare/${jobId||"compare"}.jpg`);
const title    = arg("--title", "");

if(!userPath || !stylePath || !jobId) usage();

const jobJson = JSON.parse(fs.readFileSync(path.join("storage","jobs",`${jobId}.json`), "utf8"));
const resultUrl = jobJson?.results?.[0]?.url;
if(!resultUrl){ console.error("[error] 找不到結果圖 URL"); process.exit(2); }

const userImg  = await Jimp.read(toLocal(userPath));
const styleImg = await Jimp.read(toLocal(stylePath));
const outImg   = await Jimp.read(toLocal(resultUrl));

const pad = 24, header = 64;
const targetH = Math.min(768, userImg.bitmap.height, styleImg.bitmap.height, outImg.bitmap.height);
userImg.resize(Jimp.AUTO, targetH);
styleImg.resize(Jimp.AUTO, targetH);
outImg.resize(Jimp.AUTO, targetH);

const totalW = userImg.bitmap.width + styleImg.bitmap.width + outImg.bitmap.width + pad*4;
const totalH = targetH + header + pad*2;
const canvas = new Jimp(totalW, totalH, 0xffffffff);

const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
const fontLabel = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

// 背景與標題
canvas.print(fontTitle, pad, pad, title || "髮型預覽對比", totalW - pad*2);

// 放三張圖
let x = pad;
const y = header;
canvas.composite(userImg,  x, y);
x += userImg.bitmap.width + pad;
canvas.composite(styleImg, x, y);
x += styleImg.bitmap.width + pad;
canvas.composite(outImg,   x, y);

// 小標
const bottom = y + targetH - 28;
canvas.print(fontLabel, pad,                             bottom, "原照");
canvas.print(fontLabel, pad + userImg.bitmap.width + pad, bottom, "參考髮型");
canvas.print(fontLabel, totalW - pad - 80,               bottom, "結果");

// 確保輸出資料夾存在
fs.mkdirSync(path.dirname(outPath), { recursive: true });
await canvas.quality(90).writeAsync(outPath);
console.log(JSON.stringify({ out: outPath, width: totalW, height: totalH }, null, 2));
