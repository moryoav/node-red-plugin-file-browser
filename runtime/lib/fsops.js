const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

function createFsOps(cfg) {
  function withinBase(abs, base) {
    const norm = path.normalize(abs);
    const baseN = path.normalize(base);
    return norm === baseN || norm.startsWith(baseN + path.sep);
  }

  async function statSafe(abs) {
    try {
      return await fsp.stat(abs);
    } catch {
      return null;
    }
  }

  async function list(dirRel) {
    const { baseDir } = await cfg.getConfig();
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
        mtime: st ? st.mtimeMs : 0,
      });
    }
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const rel = path.relative(baseDir, dirAbs).replace(/\\/g, "/") || ".";
    const breadcrumb = rel === "." ? [] : rel.split("/").filter(Boolean);
    return {
      baseDir,
      userDir: cfg.USER_DIR,
      cwd: rel,
      items,
      breadcrumb,
    };
  }

  async function open(rel) {
    const { baseDir, maxBytes } = await cfg.getConfig();
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
    const { baseDir, maxBytes } = await cfg.getConfig();
    const abs = path.resolve(baseDir, rel);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");
    const dir = path.dirname(abs);
    const stDir = await statSafe(dir);
    if (!stDir || !stDir.isDirectory()) throw new Error("Parent folder missing");

    const buf = Buffer.from(String(text), "utf8");
    if (buf.length > maxBytes) throw new Error("Content too large");

    await fsp.writeFile(abs, buf);
    const st = await statSafe(abs);
    return {
      ok: true,
      size: st ? st.size : buf.length,
      mtime: st ? st.mtimeMs : Date.now(),
    };
  }

  async function newFile(dirRel, name, overwrite = false) {
    const { baseDir } = await cfg.getConfig();
    if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error("Invalid filename");

    const abs = path.resolve(baseDir, dirRel || ".", name);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");

    const st = await statSafe(abs);
    if (st && !overwrite) throw new Error("File exists");

    await fsp.writeFile(abs, "");
    const st2 = await statSafe(abs);
    return {
      ok: true,
      path: path.relative(baseDir, abs).replace(/\\/g, "/"),
      size: st2?.size || 0,
      mtime: st2?.mtimeMs || Date.now(),
    };
  }

  async function newFolder(dirRel, name) {
    const { baseDir } = await cfg.getConfig();
    if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error("Invalid folder name");

    const abs = path.resolve(baseDir, dirRel || ".", name);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");

    await fsp.mkdir(abs, { recursive: true });
    return { ok: true, path: path.relative(baseDir, abs).replace(/\\/g, "/") };
  }

  async function rename(rel, newName) {
    const { baseDir } = await cfg.getConfig();
    if (!newName || /[\\/:*?"<>|]/.test(newName)) throw new Error("Invalid name");

    const srcAbs = path.resolve(baseDir, rel);
    if (!withinBase(srcAbs, baseDir)) throw new Error("Path escapes baseDir");

    const dstAbs = path.resolve(path.dirname(srcAbs), newName);
    if (!withinBase(dstAbs, baseDir)) throw new Error("Path escapes baseDir");

    await fsp.rename(srcAbs, dstAbs);
    const st = await statSafe(dstAbs);
    return {
      ok: true,
      path: path.relative(baseDir, dstAbs).replace(/\\/g, "/"),
      size: st?.size || 0,
      mtime: st?.mtimeMs || Date.now(),
    };
  }

  async function remove(rel) {
    const { baseDir } = await cfg.getConfig();
    const abs = path.resolve(baseDir, rel);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");

    const st = await statSafe(abs);
    if (!st) throw new Error("Not found");

    if (st.isDirectory()) await fsp.rm(abs, { recursive: true, force: true });
    else await fsp.unlink(abs);

    return { ok: true };
  }

  async function statOne(rel) {
    const { baseDir } = await cfg.getConfig();
    const abs = path.resolve(baseDir, rel);
    if (!withinBase(abs, baseDir)) throw new Error("Path escapes baseDir");

    const st = await fsp.stat(abs);
    if (!st.isFile()) throw new Error("Not a file");

    return { size: st.size, mtime: st.mtimeMs };
  }

  return {
    // fs operations
    list,
    open,
    save,
    newFile,
    newFolder,
    rename,
    remove,
    statOne,
  };
}

module.exports = { createFsOps };
