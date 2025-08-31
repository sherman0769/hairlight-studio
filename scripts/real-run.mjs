#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function arg(f,d){ const i=process.argv.indexOf(f); if(i===-1) return d; const v=process.argv[i+1]; return (!v || v.startsWith("--")) ? d : v; }
function has(f){ return process.argv.includes(f); }
function usage(){ console.log("Usage: node scripts/real-run.mjs --user <path> --style <path> [--style-desc \"文字\"] [--candidates 1..3] [--max-size 512..2048] [--watch sec]"); process.exit(1); }

const user = arg("--user"), style = arg("--style");
if(!user || !style) usage();
const styleDesc = arg("--style-desc","");
const candidates = arg("--candidates","3");
const maxSize    = arg("--max-size","1024");
let watch        = parseInt(arg("--watch","0"),10)||0;

// 1) 建立任務（真實呼叫）
const createOut = execFileSync(process.execPath, [
  "scripts/real-create.mjs",
  "--user", user,
  "--style", style,
  "--candidates", candidates,
  "--max-size", maxSize,
  ...(styleDesc ? ["--style-desc", styleDesc] : [])
], { encoding: "utf8" });

let created; try{ created = JSON.parse(createOut); }catch{ console.error("[error] real-create 輸出不是 JSON"); process.exit(1); }
const job = created.job_id, eta = created.eta_ms || 12000;
if(!watch || watch<=0) watch = Math.ceil(eta/1000) + 4;

// 2) 查詢結果
const resultOut = execFileSync(process.execPath, ["scripts/mock-result.js", "--job", job, "--watch", String(watch)], { encoding: "utf8" });
let result; try{ result = JSON.parse(resultOut); }catch{ console.error("[error] result 輸出不是 JSON"); process.exit(2); }

console.log(JSON.stringify({ job_id: job, ...result }, null, 2));
