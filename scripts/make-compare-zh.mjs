#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

function arg(f,d){const i=process.argv.indexOf(f);if(i===-1)return d;const v=process.argv[i+1];return(!v||v.startsWith("--"))?d:v;}
function toLocal(p){ if(!p) return null; return p.startsWith("file://") ? fileURLToPath(p) : path.resolve(p); }
function usage(){ console.log("Usage: node scripts/make-compare-zh.mjs --user <path> --style <path> --job <job_id> [--out path] [--title \"標題\"] [--pick 1|2|3|auto] [--badge \"小徽章\"]"); process.exit(1); }

const userPath = arg("--user");
const stylePath = arg("--style");
const jobId = arg("--job");
const outPath = arg("--out", `storage/compare/${jobId||"compare"}.jpg`);
const titleIn = arg("--title", "髮型預覽對比（原照／參考／結果）");
const pickArg = arg("--pick","1");
const badge = arg("--badge","");
if(!userPath||!stylePath||!jobId) usage();

const jobJson = JSON.parse(fs.readFileSync(path.join("storage","jobs",`${jobId}.json`), "utf8"));
const results = jobJson?.results || [];
if(results.length === 0){ console.error("[error] 找不到結果圖"); process.exit(2); }

let pickIdx;
if (pickArg === "auto") {
  const auto = parseInt(jobJson?.meta?.autopick_index ?? "1", 10);
  pickIdx = isNaN(auto) ? 1 : Math.max(1, Math.min(auto, results.length));
} else {
  const n = parseInt(pickArg, 10);
  pickIdx = isNaN(n) ? 1 : Math.max(1, Math.min(n, results.length));
}
const resultPath = toLocal(results[pickIdx - 1].url);

// 版面
const pad = 36, gap = 36, headerH = 80, labelH = 28, targetH = 900;

// resize
const { data: userBuf,  info: userInfo  } = await sharp(userPath).resize({ height: targetH }).toBuffer({ resolveWithObject:true });
const { data: styleBuf, info: styleInfo } = await sharp(stylePath).resize({ height: targetH }).toBuffer({ resolveWithObject:true });
const { data: outBuf,   info: outInfo   } = await sharp(resultPath).resize({ height: targetH }).toBuffer({ resolveWithObject:true });

// 畫布
const canvasW = pad + userInfo.width + gap + styleInfo.width + gap + outInfo.width + pad;
const imgH = Math.max(userInfo.height, styleInfo.height, outInfo.height);
const canvasH = pad + headerH + imgH + labelH + pad;

const fullTitle = badge ? `${titleIn}｜${badge}` : titleIn;

// 中文 SVG
const svgText = (text, w, h, fontSize=32, align="left") => Buffer.from(
  `<svg width="${w}" height="${h}">
     <style>
       @font-face { font-family: sys;
         src: local('Microsoft JhengHei'), local('PingFang TC'),
              local('Noto Sans CJK TC'), local('Noto Sans TC'),
              local('Segoe UI'), local('Arial'); }
       .t { font-family: sys, sans-serif; font-size:${fontSize}px; fill:#111; dominant-baseline:middle; }
     </style>
     <text x="${align==='center'? '50%' : 0}" y="${h/2}" text-anchor="${align==='center'?'middle':'start'}" class="t">
       ${text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}
     </text>
   </svg>`
);

// 合成
const composites = [{ input: svgText(fullTitle, canvasW - pad*2, headerH, 36, "left"), top: pad, left: pad }];
let x = pad, y = pad + headerH;

composites.push({ input: userBuf,  top: y, left: x });
composites.push({ input: svgText("原照", userInfo.width, labelH, 20, "center"), top: y + imgH, left: x });
x += userInfo.width + gap;

composites.push({ input: styleBuf, top: y, left: x });
composites.push({ input: svgText("參考髮型", styleInfo.width, labelH, 20, "center"), top: y + imgH, left: x });
x += styleInfo.width + gap;

composites.push({ input: outBuf,   top: y, left: x });
composites.push({ input: svgText("結果", outInfo.width, labelH, 20, "center"), top: y + imgH, left: x });

// 浮水印（右下角）
const wm = await sharp("storage/brand/hairlight-icon.svg").resize(56).png().toBuffer();
composites.push({ input: wm, top: canvasH - 56 - 12, left: canvasW - 56 - 12, blend: "over" });

fs.mkdirSync(path.dirname(outPath), { recursive: true });
await sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: "#ffffff" } })
  .composite(composites)
  .jpeg({ quality: 92 })
  .toFile(outPath);

console.log(JSON.stringify({ out: outPath, pick: pickIdx, width: canvasW, height: canvasH }, null, 2));
