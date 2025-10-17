// ---------- Styles for pulse highlight ----------
function ensureStyle() {
  if (document.getElementById("fb-style")) return;
  const css = `
    .fb-row { display:flex; align-items:center; padding:4px 2px; cursor:pointer; }
    .fb-ref-link { opacity:0.9; margin-right:6px; cursor:pointer; }
    .fb-ref-link:hover { opacity:1; }
    @keyframes fb-node-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(66,165,245,0.95); }
      70%  { box-shadow: 0 0 0 10px rgba(66,165,245,0); }
      100% { box-shadow: 0 0 0 0 rgba(66,165,245,0); }
    }
    .fb-flash {
      animation: fb-node-pulse 1.8s ease-out 0s 1;
      outline: 2px solid var(--red-ui-primary-background, #268bd2);
      outline-offset: 2px;
      border-radius: 6px;
    }
    .red-ui-button.fb-danger:not(.disabled){
      background-color: #d9534f;
      color: #000000 !important;
      border-color: #b52b27;
      font-weight: 600;
      text-shadow: 0 1px 0 rgba(0,0,0,0.35);
    }
    .red-ui-button.fb-danger:not(.disabled):hover{ filter: brightness(0.95); }
    .fb-debug-panel {
      position: absolute; right: 8px; bottom: 8px; width: 460px; max-height: 50%;
      overflow:auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px; background: rgba(0,0,0,0.78); color:#cfe3ff; border-radius: 8px;
      padding: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.25); z-index: 50; display:none;
    }
    .fb-debug-panel pre { margin:0; white-space:pre-wrap; word-break:break-word; }
    .fb-debug-toggle { margin-left: 6px; }
  `;
  const s = document.createElement("style");
  s.id = "fb-style";
  s.textContent = css;
  document.head.appendChild(s);
}
