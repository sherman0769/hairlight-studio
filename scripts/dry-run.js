#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

let dotenvLoaded = false;
try { require("dotenv").config(); dotenvLoaded = true; } catch (_) {}

const args = process.argv.slice(2);
function getVal(flag, def) {
  const i = args.indexOf(flag);
  if (i === -1) return def;
  const next = args[i + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}
function usage(code = 1) {
  console.log("Usage: node scripts/dry-run.js --user <path|url> --style <path|url> [--candidates 1..3] [--max-size 512..2048] [--format jpeg|png]");
  process.exit(code);
}

const user = getVal("--user");
const style = getVal("--style");
if (!user || !style) usage(1);

const candidatesIn = parseInt(getVal("--candidates", "3"), 10);
const maxSizeIn = parseInt(getVal("--max-size", "1024"), 10);
let format = String(getVal("--format", "jpeg")).toLowerCase();

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
const candidates = clamp(Number.isNaN(candidatesIn) ? 3 : candidatesIn, 1, 3);
const maxSize = clamp(Number.isNaN(maxSizeIn) ? 1024 : maxSizeIn, 512, 2048);
if (!["jpeg", "png"].includes(format)) format = "jpeg";

function guessContentType(p) {
  if (/^https?:/i.test(p)) {
    const m = p.match(/\.(jpg|jpeg|png)(?:[?#]|$)/i);
    const ext = m && m[1] ? m[1].toLowerCase() : "jpg";
    return ext === "png" ? "image/png" : "image/jpeg";
  } else {
    const ext = path.extname(p).toLowerCase();
    return ext === ".png" ? "image/png" : "image/jpeg";
  }
}
function warnIfLocalMissing(p) {
  if (!/^https?:/i.test(p) && !fs.existsSync(p)) {
    console.warn(`[warn] File not found: ${p}`);
  }
}
warnIfLocalMissing(user);
warnIfLocalMissing(style);

const signBody = {
  files: [
    { purpose: "user_photo",  content_type: guessContentType(user) },
    { purpose: "style_photo", content_type: guessContentType(style) }
  ]
};

const createBody = {
  user_photo_url: "<TO_BE_FILLED_BY_UPLOADS_SIGN_PUBLIC_URL_USER>",
  style_photo_url: "<TO_BE_FILLED_BY_UPLOADS_SIGN_PUBLIC_URL_STYLE>",
  options: {
    candidates,
    keep_face: true,
    hair_rules: {
      follow_length: true,
      follow_layers: true,
      follow_hairline: true,
      follow_parting: true,
      follow_color: true
    },
    output: {
      max_size_px: maxSize,
      format
    }
  }
};

const env = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "(set)" : "(missing)",
  REGION: process.env.REGION || "asia-east1",
  dotenv: dotenvLoaded
};

const preview = {
  env,
  inputs: { user, style },
  http_calls: {
    sign:   { method: "POST", path: "/v1/uploads/sign",        body: signBody },
    create: { method: "POST", path: "/v1/hair-preview/create", body: createBody }
  }
};

console.log(JSON.stringify(preview, null, 2));
