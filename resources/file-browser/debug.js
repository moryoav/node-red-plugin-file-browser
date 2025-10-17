// ---- Debug master switch (OFF by default) ----
const FB_DEBUG_KEY = "filebrowser.debug";
const FB_DEBUG_DEFAULT = false; // set true to ship with debug ON by default
function fbDebugEnabled() {
  return localStorage.getItem(FB_DEBUG_KEY) === "1" || FB_DEBUG_DEFAULT;
}
// Console helpers to toggle without editing code:
window.FB_DEBUG_ON  = () => { localStorage.setItem(FB_DEBUG_KEY, "1"); location.reload(); };
window.FB_DEBUG_OFF = () => { localStorage.removeItem(FB_DEBUG_KEY); location.reload(); };

// ---------- Lightweight debug logger (no-op when master is OFF) ----------
const DBG = (() => {
  const buf = [];
  let enabled = false;   // panel visibility, separate from master switch
  let panel = null;
  function ts(){ return new Date().toISOString().slice(11,19); }
  function ensurePanel(){
    if (!fbDebugEnabled()) return null; // don't create panel when master off
    if (panel) return panel;
    panel = document.createElement("div");
    panel.className = "fb-debug-panel";
    panel.id = "fb-debug-panel";
    const pre = document.createElement("pre");
    pre.id = "fb-debug-pre";
    panel.appendChild(pre);
    document.body.appendChild(panel);
    return panel;
  }
  function render(){
    if (!fbDebugEnabled() || !panel) return;
    const pre = panel.querySelector("#fb-debug-pre");
    if (pre) pre.textContent = buf.join("\n");
  }
  return {
    log: (...a) => {
      if (!fbDebugEnabled()) return; // silent when master off
      const line = `[${ts()}] ${a.map(x=> (typeof x==='object'?JSON.stringify(x):String(x))).join(" ")}`;
      buf.push(line); if (buf.length>600) buf.shift();
      console.log("[file-browser]", ...a);
      render();
    },
    toggle: () => { // toggles panel visibility (only when master on)
      if (!fbDebugEnabled()) return false;
      enabled = !enabled;
      const p = ensurePanel();
      if (p) p.style.display = enabled ? "block" : "none";
      return enabled;
    },
    ensurePanel
  };
})();
