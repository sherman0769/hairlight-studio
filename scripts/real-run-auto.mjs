#!/usr/bin/env node
import "dotenv/config";
import { execFileSync } from "node:child_process";

function arg(f,d){ const i=process.argv.indexOf(f); if(i===-1) return d; const v=process.argv[i+1]; return (!v||v.startsWith("--"))?d:v; }
function usage(){ console.log("Usage: node scripts/real-run-auto.mjs --user <path> --style <path> [--candidates 1..3] [--max-size 512..2048] [--watch sec] [--print-desc]"); process.exit(1); }

const user = arg("--user"), style = arg("--style");
if(!user || !style) usage();
const candidates = arg("--candidates","3");
const maxSize    = arg("--max-size","1024");
let   watch      = parseInt(arg("--watch","0"),10) || 0;
const showDesc   = process.argv.includes("--print-desc");

// 1) 先自動從 style.jpg 產出 style_desc（零輸入）
let styleDesc = "", attributes = null;
try {
  const out = execFileSync(process.execPath, ["scripts/style-desc.mjs", "--style", style], { encoding: "utf8" });
  const json = JSON.parse(out);
  styleDesc  = json.style_desc || "";
  attributes = json.attributes || null;
  if (showDesc && styleDesc) console.error("[style-desc]", styleDesc);
} catch (e) {
  console.error("[warn] style-desc 產生失敗，改用無描述模式：", e.message || String(e));
}

// 2) 丟進真實生成流程（real-run），自動帶上 style-desc
const args = [
  "scripts/real-run.mjs",
  "--user", user,
  "--style", style,
  "--candidates", String(candidates),
  "--max-size", String(maxSize)
];
if (styleDesc) args.push("--style-desc", styleDesc);
if (watch>0)   args.push("--watch", String(watch));

const resultOut = execFileSync(process.execPath, args, { encoding: "utf8" });
let result = {};
try { result = JSON.parse(resultOut); } catch { console.error("[error] real-run 輸出不是 JSON"); process.exit(2); }

// 3) 附帶回報本次自動分析出的屬性與描述（便於檢視）
if (styleDesc)  result.style_desc = styleDesc;
if (attributes) result.attributes = attributes;

console.log(JSON.stringify(result, null, 2));
