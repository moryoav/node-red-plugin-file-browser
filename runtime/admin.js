module.exports = function (RED) {
  const path = require("path");

  const { createConfig } = require("./lib/config");
  const { createFsOps } = require("./lib/fsops");
  const { createFlowScanner } = require("./lib/flowscan");

  // --- init helpers bound to this RED instance ---
  const cfg = createConfig(RED);
  const fsops = createFsOps(cfg);
  const scanner = createFlowScanner(RED, cfg);

  // --- permissions ---
  const needsRead = RED.auth.needsPermission("file-browser.read");
  const needsWrite = RED.auth.needsPermission("file-browser.write");
  const needsFlowsRead = RED.auth.needsPermission("flows.read");

  // --- small util used by set-base (same semantics as before) ---
  function isPathInside(child, parent) {
    const rel = path.relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  }

  // --- routes (unchanged behavior) ---
  RED.httpAdmin.get("/filebrowser/config", needsRead, async (req, res) => {
    try {
      res.json(await cfg.getConfig());
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  // relaxed set-base with "force" outside userDir
  RED.httpAdmin.post("/filebrowser/set-base", needsWrite, async (req, res) => {
    try {
      const wantedRaw = String(req.body?.path || "").trim();
      if (!wantedRaw) return res.status(400).json({ error: "Missing path" });

      const wanted = path.resolve(wantedRaw);
      const inside = isPathInside(wanted, cfg.USER_DIR);

      if (!inside && !req.body?.force) {
        return res.status(400).json({
          error: "Requested base is outside userDir",
          code: "OUTSIDE_USERDIR",
          userDir: cfg.USER_DIR,
          requested: wanted,
        });
      }

      const out = await cfg.setConfig({ baseDir: wanted });
      return res.json({ baseDir: out.baseDir, userDir: cfg.USER_DIR });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  RED.httpAdmin.get("/filebrowser/list", needsRead, async (req, res) => {
    try {
      res.json(await fsops.list(req.query.path || "."));
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  RED.httpAdmin.get("/filebrowser/open", needsRead, async (req, res) => {
    try {
      res.json(await fsops.open(req.query.path));
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  RED.httpAdmin.get("/filebrowser/stat", needsRead, async (req, res) => {
    try {
      res.json(await fsops.statOne(req.query.path));
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  RED.httpAdmin.get("/filebrowser/scan-flows", needsFlowsRead, async (req, res) => {
    try {
      const result = await scanner.scanFlows(req);
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.json(result);
    } catch (e) {
      RED.log.warn(`[file-browser] scan-flows error: ${e.message || e}`);
      res.json({ referenced: [], debug: { error: String(e.message || e) } });
    }
  });

  RED.httpAdmin.post("/filebrowser/save", needsWrite, async (req, res) => {
    try {
      const { path: rel, text } = req.body || {};
      if (!rel) throw new Error("Missing path");
      res.json(await fsops.save(rel, text));
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  RED.httpAdmin.post("/filebrowser/new-file", needsWrite, async (req, res) => {
    try {
      const { dir, name, overwrite } = req.body || {};
      res.json(await fsops.newFile(dir || ".", name, !!overwrite));
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  RED.httpAdmin.post("/filebrowser/new-folder", needsWrite, async (req, res) => {
    try {
      const { dir, name } = req.body || {};
      res.json(await fsops.newFolder(dir || ".", name));
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  RED.httpAdmin.post("/filebrowser/rename", needsWrite, async (req, res) => {
    try {
      const { path: rel, newName } = req.body || {};
      res.json(await fsops.rename(rel, newName));
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  RED.httpAdmin.post("/filebrowser/delete", needsWrite, async (req, res) => {
    try {
      const { path: rel } = req.body || {};
      res.json(await fsops.remove(rel));
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  // --- startup log ---
  cfg
    .getConfig()
    .then((c) => {
      RED.log.info(`[file-browser] baseDir=${c.baseDir} (userDir=${cfg.USER_DIR})`);
    })
    .catch(() => {
      RED.log.info(`[file-browser] using userDir=${cfg.USER_DIR}`);
    });
};
