const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

function createConfig(RED) {
  const USER_DIR = path.resolve(RED.settings.userDir || process.cwd());
  const CONFIG_FILE = path.join(USER_DIR, ".filebrowser.config.json");
  const settingsDefault = RED.settings.get("fileBrowser") || {};
  const DEFAULT_MAX = settingsDefault.maxBytes || 5 * 1024 * 1024; // 5MB

  async function readJSON(file) {
    try {
      return JSON.parse(await fsp.readFile(file, "utf8"));
    } catch {
      return null;
    }
  }

  async function writeJSON(file, obj) {
    const tmp = file + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
    await fsp.rename(tmp, file);
  }

  async function getConfig() {
    const fromFile = await readJSON(CONFIG_FILE);
    const baseDir = path.resolve(
      (fromFile && fromFile.baseDir) || settingsDefault.baseDir || USER_DIR
    );
    const maxBytes = (fromFile && fromFile.maxBytes) || DEFAULT_MAX;
    return { baseDir, maxBytes };
  }

  async function setConfig(newCfg) {
    const cfg = await getConfig();
    const merged = {
      baseDir: newCfg.baseDir ? path.resolve(newCfg.baseDir) : cfg.baseDir,
      maxBytes:
        typeof newCfg.maxBytes === "number" ? newCfg.maxBytes : cfg.maxBytes,
    };
    await writeJSON(CONFIG_FILE, merged);
    return merged;
  }

  return {
    USER_DIR,
    CONFIG_FILE,
    DEFAULT_MAX,
    getConfig,
    setConfig,
    readJSON,
    writeJSON,
  };
}

module.exports = { createConfig };
