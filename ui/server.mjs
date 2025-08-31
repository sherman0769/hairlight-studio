// @ts-nocheck
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import multer from "multer";

const app = express();
/* 支援命令列參數與環境變數 */
const argvPort = parseInt(process.argv[2] || "", 10);
const PORT = Number.isFinite(argvPort)
  ? argvPort
  : (process.env.PORT ? parseInt(process.env.PORT, 10) : 5050);

/* 簡易日誌（取代 morgan） */
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use("/storage", express.static("storage"));
app.use("/", express.static(path.join(process.cwd(), "ui", "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB/檔
});

function toStoragePath(u){
  if(!u) return u;
  let p = u.startsWith("file://") ? fileURLToPath(u) : u;
  const s = p.replace(/\\/g,"/");
  const i = s.toLowerCase().indexOf("/storage/");
  return i>=0 ? "/storage" + s.slice(i + "/storage".length) : s;
}

/* 健康檢查 */
app.get("/api/ping", (_req,res)=> res.json({ ok:true, time: Date.now() }));

/* 讀取任務 */
app.get("/api/job/:id", (req,res)=>{
  const jobPath = path.join("storage","jobs", `${req.params.id}.json`);
  if(!fs.existsSync(jobPath)) return res.status(404).json({error:"job not found"});
  try{
    const job = JSON.parse(fs.readFileSync(jobPath,"utf8"));
    job.results = (job.results||[]).map(r=>({ ...r, url: toStoragePath(r.url) }));
    res.json(job);
  }catch(e){ res.status(500).json({error:String(e)}) }
});

/* 最新任務 */
app.get("/api/last-job", (_req,res)=>{
  try{
    const dir = path.join("storage","jobs");
    if(!fs.existsSync(dir)) return res.json({ job_id:null });
    const files = fs.readdirSync(dir).filter(f=>f.endsWith(".json"));
    if(files.length===0) return res.json({ job_id:null });
    files.sort((a,b)=> fs.statSync(path.join(dir,b)).mtimeMs - fs.statSync(path.join(dir,a)).mtimeMs);
    const latest = files[0];
    const id = path.basename(latest, ".json");
    const job = JSON.parse(fs.readFileSync(path.join(dir, latest),"utf8"));
    res.json({ job_id:id, results_count:(job.results||[]).length, meta: job.meta||{} });
  }catch(e){ res.status(500).json({error:String(e)}) }
});

/* 產對比圖 */
app.post("/api/compare", (req,res)=>{
  const { job_id, user, style, pick="auto", title="髮型預覽對比" } = req.body || {};
  if(!job_id || !user || !style) return res.status(400).json({error:"missing params"});
  const args = ["scripts/make-compare-zh.mjs","--user",user,"--style",style,"--job",job_id,"--title",title,"--pick",String(pick)];
  execFile(process.execPath, args, { encoding:"utf8" }, (err, stdout, stderr)=>{
    if(err){ console.error("compare err:",err, stderr); return res.status(500).json({error: err.message}); }
    try{ res.json(JSON.parse(stdout)); }
    catch(parseErr){ console.error("compare bad JSON:", stdout); res.status(500).json({error:"bad compare output", raw: stdout}); }
  });
});

/* 一鍵新任務：上傳 → 生成 → 打分 → 比圖 */
app.post("/api/new-run", upload.fields([{ name:"user", maxCount:1 }, { name:"style", maxCount:1 }]), (req,res)=>{
  (async ()=>{
    try{
      if(!req.files?.user?.[0] || !req.files?.style?.[0]) return res.status(400).json({error:"need user & style images"});
      const t = Date.now();
      const base = path.join("storage","uploads", String(t));
      fs.mkdirSync(base, { recursive:true });
      const userPath  = path.join(base, "user.jpg");
      const stylePath = path.join(base, "style.jpg");
      fs.writeFileSync(userPath, req.files.user[0].buffer);
      fs.writeFileSync(stylePath, req.files.style[0].buffer);

      const args = [
        "scripts/real-run-auto-compare.mjs",
        "--user", userPath, "--style", stylePath,
        "--candidates", "3", "--max-size", "1024", "--watch", "40"
      ];
      execFile(process.execPath, args, { encoding:"utf8" }, (err, stdout, stderr)=>{
        if(err){ console.error("new-run err:", err, stderr); return res.status(500).json({error: err.message}); }
        let json; try{ json = JSON.parse(stdout); }
        catch{ console.error("pipeline bad JSON:", stdout); return res.status(500).json({error:"bad pipeline output", raw: stdout}); }

        // 寫回 job.meta（前端回填與預覽）
        try{
          const jobFile = path.join("storage","jobs", `${json.job_id}.json`);
          if (fs.existsSync(jobFile)){
            const job = JSON.parse(fs.readFileSync(jobFile,"utf8"));
            job.meta = job.meta || {};
            job.meta.user_src   = userPath.replace(/\\/g,"/");
            job.meta.style_src  = stylePath.replace(/\\/g,"/");
            job.meta.style_desc = json.style_desc || job.meta.style_desc;
            fs.writeFileSync(jobFile, JSON.stringify(job, null, 2));
          }
        }catch(metaErr){ console.error("write meta err:", metaErr); }

        const relCompare = json.compare?.startsWith("storage") ? "/"+json.compare : json.compare;
        res.json({
          ...json,
          compare_url: relCompare,
          user: "/"+userPath.replace(/\\/g,"/"),
          style:"/"+stylePath.replace(/\\/g,"/")
        });
      });
    }catch(e){ console.error("new-run 500:", e); res.status(500).json({error:String(e)}); }
  })();
});

/* 未攔截錯誤 → 統一回 JSON */
app.use((err,_req,res,_next)=>{ console.error("Unhandled:", err); res.status(500).json({error: String(err?.message || err)}); });

app.listen(PORT, ()=> console.log(`Mobile UI 👉 http://localhost:${PORT}`));
