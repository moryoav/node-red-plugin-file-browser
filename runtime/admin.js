/**
 * Runtime admin endpoints for the File Browser sidebar.
 * Now with self-serve config: baseDir is stored in /data/.filebrowser.config.json
 * No settings.js edits required.
 */
module.exports = function(RED) {
  const path = require("path");
  const fs = require("fs");
  const fsp = fs.promises;

  // Where we'll persist config
  const USER_DIR   = path.resolve(RED.settings.userDir || process.cwd());
  const CONFIG_FILE = path.join(USER_DIR, ".filebrowser.config.json");

  // Optional defaults (kept for compatibility if user still put them in settings.js)
  const settingsDefault = (RED.settings.get("fileBrowser") || {});
  const DEFAULT_MAX = settingsDefault.maxBytes || 5 * 1024 * 1024; // 5MB

  // ---- config helpers ----
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
    // Settings default (legacy) -> stored file -> fallback userDir
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

  // ---- path helpers ----
  function withinBase(abs, base) {
    const norm = path.normalize(abs);
    const baseN = path.normalize(base);
    return norm === baseN || norm.startsWith(baseN + path.sep);
  }
  async function statSafe(abs) {
    try { return await fsp.stat(abs); }
    catch { return null; }
  }

  // ---- core ops (use dynamic baseDir every call) ----
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
    return buf.toString("utf8");
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
    return { ok: true };
  }

  async function newFile(dirRel, name, overwrite=false) {
    const { baseDir } = await getConfig();
    if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error("Invalid filename");
    const abs = path.resolve(baseDir, dirRel || ".", name);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");
    const st = await statSafe(abs);
    if (st && !overwrite) throw new Error("File exists");
    await fsp.writeFile(abs, "");
    return { ok: true, path: path.relative(baseDir, abs).replace(/\\/g,"/") };
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
    return { ok:true, path: path.relative(baseDir, dstAbs).replace(/\\/g,"/") };
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

  // ---- Routes (admin-auth protected) ----
  const needsRead  = RED.auth.needsPermission("file-browser.read");
  const needsWrite = RED.auth.needsPermission("file-browser.write");

  // config get/set
  RED.httpAdmin.get("/filebrowser/config", needsRead, async (req,res)=>{
    try { res.json(await getConfig()); }
    catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  // Only allow baseDir within userDir for safety
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

  // File ops
  RED.httpAdmin.get("/filebrowser/list", needsRead, async (req,res)=>{
    try { res.json(await list(req.query.path || ".")); }
    catch(e){ res.status(400).json({ error: String(e.message||e) }); }
  });

  RED.httpAdmin.get("/filebrowser/open", needsRead, async (req,res)=>{
    try { res.json({ text: await open(req.query.path) }); }
    catch(e){ res.status(400).json({ error: String(e.message||e) }); }
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

  getConfig().then(cfg=>{
    RED.log.info(`[file-browser] baseDir=${cfg.baseDir} (userDir=${USER_DIR})`);
  }).catch(()=> {
    RED.log.info(`[file-browser] using userDir=${USER_DIR}`);
  });
};
