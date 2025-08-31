#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const args = process.argv.slice(2);
function getVal(flag) {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  const v = args[i + 1];
  return !v || v.startsWith("--") ? undefined : v;
}
function usage(code = 1) {
  console.log("Usage: node scripts/mock-sign.js --user <path|url> --style <path|url>");
  process.exit(code);
}
const user = getVal("--user");
const style = getVal("--style");
if (!user || !style) usage(1);

function guessContentType(p) {
  if (/^https?:/i.test(p)) {
    const m = p.match(/\.(jpg|jpeg|png)(?:[?#]|$)/i);
    const ext = (m && m[1] ? m[1].toLowerCase() : "jpg");
    return ext === "png" ? "image/png" : "image/jpeg";
  } else {
    const ext = path.extname(p).toLowerCase();
    return ext === ".png" ? "image/png" : "image/jpeg";
  }
}
function toPublicUrl(p) {
  if (/^https?:\/\//i.test(p) || /^file:\/\//i.test(p)) return p;
  const abs = path.resolve(p);
  return pathToFileURL(abs).href; // 轉成 file:// URL
}
function warnIfLocalMissing(purpose, p) {
  if (!/^https?:/i.test(p) && !fs.existsSync(p)) {
    console.warn(`[warn] ${purpose} not found: ${p}`);
  }
}

warnIfLocalMissing("user_photo", user);
warnIfLocalMissing("style_photo", style);

const uploads = [
  {
    purpose: "user_photo",
    upload_url: `mock://upload/user_photo/${Date.now()}`, // 本地模擬用
    public_url: toPublicUrl(user),
    expires_in_sec: 600,
    content_type: guessContentType(user)
  },
  {
    purpose: "style_photo",
    upload_url: `mock://upload/style_photo/${Date.now()}`,
    public_url: toPublicUrl(style),
    expires_in_sec: 600,
    content_type: guessContentType(style)
  }
];

console.log(JSON.stringify({ uploads }, null, 2));
