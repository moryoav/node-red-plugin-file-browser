const path = require("path");

function createFlowScanner(RED, cfg) {
  const DEBUG = false;

  // ---- helpers replicated from original ----
  function* collectStrings(node, depth = 0, maxDepth = 6) {
    if (depth > maxDepth || !node) return;
    if (typeof node === "string") {
      yield node;
      return;
    }
    if (Array.isArray(node)) {
      for (const v of node) {
        yield* collectStrings(v, depth + 1, maxDepth);
      }
      return;
    }
    if (typeof node === "object") {
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === "string") {
          yield v;
        } else if (typeof v === "object") {
          yield* collectStrings(v, depth + 1, maxDepth);
        }
      }
    }
  }

  const EXT_SET = new Set([
    "py", "js", "ts", "sh", "bat", "cmd", "ps1", "pl", "rb", "php",
    "json", "yaml", "yml", "ini", "txt", "md", "csv", "xml", "html",
    "css", "sql", "exe",
  ]);

  function tokenize(str) {
    const re = /"([^"]+)"|'([^']+)'|[^\s]+/g;
    const out = [];
    let m;
    while ((m = re.exec(str))) out.push(m[1] || m[2] || m[0]);
    return out;
  }

  function sanitizeToken(tok) {
    return tok.replace(/[;,]+$/, "");
  }

  function splitAssignment(tok) {
    const i = tok.indexOf("=");
    if (i > 0) return { key: tok.slice(0, i), value: tok.slice(i + 1) };
    return null;
  }

  function looksLikeFilePath(tok) {
    if (!tok || tok.length < 3) return false;
    if (tok.includes("://")) return false; // URL
    if (/[{}$`*<>|]/.test(tok)) return false; // templates/wildcards
    const t = tok.replace(/\\/g, "/");
    const last = t.split("/").pop();
    if (!last || !last.includes(".")) return false;
    const ext = last.split(".").pop().toLowerCase();
    return EXT_SET.has(ext);
  }

  function toAbsUnderBase(baseDir, candidate) {
    const isWinAbs = /^[A-Za-z]:[\\/]/.test(candidate);
    const isPosixAbs = candidate.startsWith("/") || candidate.startsWith("\\");
    return isWinAbs || isPosixAbs
      ? path.resolve(candidate)
      : path.resolve(baseDir, candidate);
  }

  function withinBase(abs, base) {
    const norm = path.normalize(abs);
    const baseN = path.normalize(base);
    return norm === baseN || norm.startsWith(baseN + path.sep);
  }

  async function statSafe(fs, abs) {
    try {
      return await fs.promises.stat(abs);
    } catch {
      return null;
    }
  }

  // Prefer runtime flows; then <baseDir>/flows.json; then settings.flowFile
  async function getActiveFlows(req, baseDir) {
    if (RED.runtime && RED.runtime.flows && typeof RED.runtime.flows.getFlows === "function") {
      try {
        const res = await RED.runtime.flows.getFlows({ user: req.user, req });
        if (res && Array.isArray(res.flows)) {
          if (DEBUG) RED.log.info(`[file-browser] getFlows(): ${res.flows.length} items (runtime)`);
          return { flows: res.flows, source: "runtime" };
        }
      } catch (e) {
        RED.log.warn(`[file-browser] runtime.flows.getFlows failed, falling back: ${e.message || e}`);
      }
    }

    const projectFlows = path.join(baseDir, "flows.json");
    try {
      const pj = await cfg.readJSON(projectFlows);
      if (pj) {
        const arr = Array.isArray(pj) ? pj : (pj.flows && Array.isArray(pj.flows) ? pj.flows : []);
        if (arr.length) {
          if (DEBUG) RED.log.info(`[file-browser] read project flows: ${projectFlows}, items=${arr.length}`);
          return { flows: arr, source: "project", flowFile: projectFlows };
        }
      }
    } catch {/* ignore */}

    let flowFile = RED.settings.flowFile;
    if (flowFile) {
      if (!path.isAbsolute(flowFile)) flowFile = path.resolve(cfg.USER_DIR, flowFile);
      try {
        const fj = await cfg.readJSON(flowFile);
        const arr = Array.isArray(fj) ? fj : (fj && Array.isArray(fj.flows) ? fj.flows : []);
        if (DEBUG) RED.log.info(`[file-browser] read flowFile: ${flowFile}, items=${arr.length}`);
        return { flows: arr, source: "file", flowFile };
      } catch (e) {
        RED.log.warn(`[file-browser] Could not read flowFile "${flowFile}": ${e.message || e}`);
      }
    }
    return { flows: [], source: "none" };
  }

  async function scanFlows(req) {
    const fs = require("fs");
    const { baseDir } = await cfg.getConfig();
    const { flows, source, flowFile } = await getActiveFlows(req, baseDir);

    const map = new Map(); // relPath -> { path, nodes:[{id,name,type}] }

    const counters = { nodes: 0, strings: 0, tokens: 0, pathlike: 0, withinBase: 0, existing: 0 };
    const details = [];
    const withinBaseArr = [];
    const notWithinArr = [];
    const samplesHit = [];
    const samplesMiss = [];

    for (const node of flows) {
      if (!node || typeof node !== "object") continue;
      counters.nodes++;
      const label =
        (node.name && String(node.name).trim()) ||
        `${node.type || "node"} (${(node.id || "").slice(0, 6)})`;

      for (const s of collectStrings(node)) {
        counters.strings++;
        for (let tok of tokenize(s)) {
          counters.tokens++;
          tok = sanitizeToken(tok);

          let candidate = tok;
          const assign = splitAssignment(tok);
          if (assign && assign.value) candidate = assign.value;

          if (!looksLikeFilePath(candidate)) continue;
          counters.pathlike++;

          const abs = toAbsUnderBase(baseDir, candidate);
          const inBase = withinBase(abs, baseDir);
          const st = await statSafe(fs, abs);
          const exists = !!st;
          const isFile = !!(st && st.isFile());
          const rel = path.relative(baseDir, abs).replace(/\\/g, "/");

          const row = { by: label, token: tok, candidate, abs, rel, inBase, exists, isFile };
          if (details.length < 50) details.push(row);
          if (inBase && withinBaseArr.length < 50) withinBaseArr.push(row);
          if (!inBase && notWithinArr.length < 50) notWithinArr.push(row);

          if (!inBase) continue;
          counters.withinBase++;

          let entry = map.get(rel);
          if (!entry) {
            entry = { path: rel, nodes: [] };
            map.set(rel, entry);
          }
          if (!entry.nodes.find((n) => n.id === node.id)) {
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
      RED.log.info(
        `[file-browser] scan summary: nodes=${counters.nodes} strings=${counters.strings} tokens=${counters.tokens} ` +
          `pathlike=${counters.pathlike} withinBase=${counters.withinBase} existing=${counters.existing} ` +
          `refs=${map.size} baseDir=${baseDir} source=${source}${flowFile ? " file=" + flowFile : ""}`
      );
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
        misses: samplesMiss,
      },
    };
  }

  return { scanFlows };
}

module.exports = { createFlowScanner };
