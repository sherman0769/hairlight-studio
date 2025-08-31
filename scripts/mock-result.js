#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
function getVal(flag, def) {
  const i = args.indexOf(flag);
  if (i === -1) return def;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) return true;
  return v;
}
function usage(code = 1) {
  console.log("Usage: node scripts/mock-result.js --job <job_id> [--watch <sec>]");
  process.exit(code);
}

const jobId = getVal("--job");
const watchSec = parseInt(getVal("--watch", "0"), 10) || 0;
if (!jobId) usage(1);

const jobPath = path.join("storage", "jobs", `${jobId}.json`);

function tryRead() {
  if (!fs.existsSync(jobPath)) return null;
  try {
    const txt = fs.readFileSync(jobPath, "utf8");
    return JSON.parse(txt);
  } catch (e) {
    return { status: "failed", error: { code: "STORAGE_ERROR", message: e.message } };
  }
}

function output(rec) {
  const out = {
    status: rec.status || "processing",
    results: rec.results || [],
    meta: rec.meta,
    error: rec.error
  };
  console.log(JSON.stringify(out, null, 2));
}

let rec = tryRead();
if (rec) {
  output(rec);
  process.exit(0);
}

if (watchSec > 0) {
  const deadline = Date.now() + watchSec * 1000;
  const timer = setInterval(() => {
    rec = tryRead();
    if (rec) {
      clearInterval(timer);
      output(rec);
      process.exit(0);
    }
    if (Date.now() >= deadline) {
      clearInterval(timer);
      console.log(JSON.stringify({ status: "processing", progress: { percent: 50 } }, null, 2));
      process.exit(0);
    }
  }, 1000);
} else {
  console.log(JSON.stringify({ status: "processing", progress: { percent: 0 } }, null, 2));
}
