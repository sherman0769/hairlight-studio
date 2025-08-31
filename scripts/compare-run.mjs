#!/usr/bin/env node
import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

function arg(f,d){ const i=process.argv.indexOf(f); if(i===-1) return d; const v=process.argv[i+1]; return (!v||v.startsWith("--"))?d:v; }
function usage(){ console.log("Usage: node scripts/compare-run.mjs --job <job_id> --user <path> --style <path> [--title \"標題\"] [--pick 1|2|3|auto]"); process.exit(1); }

const job = arg("--job"), user = arg("--user"), style = arg("--style");
if(!job || !user || !style) usage();
const title = arg("--title","髮型預覽對比（原照／參考／結果）");
const pick  = arg("--pick","auto");

// 1) 先打分（會把 autopick_index / review_needed 寫回 job.json）
execFileSync(process.execPath, ["scripts/score-autopick.mjs", "--job", job, "--user", user, "--style", style], { encoding: "utf8" });

// 2) 讀取 autopick 與 review
const jobJson = JSON.parse(fs.readFileSync(`storage/jobs/${job}.json`, "utf8"));
const autoIdx = jobJson?.meta?.autopick_index || 1;
const needReview = !!jobJson?.meta?.review_needed;
const badge = `自動挑：第${autoIdx}張${needReview ? "｜建議人工檢視" : ""}`;

// 3) 產對比圖（可指定 pick，預設 auto）
const out = execFileSync(process.execPath, [
  "scripts/make-compare-zh.mjs",
  "--user", user, "--style", style, "--job", job,
  "--title", title, "--pick", pick, "--badge", badge
], { encoding: "utf8" });

console.log(out);
