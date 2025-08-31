#!/usr/bin/env node
import "dotenv/config";
import { execFileSync } from "node:child_process";

function arg(f,d){ const i=process.argv.indexOf(f); if(i===-1) return d; const v=process.argv[i+1]; return (!v||v.startsWith("--"))?d:v; }
function usage(){ console.log("Usage: node scripts/real-run-auto-color.mjs --user <path> --style <path> [--candidates 1..3] [--max-size 512..2048] [--watch sec]"); process.exit(1); }

const user = arg("--user"), style = arg("--style");
if(!user || !style) usage();
const candidates = arg("--candidates","3");
const maxSize    = arg("--max-size","1024");
let   watch      = parseInt(arg("--watch","40"),10) || 40;

// 1) 自動解析 style（拿到 style_desc + color_hex）
const descOut = execFileSync(process.execPath, ["scripts/style-desc.mjs", "--style", style], { encoding: "utf8" });
const desc = JSON.parse(descOut);
const hex  = (desc.attributes?.color_hex || "#222222");

// 2) 以色票強制版建立任務
const createOut = execFileSync(process.execPath, [
  "scripts/real-create-color.mjs",
  "--user", user, "--style", style, "--color-hex", hex,
  "--candidates", candidates, "--max-size", maxSize
], { encoding: "utf8" });
const created = JSON.parse(createOut);

// 3) 等結果
const resultOut = execFileSync(process.execPath, ["scripts/mock-result.js", "--job", created.job_id, "--watch", String(watch)], { encoding: "utf8" });
const result = JSON.parse(resultOut);

// 4) 回傳合併資訊
console.log(JSON.stringify({ style_desc: desc.style_desc, color_hex: hex, ...created, ...result }, null, 2));
