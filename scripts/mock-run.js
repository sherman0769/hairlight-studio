#!/usr/bin/env node
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
function getVal(flag, def) {
  const i = args.indexOf(flag);
  if (i === -1) return def;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) return true;
  return v;
}
function usage(code = 1) {
  console.log("Usage: node scripts/mock-run.js --user <path|url> --style <path|url> [--candidates 1..3] [--max-size 512..2048] [--format jpeg|png] [--watch <sec>]");
  process.exit(code);
}

const user = getVal("--user");
const style = getVal("--style");
if (!user || !style) usage(1);

const candidates = String(getVal("--candidates", "3"));
const maxSize    = String(getVal("--max-size", "1024"));
const format     = String(getVal("--format", "jpeg")).toLowerCase();
let watchSec     = parseInt(getVal("--watch", "0"), 10) || 0;

// 1) 建立任務（mock-create）
const createOut = execFileSync(process.execPath, [
  "scripts/mock-create.js",
  "--user", user,
  "--style", style,
  "--candidates", candidates,
  "--max-size", maxSize,
  "--format", format
], { encoding: "utf8" });

let created;
try { created = JSON.parse(createOut); } catch (e) {
  console.error("[error] mock-create 輸出不是 JSON");
  process.exit(1);
}
const jobId = created.job_id;
const etaMs = created.eta_ms || 8000;

// 若未指定 --watch，預設用 (eta + 2s) 來輪詢
if (!watchSec || watchSec <= 0) watchSec = Math.ceil(etaMs / 1000) + 2;

// 2) 查詢結果（mock-result）
const resultOut = execFileSync(process.execPath, [
  "scripts/mock-result.js",
  "--job", jobId,
  "--watch", String(watchSec)
], { encoding: "utf8" });

let result;
try { result = JSON.parse(resultOut); } catch (e) {
  console.error("[error] mock-result 輸出不是 JSON");
  process.exit(1);
}

// 3) 最終輸出
console.log(JSON.stringify({ job_id: jobId, ...result }, null, 2));
