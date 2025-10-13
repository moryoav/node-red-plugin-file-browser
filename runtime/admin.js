module.exports = function(RED) {
  const path = require("path");
  const fs = require("fs");
  const fsp = fs.promises;

  const USER_DIR    = path.resolve(RED.settings.userDir || process.cwd());
  const CONFIG_FILE = path.join(USER_DIR, ".filebrowser.config.json");
  const settingsDefault = (RED.settings.get("fileBrowser") || {});
  const DEFAULT_MAX = settingsDefault.maxBytes || 5 * 1024 * 1024; // 5MB

  const DEBUG = false; // keep on while iterating; switch to env if you like

  // ---------- utils ----------
  async function readJSON(file) {
    try { return JSON.parse(await fsp.readFile(file, "utf8")); }
    catch { return null; }
  }
  async function writeJSON(file, obj) {
    const tmp = file + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
    await fsp.rename(tmp, file);
  }
  async function getConfig() {
    const fromFile = await readJSON(CONFIG_FILE);
    const baseDir  = path.resolve(
      (fromFile && fromFile.baseDir) ||
      settingsDefault.baseDir ||
      USER_DIR
    );
    const maxBytes = (fromFile && fromFile.maxBytes) || DEFAULT_MAX;
    return { baseDir, maxBytes };
  }
  async function setConfig(newCfg) {
    const cfg = await getConfig();
    const merged = {
      baseDir: newCfg.baseDir ? path.resolve(newCfg.baseDir) : cfg.baseDir,
      maxBytes: typeof newCfg.maxBytes === "number" ? newCfg.maxBytes : cfg.maxBytes
    };
    await writeJSON(CONFIG_FILE, merged);
    return merged;
  }
  function withinBase(abs, base) {
    const norm = path.normalize(abs);
    const baseN = path.normalize(base);
    return norm === baseN || norm.startsWith(baseN + path.sep);
  }
  async function statSafe(abs) {
    try { return await fsp.stat(abs); }
    catch { return null; }
  }

  // ---------- core fs ops ----------
  async function list(dirRel) {
    const { baseDir } = await getConfig();
    const dirAbs = path.resolve(baseDir, dirRel || ".");
    if (!withinBase(dirAbs, baseDir)) throw new Error("Path escapes baseDir");
    const ents = await fsp.readdir(dirAbs, { withFileTypes: true });
    const items = [];
    for (const de of ents) {
      const full = path.join(dirAbs, de.name);
      const st = await statSafe(full);
      items.push({
        name: de.name,
        path: path.relative(baseDir, full).replace(/\\/g, "/"),
        type: de.isDirectory() ? "dir" : "file",
        size: st ? st.size : 0,
        mtime: st ? st.mtimeMs : 0
      });
    }
    items.sort((a,b)=>{
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const rel = path.relative(baseDir, dirAbs).replace(/\\/g,"/") || ".";
    const crumb = rel === "." ? [] : rel.split("/").filter(Boolean);
    return { baseDir, userDir: USER_DIR, cwd: rel, items, breadcrumb: crumb };
  }

  async function open(rel) {
    const { baseDir, maxBytes } = await getConfig();
    const abs = path.resolve(baseDir, rel);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");
    const st = await fsp.stat(abs);
    if (!st.isFile()) throw new Error("Not a file");
    if (st.size > maxBytes) throw new Error("File too large");
    const buf = await fsp.readFile(abs);
    if (buf.includes(0)) throw new Error("Binary file not supported");
    return { text: buf.toString("utf8"), size: st.size, mtime: st.mtimeMs };
  }

  async function save(rel, text) {
    const { baseDir, maxBytes } = await getConfig();
    const abs = path.resolve(baseDir, rel);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");
    const dir = path.dirname(abs);
    const stDir = await statSafe(dir);
    if (!stDir || !stDir.isDirectory()) throw new Error("Parent folder missing");
    const buf = Buffer.from(String(text), "utf8");
    if (buf.length > maxBytes) throw new Error("Content too large");
    await fsp.writeFile(abs, buf);
    const st = await statSafe(abs);
    return { ok: true, size: st ? st.size : buf.length, mtime: st ? st.mtimeMs : Date.now() };
  }

  async function newFile(dirRel, name, overwrite=false) {
    const { baseDir } = await getConfig();
    if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error("Invalid filename");
    const abs = path.resolve(baseDir, dirRel || ".", name);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");
    const st = await statSafe(abs);
    if (st && !overwrite) throw new Error("File exists");
    await fsp.writeFile(abs, "");
    const st2 = await statSafe(abs);
    return { ok: true, path: path.relative(baseDir, abs).replace(/\\/g,"/"), size: st2?.size||0, mtime: st2?.mtimeMs||Date.now() };
  }

  async function newFolder(dirRel, name) {
    const { baseDir } = await getConfig();
    if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error("Invalid folder name");
    const abs = path.resolve(baseDir, dirRel || ".", name);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");
    await fsp.mkdir(abs, { recursive: true });
    return { ok: true, path: path.relative(baseDir, abs).replace(/\\/g,"/") };
  }

  async function rename(rel, newName) {
    const { baseDir } = await getConfig();
    if (!newName || /[\\/:*?"<>|]/.test(newName)) throw new Error("Invalid name");
    const srcAbs = path.resolve(baseDir, rel);
    if (!withinBase(srcAbs, baseDir)) throw new Error("Path escapes baseDir");
    const dstAbs = path.resolve(path.dirname(srcAbs), newName);
    if (!withinBase(dstAbs, baseDir)) throw new Error("Path escapes baseDir");
    await fsp.rename(srcAbs, dstAbs);
    const st = await statSafe(dstAbs);
    return { ok:true, path: path.relative(baseDir, dstAbs).replace(/\\/g,"/"), size: st?.size||0, mtime: st?.mtimeMs||Date.now() };
  }

  async function remove(rel) {
    const { baseDir } = await getConfig();
    const abs = path.resolve(baseDir, rel);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");
    const st = await statSafe(abs);
    if (!st) throw new Error("Not found");
    if (st.isDirectory()) await fsp.rm(abs, { recursive:true, force:true });
    else await fsp.unlink(abs);
    return { ok:true };
  }

  async function statOne(rel) {
    const { baseDir } = await getConfig();
    const abs = path.resolve(baseDir, rel);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");
    const st = await fsp.stat(abs);
    if (!st.isFile()) throw new Error("Not a file");
    return { size: st.size, mtime: st.mtimeMs };
  }

  // ---------- flows scanning ----------
  function* collectStrings(node, depth = 0, maxDepth = 6) {
    if (depth > maxDepth || !node) return;
    if (typeof node === "string") { yield node; return; }
    if (Array.isArray(node)) { for (const v of node) { yield* collectStrings(v, depth+1, maxDepth); } return; }
    if (typeof node === "object") {
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === "string") { yield v; }
        else if (typeof v === "object") { yield* collectStrings(v, depth+1, maxDepth); }
      }
    }
  }

  const EXT_SET = new Set(["py","js","ts","sh","bat","cmd","ps1","pl","rb","php","json","yaml","yml","ini","txt","md","csv","xml","html","css","sql","exe"]);
  function tokenize(str) {
    const re = /"([^"]+)"|'([^']+)'|[^\s]+/g;
    const out = []; let m;
    while ((m = re.exec(str))) out.push(m[1] || m[2] || m[0]);
    return out;
  }
  function sanitizeToken(tok) {
    return tok.replace(/[;,]+$/, "");
  }
  function splitAssignment(tok) {
    const i = tok.indexOf("=");
    if (i > 0) {
      return { key: tok.slice(0, i), value: tok.slice(i+1) };
    }
    return null;
  }
  function looksLikeFilePath(tok) {
    if (!tok || tok.length < 3) return false;
    if (tok.includes("://")) return false;           // URLs
    if (/[{}$`*<>|]/.test(tok)) return false;        // templates/vars/wildcards
    const t = tok.replace(/\\/g, "/");
    const last = t.split("/").pop();
    if (!last || !last.includes(".")) return false;
    const ext = last.split(".").pop().toLowerCase();
    return EXT_SET.has(ext);
  }
  function toAbsUnderBase(baseDir, candidate) {
    const isWinAbs = /^[A-Za-z]:[\\/]/.test(candidate);
    const isPosixAbs = candidate.startsWith("/") || candidate.startsWith("\\");
    return isWinAbs || isPosixAbs ? path.resolve(candidate) : path.resolve(baseDir, candidate);
  }

  async function getActiveFlows(req, baseDir) {
    // 1) Runtime (best)
    if (RED.runtime && RED.runtime.flows && typeof RED.runtime.flows.getFlows === "function") {
      try {
        const res = await RED.runtime.flows.getFlows({ user: req.user, req });
        if (res && Array.isArray(res.flows)) {
          if (DEBUG) RED.log.info(`[file-browser] getFlows(): ${res.flows.length} items (runtime)`);
          return { flows: res.flows, source: "runtime" };
        }
      } catch (e) {
        RED.log.warn(`[file-browser] runtime.flows.getFlows failed, falling back: ${e.message||e}`);
      }
    }
    // 2) Project file: <baseDir>/flows.json
    const projectFlows = path.join(baseDir, "flows.json");
    try {
      const pj = await readJSON(projectFlows);
      if (pj) {
        const arr = Array.isArray(pj) ? pj : (pj.flows && Array.isArray(pj.flows) ? pj.flows : []);
        if (arr.length) {
          if (DEBUG) RED.log.info(`[file-browser] read project flows: ${projectFlows}, items=${arr.length}`);
          return { flows: arr, source: "project", flowFile: projectFlows };
        }
      }
    } catch (e) {
      // ignore, try next
    }
    // 3) Fallback: settings.flowFile
    let flowFile = RED.settings.flowFile;
    if (flowFile) {
      if (!path.isAbsolute(flowFile)) flowFile = path.resolve(USER_DIR, flowFile);
      try {
        const fj = await readJSON(flowFile);
        const arr = Array.isArray(fj) ? fj : (fj && Array.isArray(fj.flows) ? fj.flows : []);
        if (DEBUG) RED.log.info(`[file-browser] read flowFile: ${flowFile}, items=${arr.length}`);
        return { flows: arr, source: "file", flowFile };
      } catch (e) {
        RED.log.warn(`[file-browser] Could not read flowFile "${flowFile}": ${e.message||e}`);
      }
    }
    return { flows: [], source: "none" };
  }

  async function scanFlows(req) {
    const { baseDir } = await getConfig();
    const { flows, source, flowFile } = await getActiveFlows(req, baseDir);

    const map = new Map(); // relPath -> { path, nodes:[{id,name,type}] }

    const counters = { nodes:0, strings:0, tokens:0, pathlike:0, withinBase:0, existing:0 };
    const details = [];         // first 50 pathlike tokens
    const withinBaseArr = [];   // first 50 within-base
    const notWithinArr = [];    // first 50 outside-base
    const samplesHit = [];      // first 50 hits
    const samplesMiss = [];     // first 50 misses

    let logLines = 0;
    const LOG_LIMIT = 300;

    for (const node of flows) {
      if (!node || typeof node !== "object") continue;
      counters.nodes++;
      const label = (node.name && String(node.name).trim()) || `${node.type||"node"} (${(node.id||"").slice(0,6)})`;
      for (const s of collectStrings(node)) {
        counters.strings++;
        for (let tok of tokenize(s)) {
          counters.tokens++;
          tok = sanitizeToken(tok);

          // Handle assignments like key=/path/file.ext
          let candidate = tok;
          const assign = splitAssignment(tok);
          if (assign && assign.value) candidate = assign.value;

          if (!looksLikeFilePath(candidate)) continue;
          counters.pathlike++;

          const abs = toAbsUnderBase(baseDir, candidate);
          const inBase = withinBase(abs, baseDir);
          const st = await statSafe(abs);
          const exists = !!st;
          const isFile = !!(st && st.isFile());
          const rel = path.relative(baseDir, abs).replace(/\\/g,"/");

          const row = { by: label, token: tok, candidate, abs, rel, inBase, exists, isFile };
          if (details.length < 50) details.push(row);
          if (inBase && withinBaseArr.length < 50) withinBaseArr.push(row);
          if (!inBase && notWithinArr.length < 50) notWithinArr.push(row);

          if (DEBUG && logLines < LOG_LIMIT) {
            RED.log.info(`[file-browser][scan] by="${label}" tok="${tok}" cand="${candidate}" abs="${abs}" rel="${rel}" inBase=${inBase} exists=${exists} isFile=${isFile}`);
            logLines++;
          }

          if (!inBase) continue;
          counters.withinBase++;

          // Record as referenced (within base)
          let entry = map.get(rel);
          if (!entry) { entry = { path: rel, nodes: [] }; map.set(rel, entry); }
          if (!entry.nodes.find(n => n.id === node.id)) {
            entry.nodes.push({ id: node.id || "", name: label, type: node.type || "" });
          }

          if (isFile) {
            counters.existing++;
            if (samplesHit.length < 50) samplesHit.push(row);
          } else {
            if (samplesMiss.length < 50) samplesMiss.push(row);
          }
        }
      }
    }

    if (DEBUG) {
      RED.log.info(`[file-browser] scan summary: nodes=${counters.nodes} strings=${counters.strings} tokens=${counters.tokens} pathlike=${counters.pathlike} withinBase=${counters.withinBase} existing=${counters.existing} refs=${map.size} baseDir=${baseDir} source=${source}${flowFile?(" file="+flowFile):""}`);
    }

    return {
      referenced: Array.from(map.values()),
      debug: {
        baseDir,
        source,
        flowFile,
        counters,
        details,
        withinBase: withinBaseArr,
        notWithinBase: notWithinArr,
        hits: samplesHit,
        misses: samplesMiss
      }
    };
  }

  // ---------- permissions ----------
  const needsRead      = RED.auth.needsPermission("file-browser.read");
  const needsWrite     = RED.auth.needsPermission("file-browser.write");
  const needsFlowsRead = RED.auth.needsPermission("flows.read");

  // ---------- routes ----------
  RED.httpAdmin.get("/filebrowser/config", needsRead, async (req,res)=>{
    try { res.json(await getConfig()); }
    catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  RED.httpAdmin.post("/filebrowser/set-base", needsWrite, async (req,res)=>{
    try {
      const { path: proposed, maxBytes } = req.body || {};
      if (!proposed) throw new Error("Missing path");
      const abs = path.resolve(proposed);
      if (!withinBase(abs, USER_DIR)) throw new Error("Base must be inside userDir");
      const st = await statSafe(abs);
      if (!st || !st.isDirectory()) throw new Error("Not a directory");
      const cfg = await setConfig({ baseDir: abs, maxBytes });
      res.json({ ok:true, baseDir: cfg.baseDir, userDir: USER_DIR });
    } catch(e) {
      res.status(400).json({ error: String(e.message||e) });
    }
  });

  RED.httpAdmin.get("/filebrowser/list", needsRead, async (req,res)=>{
    try { res.json(await list(req.query.path || ".")); }
    catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  RED.httpAdmin.get("/filebrowser/open", needsRead, async (req,res)=>{
    try { res.json(await open(req.query.path)); }
    catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  RED.httpAdmin.get("/filebrowser/stat", needsRead, async (req,res)=>{
    try { res.json(await statOne(req.query.path)); }
    catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  RED.httpAdmin.get("/filebrowser/scan-flows", needsFlowsRead, async (req,res)=>{
    try {
      const result = await scanFlows(req);
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.json(result);
    } catch(e) {
      RED.log.warn(`[file-browser] scan-flows error: ${e.message||e}`);
      res.json({ referenced: [], debug: { error: String(e.message||e) } });
    }
  });

  RED.httpAdmin.post("/filebrowser/save", needsWrite, async (req,res)=>{
    try {
      const { path: rel, text } = req.body || {};
      if (!rel) throw new Error("Missing path");
      res.json(await save(rel, text));
    } catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  RED.httpAdmin.post("/filebrowser/new-file", needsWrite, async (req,res)=>{
    try {
      const { dir, name, overwrite } = req.body || {};
      res.json(await newFile(dir || ".", name, !!overwrite));
    } catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  RED.httpAdmin.post("/filebrowser/new-folder", needsWrite, async (req,res)=>{
    try {
      const { dir, name } = req.body || {};
      res.json(await newFolder(dir || ".", name));
    } catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  RED.httpAdmin.post("/filebrowser/rename", needsWrite, async (req,res)=>{
    try {
      const { path: rel, newName } = req.body || {};
      res.json(await rename(rel, newName));
    } catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  RED.httpAdmin.post("/filebrowser/delete", needsWrite, async (req,res)=>{
    try {
      const { path: rel } = req.body || {};
      res.json(await remove(rel));
    } catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  // ---------- startup log ----------
  getConfig().then(cfg=>{
    RED.log.info(`[file-browser] baseDir=${cfg.baseDir} (userDir=${USER_DIR})`);
  }).catch(()=>{
    RED.log.info(`[file-browser] using userDir=${USER_DIR}`);
  });
};
