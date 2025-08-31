#!/usr/bin/env node
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
function getVal(flag, def) {
  const i = args.indexOf(flag);
  if (i === -1) return def;
  const nxt = args[i + 1];
  if (!nxt || nxt.startsWith("--")) return true;
  return nxt;
}
function usage(code = 1) {
  console.log("Usage: node scripts/compose-create.js --user <path|url> --style <path|url> [--candidates 1..3] [--max-size 512..2048] [--format jpeg|png]");
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

// 1) 呼叫本地 mock-sign，拿到 public_url
const signOut = execFileSync(process.execPath, ["scripts/mock-sign.js", "--user", user, "--style", style], { encoding: "utf8" });
let sign;
try { sign = JSON.parse(signOut); } catch (e) { console.error("[error] mock-sign 輸出不是 JSON"); process.exit(1); }

const up = (purpose) => (sign.uploads || []).find(u => u.purpose === purpose) || {};
const userURL = up("user_photo").public_url;
const styleURL = up("style_photo").public_url;
if (!userURL || !styleURL) { console.error("[error] 取不到 public_url"); process.exit(1); }

// 2) 組出 /v1/hair-preview/create 的 payload
const createBody = {
  user_photo_url: userURL,
  style_photo_url: styleURL,
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
    output: { max_size_px: maxSize, format }
  }
};

// 3) 印出最終要送的 HTTP 請求描述
const request = { method: "POST", path: "/v1/hair-preview/create", body: createBody };
console.log(JSON.stringify(request, null, 2));
