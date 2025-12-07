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
    
	/* context menu */
	.fb-ctx {
	  position: fixed;
	  z-index: 10000;
	  background: var(--red-ui-secondary-background);
	  border: 1px solid var(--red-ui-secondary-border-color, #ccc);
	  border-radius: 6px;
	  min-width: 180px;
	  box-shadow: 0 8px 24px rgba(0,0,0,.20);
	  padding: 4px 0;
	  user-select: none;

	  /* font, Windows-like */
	  font-family: system-ui, -apple-system, "Segoe UI Variable", "Segoe UI",
				   Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif;
	  font-size: 13px;
	  line-height: 1.25;
	}
    .fb-ctx .item {
      padding: 6px 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }
    .fb-ctx .item:hover {
      background: var(--red-ui-primary-background);
      color: var(--red-ui-primary-text-color);
    }
    .fb-ctx .sep {
      height: 1px;
      background: var(--red-ui-secondary-border-color, #ddd);
      margin: 4px 0;
    }
    .fb-ctx .item .fa { width: 14px; text-align: center; }
    .fb-row-selected {
      background: var(--red-ui-secondary-background-alt, #e5e5e5);
    }	
    .fb-tree-header {
      display:flex;
      align-items:center;
      padding:4px 6px;
      font-size:0.8em;
      text-transform:uppercase;
      opacity:0.8;
      border-bottom:1px solid var(--red-ui-secondary-background);
      user-select:none;
    }
    .fb-tree-header span {
      cursor:pointer;
      white-space:nowrap;
    }
    .fb-tree-header-name {
      flex:1 1 auto;
      display:flex;
      align-items:center;
      gap:4px;
    }
    .fb-tree-header-mod {
      flex:0 0 auto;
      text-align:right;
      padding-left:8px;
    }	
  `;
  const s = document.createElement("style");
  s.id = "fb-style";
  s.textContent = css;
  document.head.appendChild(s);
}
