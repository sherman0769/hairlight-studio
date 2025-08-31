#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

function arg(f,d){ const i=process.argv.indexOf(f); if(i===-1) return d; const v=process.argv[i+1]; return (!v||v.startsWith("--"))?d:v; }
function usage(){ console.log("Usage: node scripts/real-run-auto-compare.mjs --user <path> --style <path> [--candidates 1..3] [--max-size 512..2048] [--watch sec] [--pick 1|2|3|auto]"); process.exit(1); }

const user = arg("--user"), style = arg("--style");
if(!user || !style) usage();
const candidates = Math.max(1, Math.min(parseInt(arg("--candidates","3"),10)||3, 3));
const maxSize    = arg("--max-size","1024");
const watch      = arg("--watch","40");
const pickArg    = arg("--pick","auto");

// 1) 先跑「零輸入自動化」（會做風格分析 + 真實生成 + 查結果）
const autoOut = execFileSync(process.execPath, [
  "scripts/real-run-auto.mjs",
  "--user", user, "--style", style,
  "--candidates", String(candidates), "--max-size", maxSize,
  "--watch", watch, "--print-desc"
], { encoding: "utf8" });
let result = JSON.parse(autoOut);
if (result.status !== "succeeded") {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// 2) 不足就補滿
const jobId = result.job_id;
const styleDesc = result.style_desc || "";
const jobPath = `storage/jobs/${jobId}.json`;
let jobJson = JSON.parse(fs.readFileSync(jobPath, "utf8"));
if ((jobJson.results?.length || 0) < candidates) {
  execFileSync(process.execPath, [
    "scripts/real-create-topup.mjs",
    "--user", user, "--style", style,
    "--job", jobId,
    "--style-desc", styleDesc,
    "--min-candidates", String(candidates),
    "--max-rounds", "2",
    "--max-size", maxSize
  ], { encoding: "utf8" });
  jobJson = JSON.parse(fs.readFileSync(jobPath, "utf8"));
}

// 3) 打分（identity+color），寫回 autopick_index 與 review_needed
execFileSync(process.execPath, [
  "scripts/score-autopick.mjs", "--job", jobId, "--user", user, "--style", style
], { encoding: "utf8" });
jobJson = JSON.parse(fs.readFileSync(jobPath, "utf8"));
const autoIdx = jobJson?.meta?.autopick_index || 1;
const needReview = !!jobJson?.meta?.review_needed;

// 4) 對比圖（預設 auto），標題=style_desc，小徽章=「自動挑：第N張｜建議人工檢視(可選)」
const badge = `自動挑：第${autoIdx}張${needReview ? "｜建議人工檢視" : ""}`;
const cmpOut = execFileSync(process.execPath, [
  "scripts/make-compare-zh.mjs",
  "--user", user, "--style", style, "--job", jobId,
  "--title", (styleDesc || "髮型預覽對比（原照／參考／結果）"),
  "--pick", pickArg, "--badge", badge
], { encoding: "utf8" });
const cmp = JSON.parse(cmpOut);

// 5) 回傳
console.log(JSON.stringify({ ...result, compare: cmp.out, pick_used: cmp.pick, review_needed: needReview }, null, 2));
