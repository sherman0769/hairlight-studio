#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

function arg(f,d){ const i=process.argv.indexOf(f); if(i===-1) return d; const v=process.argv[i+1]; return (!v||v.startsWith("--"))?d:v; }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
function hex2rgb(hex){ const h=hex.replace("#","").toLowerCase(); const n=parseInt(h,16); return { r:(n>>16)&255, g:(n>>8)&255, b:(n)&255 }; }
function srgb2lin(c){ c/=255; return c<=0.04045? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
function rgb2lab(r,g,b){ const R=srgb2lin(r), G=srgb2lin(g), B=srgb2lin(b);
  let X= R*0.4124564 + G*0.3575761 + B*0.1804375;
  let Y= R*0.2126729 + G*0.7151522 + B*0.0721750;
  let Z= R*0.0193339 + G*0.1191920 + B*0.9503041;
  X/=0.95047; Y/=1.00000; Z/=1.08883;
  const f=t=> t>0.008856? Math.cbrt(t) : (7.787*t + 16/116);
  const fx=f(X), fy=f(Y), fz=f(Z);
  return { L: (116*fy - 16), a: 500*(fx - fy), b: 200*(fy - fz) };
}
function deltaE76(l1, l2){ const dl=l1.L-l2.L, da=l1.a-l2.a, db=l1.b-l2.b; return Math.sqrt(dl*dl + da*da + db*db); }

const jobId = arg("--job");
const userPath = arg("--user");
let styleHex = arg("--style-hex","");
const stylePath = arg("--style","");
if(!jobId || !userPath){
  console.log("Usage: node scripts/score-autopick.mjs --job <job_id> --user <user.jpg> [--style-hex #rrggbb | --style <style.jpg>]");
  process.exit(1);
}

if(!styleHex && stylePath){
  const out = execFileSync(process.execPath, ["scripts/style-desc.mjs", "--style", stylePath], { encoding: "utf8" });
  const json = JSON.parse(out);
  styleHex = (json.attributes && json.attributes.color_hex) || "#222222";
}
if(!/^#?[0-9a-fA-F]{6}$/.test(styleHex||"")) styleHex = "#222222";
if(!styleHex.startsWith("#")) styleHex = "#"+styleHex;

const jobFile = path.join("storage", "jobs", `${jobId}.json`);
if(!fs.existsSync(jobFile)){ console.error("[error] job not found:", jobFile); process.exit(2); }
const job = JSON.parse(fs.readFileSync(jobFile,"utf8"));
const results = job.results || [];
if(results.length===0){ console.error("[error] no results in job"); process.exit(3); }

async function centerFaceCropBuf(p){
  const meta = await sharp(p).metadata();
  const W=meta.width||1024, H=meta.height||1024;
  const rect = { left: Math.floor(W*0.25), top: Math.floor(H*0.20), width: Math.floor(W*0.50), height: Math.floor(H*0.50) };
  const { data } = await sharp(p).extract(rect).resize(128,128).greyscale().raw().toBuffer({ resolveWithObject:true });
  return data;
}
async function centerFaceCropBufFromBuffer(buf){
  const meta = await sharp(buf).metadata();
  const W=meta.width||1024, H=meta.height||1024;
  const rect = { left: Math.floor(W*0.25), top: Math.floor(H*0.20), width: Math.floor(W*0.50), height: Math.floor(H*0.50) };
  const { data } = await sharp(buf).extract(rect).resize(128,128).greyscale().raw().toBuffer({ resolveWithObject:true });
  return data;
}
function mse(a,b){ let s=0; for(let i=0;i<a.length && i<b.length;i++){ const d=a[i]-b[i]; s+=d*d; } const n=Math.min(a.length,b.length)||1; return s/n; }
function identityScoreFromRMSE(rmse){ const s = 100*(1 - (rmse/255)); return clamp(s, 0, 100); }
async function computeIdentity(userBuf, candBuf){ const rmse = Math.sqrt(mse(userBuf, candBuf)); return identityScoreFromRMSE(rmse); }

async function avgHairRGB(buf){
  const meta = await sharp(buf).metadata();
  let W=meta.width||1024, H=meta.height||1024;
  const targetH = 512;
  const { data, info } = await sharp(buf).resize({ height: targetH }).raw().toBuffer({ resolveWithObject:true });
  W = info.width; H = info.height;
  const x0=Math.floor(W*0.25), y0=Math.floor(H*0.20), x1=Math.floor(W*0.75), y1=Math.floor(H*0.70);
  let rs=0, gs=0, bs=0, cnt=0;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const i=(y*W+x)*3;
      const r=data[i], g=data[i+1], b=data[i+2];
      if(x>=x0 && x<x1 && y>=y0 && y<y1) continue;
      const luma = 0.2126*r + 0.7152*g + 0.0722*b;
      const maxc=Math.max(r,g,b), minc=Math.min(r,g,b);
      const sat = maxc===0?0: (maxc-minc)/maxc;
      if(luma<170 && sat>0.10){ rs+=r; gs+=g; bs+=b; cnt++; }
    }
  }
  if(cnt===0) return { r:40, g:40, b:40 };
  return { r:rs/cnt, g:gs/cnt, b:bs/cnt };
}
function colorScore(candRGB, targetHex){
  const t = hex2rgb(targetHex);
  const lab1 = rgb2lab(candRGB.r, candRGB.g, candRGB.b);
  const lab2 = rgb2lab(t.r, t.g, t.b);
  const dE = deltaE76(lab1, lab2);
  const s = Math.round(100*Math.exp(-Math.pow(dE/25,2)));
  return clamp(s, 0, 100);
}

(async () => {
  const userFace = await centerFaceCropBuf(userPath);
  const targetHex = styleHex;

  let bestIdx = 0, bestScore=-1;
  for(let i=0;i<results.length;i++){
    const url = results[i].url || "";
    const candPath = url.startsWith("file://") ? fileURLToPath(url) : path.resolve(url);
    const candBufFull = fs.readFileSync(candPath);

    const candFace = await centerFaceCropBufFromBuffer(candBufFull);
    const idScore = await computeIdentity(userFace, candFace);

    const avgRGB = await avgHairRGB(candBufFull);
    const colScore = colorScore(avgRGB, targetHex);

    const total = Math.round(0.6*idScore + 0.4*colScore);
    results[i].scores = { identity: Math.round(idScore), color: Math.round(colScore), total };
    if(total>bestScore){ bestScore=total; bestIdx=i; }
  }

  job.results = results;
  job.meta = job.meta || {};
  job.meta.autopick_index = bestIdx+1;
  job.meta.autopick_reason = "identity+color";
  job.meta.review_needed = results.some(r => (r.scores?.color ?? 0) < 35 || (r.scores?.identity ?? 0) < 70);
  fs.writeFileSync(path.join("storage","jobs",`${jobId}.json`), JSON.stringify(job, null, 2));

  console.log(JSON.stringify({
    job_id: jobId,
    style_hex: targetHex,
    autopick_index: bestIdx+1,
    review_needed: job.meta.review_needed,
    candidates: results.map((r,idx)=>({ index: idx+1, scores: r.scores, url: r.url }))
  }, null, 2));
})();
