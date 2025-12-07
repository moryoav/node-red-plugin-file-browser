// File: resources/file-browser/plugin.js
// NOTE: View-state persistence code has been moved to state.js (loaded before this file).
// Everything else remains unchanged.

RED.plugins.registerPlugin("file-browser", {
  onadd: function() {
    ensureStyle();

    const $root   = $("<div>").css({position:"relative", height:"100%", display:"flex", gap:"8px"});

    // Left panel (tree + base controls)
    const $left   = $("<div>").css({width:"38%", minWidth:"280px", height:"100%", display:"flex", flexDirection:"column", borderRight:"1px solid var(--red-ui-secondary-background)"});
    const $leftHdr= $("<div>").css({
      padding:"8px",
      display:"grid",
      gridTemplateColumns:"auto 1fr auto auto", /* label | input | change | refresh */
      gap:"6px",
      alignItems:"center",
      borderBottom:"1px solid var(--red-ui-secondary-background)"
    });
    const $baseLabel = $('<span style="font-size:0.8em;opacity:0.8;white-space:nowrap;align-self:center;">Base:</span>');
    const $baseWrap  = $("<div>").css({display:"flex", alignItems:"center", width:"100%"});
    const $baseInput = $('<input type="text" readonly>').css({
      width:"100%", height:"28px", lineHeight:"26px", padding:"0 8px", fontSize:"0.85em", boxSizing:"border-box", margin:0
    });
    $baseWrap.append($baseInput);
    const $btnChangeBase= $('<button class="red-ui-button" title="Change base…"><i class="fa fa-folder-open"></i></button>');
    const $btnRefreshL  = $('<button class="red-ui-button" title="Refresh"><i class="fa fa-refresh"></i></button>');
    const $treeWrap= $("<div>").css({flex:"1 1 auto", overflow:"auto"});
    const $tree   = $("<div>").attr("id","fb-tree").css({padding:"6px"});

    const $treeHeader   = $("<div>").addClass("fb-tree-header");
    const $hdrName      = $('<span class="fb-tree-header-name">Name</span>');
    const $hdrModified  = $('<span class="fb-tree-header-mod">Modified</span>');
    $treeHeader.append($hdrName, $hdrModified);

    function applySortAndRender() {
      if (!lastList) return;
      renderTree(lastList);
    }

    $hdrName.on("click", ()=> {
      if (sortField === "name") {
        sortDir = (sortDir === "asc" ? "desc" : "asc");
      } else {
        sortField = "name";
        sortDir = "asc";
      }
      applySortAndRender();
    });

    $hdrModified.on("click", ()=> {
      if (sortField === "mtime") {
        sortDir = (sortDir === "asc" ? "desc" : "asc");
      } else {
        sortField = "mtime";
        sortDir = "asc";
      }
      applySortAndRender();
    });


    $leftHdr.append($baseLabel, $baseWrap, $btnChangeBase, $btnRefreshL);
    $treeWrap.append($tree);
    $left.append($leftHdr, $treeHeader, $treeWrap);


    // Right panel (editor + ops)
    const $right  = $("<div>").css({flex:"1 1 auto", height:"100%", display:"flex", flexDirection:"column"});
    const $toolbar= $("<div>").css({padding:"6px", display:"flex", gap:"6px", alignItems:"center", borderBottom:"1px solid var(--red-ui-secondary-background)"});
    const $crumb  = $("<div>").css({fontSize:"0.85em", opacity:0.8, flex:"1 1 auto", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"});

    const $btnNewFile    = $('<button class="red-ui-button"><i class="fa fa-file-o"></i> New file</button>');
    const $btnRenameFile = $('<button class="red-ui-button"><i class="fa fa-pencil"></i> Rename file</button>').prop("disabled", true);
    const $btnDeleteFile = $('<button class="red-ui-button"><i class="fa fa-trash"></i> Delete</button>').prop("disabled", true);
    const $btnNewDir     = $('<button class="red-ui-button"><i class="fa fa-folder-o"></i> New folder</button>');
    const $btnSave       = $('<button class="red-ui-button"><i class="fa fa-save"></i> Save</button>').prop("disabled", true);
    const $btnWrap = $('<button class="red-ui-button" title="Toggle word wrap"><i class="fa fa-align-left"></i> Wrap</button>')
      .on("click", ()=>{
        const on = !wrapEnabled();
        setWrapEnabled(on);
        applyWrap();
        $btnWrap.attr("title", "Toggle word wrap (currently "+(on?"ON":"OFF")+")");
        RED.notify(on ? "Wrap ON" : "Wrap OFF", "compact");
      });

    const $btnDebug      = $('<button class="red-ui-button fb-debug-toggle" title="Toggle debug"><i class="fa fa-bug"></i></button>')
      .on("click", ()=>{ const on = DBG.toggle(); RED.notify(on?"Debug ON":"Debug OFF","compact"); });

    const $editorHost = $("<div>").attr("id","fb-editor").css({flex:"1 1 auto", position:"relative", minHeight:"220px"});
    const $status     = $("<div>").css({padding:"4px 8px", borderTop:"1px solid var(--red-ui-secondary-background)", fontSize:"0.85em", opacity:0.8});

    // Keep original order; add bug button only if debug master is ON
    $toolbar.append($btnNewFile, $btnRenameFile, $btnDeleteFile, $btnNewDir, $btnSave, $crumb);
    $toolbar.append($btnWrap);
    if (fbDebugEnabled()) $toolbar.append($btnDebug);

    $right.append($toolbar, $editorHost, $status);
    $root.append($left, $right);

    // --- Context menu element and helpers ---
    const $ctx = $('<div class="fb-ctx" style="display:none;"></div>').appendTo(document.body);

    function hideCtx() {
      $ctx.hide().empty();
      $(document).off('mousedown.fbctx keydown.fbctx');
    }

    function showCtx(e, item) {
      hideCtx();

      // Build menu items based on item.type
      const rows = [];
      if (item.type === "file") {
        rows.push({ icon:"fa-file-text-o", label:"Open", fn: ()=> openFile(item.path) });
        rows.push({ icon:"fa-pencil",      label:"Rename", fn: ()=> renamePath(item.path) });
        rows.push({ type:"sep" });
        rows.push({ icon:"fa-trash",       label:"Delete file", fn: ()=> deletePath(item.path, false) });
      } else {
        rows.push({ icon:"fa-folder",      label:"Open", fn: ()=> loadList(item.path) });
        rows.push({ icon:"fa-file-o",      label:"New file here",   fn: ()=> newFileIn(item.path) });
        rows.push({ icon:"fa-folder-o",    label:"New folder here", fn: ()=> newFolderIn(item.path) });
        rows.push({ icon:"fa-pencil",      label:"Rename", fn: ()=> renamePath(item.path) });
        rows.push({ type:"sep" });
        rows.push({ icon:"fa-trash",       label:"Delete folder", fn: ()=> deletePath(item.path, true) });
      }

      for (const r of rows) {
        if (r.type === "sep") { $ctx.append('<div class="sep"></div>'); continue; }
        const $it = $('<div class="item"></div>');
        $it.append($('<i class="fa"></i>').addClass(r.icon));
        $it.append(document.createTextNode(r.label));
        $it.on('click', ()=> { hideCtx(); r.fn(); });
        $ctx.append($it);
      }

      // Position near mouse, clamped to viewport
      const vw = window.innerWidth, vh = window.innerHeight;
      const menuW = 220, menuH = 220;
      let x = e.clientX, y = e.clientY;
      if (x + menuW > vw) x = Math.max(8, vw - menuW - 8);
      if (y + menuH > vh) y = Math.max(8, vh - menuH - 8);
      $ctx.css({ left: x + "px", top: y + "px", display:"block" });

      // Dismiss on click elsewhere or Esc
      $(document).on('mousedown.fbctx', (ev)=>{ if (!$.contains($ctx[0], ev.target)) hideCtx(); });
      $(document).on('keydown.fbctx',  (ev)=>{ if (ev.key === "Escape") hideCtx(); });
    }


    // ---------- State ----------
    let baseInfo = { baseDir:"", userDir:"" };
    let currentDir = ".";
    let currentFile = null;
    let monacoEditor = null, textarea = null, editorKind = "none";
    let dirty = false;
	let selectedPath = null;
    
    let sortField = "name";    // "name" or "mtime"
    let sortDir   = "asc";     // "asc" or "desc"
    let lastList  = null;      // last list() response for re-sorting in place	
	let editorHotkeyInstalled = false;
	
    // Monaco persistent model state
    let editorModel = null;
    let editorModelUri = null;
    let currentTextCache = "";
    let suppressDirty = false;

    // on-disk tracking
    let lastDisk = { mtime: null, size: null };
    let statTimer = null;
    let onDiskChanged = false;

    // referenced files: path -> { names:[], ids:[] }
    let referencedMap = new Map();
    function formatMtime(ms) {
      if (!ms) return "";
      const d = new Date(ms);
      const pad = (n)=> String(n).padStart(2,"0");
      const yyyy = d.getFullYear();
      const mm   = pad(d.getMonth() + 1);
      const dd   = pad(d.getDate());
      const hh   = pad(d.getHours());
      const mi   = pad(d.getMinutes());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    }

    function sortItems(list) {
      if (!list || !Array.isArray(list.items)) return [];
      const items = list.items.slice(); // shallow copy

      items.sort((a, b) => {
        // keep directories before files
        if (a.type !== b.type) {
          return a.type === "dir" ? -1 : 1;
        }

        let cmp = 0;
        if (sortField === "mtime") {
          const am = a.mtime || 0;
          const bm = b.mtime || 0;
          cmp = am - bm;
        } else {
          // default: name
          cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        }

        // tie breaker by name
        if (cmp === 0) {
          cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        }

        return sortDir === "asc" ? cmp : -cmp;
      });

      return items;
    }

    function updateSortHeader() {
      const nameArrow = sortField === "name"
        ? (sortDir === "asc" ? " ▲" : " ▼")
        : "";
      const modArrow = sortField === "mtime"
        ? (sortDir === "asc" ? " ▲" : " ▼")
        : "";

      $hdrName.text("Name" + nameArrow);
      $hdrModified.text("Modified" + modArrow);
    }

    function refreshSelectedRow() {
      const $rows = $tree.find(".fb-row");
      $rows.removeClass("fb-row-selected");
      if (!selectedPath) return;
      $rows.each(function(){
        const $r = $(this);
        if ($r.data("path") === selectedPath) {
          $r.addClass("fb-row-selected");
        }
      });
    }
	
    // Expose a lightweight mirror so state.js can access what it needs.
    const FB_CTX = (window.FB_CTX = window.FB_CTX || {});
    function syncCtx(){
      FB_CTX.currentFile  = currentFile;
      FB_CTX.editorKind   = editorKind;
      FB_CTX.monacoEditor = monacoEditor;
      FB_CTX.textarea     = textarea;
    }
    syncCtx();

    function toast(msg,type){ try { RED.notify(msg,{type:type||"success",timeout:1800}); } catch(e){ RED.notify(msg,type||"success"); } }
    function notifyErr(x){ try { RED.notify(x,{type:"error",timeout:2500}); } catch(e){ RED.notify(x,"error"); } }
    function setStatus(t){ $status.text(t||""); }

    function layoutEditorSoon() {
      if (editorKind === "monaco" && monacoEditor) {
        requestAnimationFrame(() => {
          try { monacoEditor.layout(); } catch(e){}
        });
      }
    }

    function ensureMonacoModel(filename){
      if (editorKind !== "monaco" || !monacoEditor || !window.monaco) return;
      if (!editorModelUri) {
        editorModelUri = window.monaco.Uri.parse("inmemory://file-browser/current");
      }
      const lang = langFromFilename(filename||"");
      if (!editorModel || editorModel.isDisposed()) {
        editorModel = window.monaco.editor.createModel(currentTextCache || "", lang, editorModelUri);
        monacoEditor.setModel(editorModel);
      } else {
        window.monaco.editor.setModelLanguage(editorModel, lang);
        if (monacoEditor.getModel() !== editorModel) {
          monacoEditor.setModel(editorModel);
        }
      }
    }

    // ---------- Crumbs ----------
    function setCrumb(parts) {
      const segs = [];
      const acc = [];
      segs.push($('<a href="#">.</a>').on('click', (e)=>{ e.preventDefault(); loadList("."); }));
      (parts||[]).forEach((p)=>{
        acc.push(p);
        segs.push($('<span>/</span>'));
        segs.push($('<a href="#"></a>').text(p).on('click', (e)=>{ e.preventDefault(); loadList(acc.join("/")); }));
      });
      $crumb.empty().append(segs);
    }

    // ---------- Icons & rows ----------
    function iconFor(it, meta){
      const $ico = $('<i class="fa"></i>').addClass(it.type==="dir"?"fa-folder":"fa-file-text-o").css({width:"16px",marginRight:"6px"});
      if (it.type==="file" && meta) {
        const names = meta.names && meta.names.length ? meta.names : [];
        const tip = names.length
          ? `Click to reveal: ${names[0]}` + (names.length>1 ? `\nAlso in: ${names.slice(1,6).join(", ")}${names.length>6?` (+${names.length-6} more)`:``}` : ``)
          : "Referenced in flow(s)";
        const firstId = (meta.ids && meta.ids[0]) || null;
        const $mark = $('<i class="fa fa-link fb-ref-link"></i>').attr("title", tip);
        if (firstId) {
          $mark.on("click", (e)=>{ e.stopPropagation(); revealNodeById(firstId); });
        }
        return [$mark, $ico];
      }
      return [$ico];
    }
    function rowUp(){
      const $r=$('<div class="fb-row">').css({display:"flex",alignItems:"center",padding:"4px 2px",cursor:"pointer"});
      $r.append($('<i class="fa fa-level-up"></i>').css({width:"16px",marginRight:"6px"}), $('<span>').text(".."));
      $r.on('click', ()=>{ const parent = currentDir.split("/").filter(Boolean).slice(0,-1).join("/") || "."; loadList(parent); });
      return $r;
    }

    function renderTree(list){
      if (!list) return;
      lastList = list;		
      baseInfo.baseDir = list.baseDir || baseInfo.baseDir;
      baseInfo.userDir = list.userDir || baseInfo.userDir;
      $baseInput.val(baseInfo.baseDir || "");

      currentDir = list.cwd;
      setCrumb(list.breadcrumb);
      hideCtx();	  
      $tree.empty();
	  
	  updateSortHeader();
	  
      const rows=[];
      if (list.cwd!==".") rows.push(rowUp());
	  const items = sortItems(list);
	  
      items.forEach((it)=>{
        const meta = (it.type==="file") ? referencedMap.get(it.path) : null;
        const $r=$('<div class="fb-row">').css({display:"flex",alignItems:"center",padding:"4px 2px",cursor:"pointer"});
		$r.data("path", it.path);

        const icons = iconFor(it, meta);
        icons.forEach(n=> $r.append(n));

        const $name = $('<span>').text(it.name).css({flex:"1 1 auto"});
        if (meta && meta.names && meta.names.length) {
          $r.attr("title", "Referenced by: " + meta.names.join(", "));
        }
        $r.append($name);
		
        const $mtime = $('<span>')
          .text(formatMtime(it.mtime))
          .css({flex:"0 0 auto", fontSize:"0.8em", opacity:0.7, whiteSpace:"nowrap", marginLeft:"8px"});
        $r.append($mtime);
		
        if (it.type==="dir") $r.on('click', ()=> loadList(it.path));
        else $r.on('click', ()=> openFile(it.path));

        // right click context menu
        $r.on('contextmenu', (ev)=>{
          ev.preventDefault();
          ev.stopPropagation();
          showCtx(ev, it);
        });


        rows.push($r);
      });
      rows.forEach(r=>$tree.append(r));
	  refreshSelectedRow();
    }

    // ---------- Loaders ----------
    function loadConfigThenList() {
      ajax("GET", "filebrowser/config")
        .done((cfg)=>{ baseInfo = cfg || baseInfo; $baseInput.val(baseInfo.baseDir||""); scanFlows(); loadList("."); })
        .fail(()=>{ scanFlows(); loadList("."); });
    }

	function loadList(dir, opts) {
	  opts = opts || {};
	  return ajax("GET", "filebrowser/list?path=" + encodeURIComponent(dir))
		.done((res)=>{
		  renderTree(res);
		  if (!opts.silent) setStatus("Listed: " + res.cwd);
		})
		.fail((xhr)=>{
		  console.error("[file-browser] list error", xhr.status, xhr.responseText);
		  notifyErr("List error: " + (xhr.responseJSON?.error || xhr.statusText || xhr.status));
		});
	}



    // ---------- Flows scan (client) ----------
    function scanFlows() {
      ajax("GET","filebrowser/scan-flows")
        .done((res)=>{
          const map = new Map();
          if (res && Array.isArray(res.referenced)) {
            for (const item of res.referenced) {
              const rel = (item && item.path) ? String(item.path) : null;
              if (!rel) continue;
              const nodes = Array.isArray(item.nodes) ? item.nodes : [];
              const names = nodes.map(n => (n && n.name) ? String(n.name) : "").filter(Boolean);
              const ids   = nodes.map(n => (n && n.id)   ? String(n.id)   : "").filter(Boolean);
              map.set(rel, { names, ids });
            }
          }
          referencedMap = map;
          if ($tree.children().length) loadList(currentDir, { silent: true });
        })
        .fail((xhr)=>{ console.warn("[file-browser] scan-flows error", xhr.status, xhr.responseText); /* non-fatal */ });
    }

    function applyWrap(){
      const on = wrapEnabled();
      if (editorKind==="monaco" && monacoEditor){
        try { monacoEditor.updateOptions({ wordWrap: on ? "on" : "off" }); } catch(e){}
        layoutEditorSoon();
      } else if (editorKind==="textarea" && textarea){
        try {
          // textarea wrap control
          textarea.attr("wrap", on ? "soft" : "off");
          textarea.css("white-space", on ? "pre-wrap" : "pre");
          textarea.css("overflow", "auto");
        } catch(e){}
      }
    }

    function installEditorHotkey() {
      if (editorHotkeyInstalled) return;
      editorHotkeyInstalled = true;
      try {
        $editorHost[0].addEventListener("keydown", function(ev){
          const k = ev.key || ev.keyCode;
          const isS = (typeof k === "string" ? k.toLowerCase() === "s" : k === 83);
          if ((ev.ctrlKey || ev.metaKey) && isS) {
            if (!currentFile) return; // nothing to save
            ev.preventDefault();
            ev.stopPropagation();
            doSave();
          }
        }, true); // capture so we beat global handlers
      } catch(e) { /* ignore */ }
    }


    // ---------- Editor ----------
    function ensureEditorReady(){
      if (editorKind==="monaco" && monacoEditor) return Promise.resolve("monaco");
      if (editorKind==="textarea" && textarea)   return Promise.resolve("textarea");
      return MonacoReady().then(()=>{
        monacoEditor = window.monaco.editor.create($editorHost[0], { value:"", language:"plaintext", automaticLayout:true, minimap:{enabled:false} });

        editorModelUri = window.monaco.Uri.parse("inmemory://file-browser/current");
        editorModel = window.monaco.editor.createModel("", "plaintext", editorModelUri);
        monacoEditor.setModel(editorModel);
		installEditorHotkey();

        monacoEditor.onDidChangeModelContent(()=>{
          if (suppressDirty) {
            try { currentTextCache = monacoEditor.getValue(); } catch(e){}
            return;
          }
          if (currentFile){ markDirty(true); }
          try { currentTextCache = monacoEditor.getValue(); } catch(e){}
        });

        // View-state listeners (guarded)
        if (typeof monacoEditor.onDidScrollChange === "function") {
          monacoEditor.onDidScrollChange(()=>{ if (!shouldIgnoreChanges("scroll")) scheduleRemember("scroll"); });
        }
        if (typeof monacoEditor.onDidChangeCursorPosition === "function") {
          monacoEditor.onDidChangeCursorPosition(()=>{ if (!shouldIgnoreChanges("cursor")) scheduleRemember("cursor"); });
        }
        applyWrap();
        layoutEditorSoon();
        editorKind="monaco";
        syncCtx();

        if (currentFile) { restorePositionFor(currentFile); }
        return "monaco";
      }).catch(()=>{
        textarea = $("<textarea>").css({position:"absolute", inset:"0", width:"100%", height:"100%", fontFamily:"monospace", fontSize:"12px", padding:"8px", boxSizing:"border-box"});
        $editorHost.empty().append(textarea);
		installEditorHotkey();
		
	
        textarea.on("input", ()=>{ if (currentFile){ markDirty(true);} if (!shouldIgnoreChanges("ta-input")) scheduleRemember("input"); });
        textarea.on("scroll", ()=>{ if (!shouldIgnoreChanges("ta-scroll")) scheduleRemember("scroll"); });
        textarea.on("keyup", ()=>{ if (!shouldIgnoreChanges("ta-keyup")) scheduleRemember("keyup"); });
        applyWrap();
        editorKind="textarea";
        syncCtx();

        if (currentFile) { restorePositionFor(currentFile); }
        return "textarea";
      });
    }
    function langFromFilename(name){
      const ext=(name.split(".").pop()||"").toLowerCase();
      const map={js:"javascript",ts:"typescript",py:"python",json:"json",md:"markdown",html:"html",css:"css",yml:"yaml",yaml:"yaml",sh:"shell",bat:"bat",
                 c:"c",cpp:"cpp",h:"cpp",hpp:"cpp",java:"java",cs:"csharp",rs:"rust",go:"go",sql:"sql",xml:"xml",ini:"ini",toml:"toml",txt:"plaintext"};
      return map[ext] || "plaintext";
    }
    function setEditorContent(text, filename){
      if (editorKind==="monaco" && monacoEditor){
        ensureMonacoModel(filename);
        const v = String(text||"");
        suppressDirty = true;
        try { editorModel.setValue(v); } finally { suppressDirty = false; }
        currentTextCache = v;
        layoutEditorSoon();
        // Restore for the file currently open (with guard + retries)
        restorePositionFor(currentFile || filename, {retries:16, delay:60, guardMs:900});
      } else if (editorKind==="textarea" && textarea){
        textarea.val(text);
        restorePositionFor(currentFile || filename, {retries:12, delay:60, guardMs:700});
      }
    }
    function getEditorContent(){
      if (editorKind==="monaco" && monacoEditor) return monacoEditor.getValue();
      if (editorKind==="textarea" && textarea)   return textarea.val();
      return "";
    }

    // ---------- File ops ----------
    function openFile(relPath) {
      selectedPath = relPath;
      refreshSelectedRow();

      // Remember the previous file's position before switching
      saveViewState("switch-away");

      ajax("GET", "filebrowser/open?path="+encodeURIComponent(relPath))

        .done((res)=>{
          ensureEditorReady().then(()=>{
            currentFile=relPath;
            syncCtx();

            $btnRenameFile.prop("disabled", false);
            $btnDeleteFile.prop("disabled", false);
            lastDisk = { mtime: res.mtime || null, size: res.size || null };
            onDiskChanged = false;

            setEditorContent(res.text||"", relPath);
            markDirty(false);

            setStatus("Opened: "+relPath);
            startStatTimer();
            layoutEditorSoon();
          });
        })
        .fail((xhr)=>{ console.error("[file-browser] open error", xhr.status, xhr.responseText); notifyErr("Open error: "+(xhr.responseJSON?.error || xhr.statusText || xhr.status)); });
    }

    function doSave(){
      if (!currentFile) return;
      const text = getEditorContent();
      ajax("POST","filebrowser/save",{ path: currentFile, text })
        .done((r)=>{
          lastDisk = { mtime: r.mtime || Date.now(), size: r.size || (text||"").length };
          onDiskChanged = false;
          markDirty(false);
          setStatus("Saved: "+currentFile);
          toast("Saved","success");
          setTimeout(statCurrent, 500);
          saveViewState("after-save");
        })
        .fail((xhr)=>{ console.error("[file-browser] save error", xhr.status, xhr.responseText); notifyErr("Save error: "+(xhr.responseJSON?.error || xhr.statusText || xhr.status)); });
    }

    function doRename(){
      if (!currentFile) return;
      const oldPath = currentFile;
      const base = oldPath.split("/").pop();
      const newName = prompt("Rename file to:", base);
      if (newName == null) return;
      const trimmed = String(newName).trim();
      if (!trimmed || trimmed === base) return;
      if (/[\\/:*?"<>|]/.test(trimmed)) { notifyErr("Invalid filename."); return; }

      ajax("POST","filebrowser/rename",{ path: oldPath, newName: trimmed })
        .done((res)=>{
          const content = getEditorContent();
          const oldKey = keyFor(oldPath);
          const oldState = lsGet(oldKey);

          currentFile = res.path || (oldPath.split("/").slice(0,-1).concat([trimmed]).join("/"));
          selectedPath = currentFile;
          syncCtx();


          setEditorContent(content, currentFile);
          markDirty(false);

          if (typeof res.mtime === "number" || typeof res.size === "number") {
            lastDisk = { mtime: res.mtime || lastDisk.mtime, size: res.size ?? lastDisk.size };
          }
          if (oldState) { lsSet(keyFor(currentFile), oldState); lsDel(oldKey); DBG.log("migrate-viewstate", {from:oldPath,to:currentFile}); }
          setStatus("Renamed to: " + currentFile);
          toast("Renamed","success");
          loadList(currentDir);
          scanFlows();
        })
        .fail((xhr)=>{ console.error("[file-browser] rename error", xhr.status, xhr.responseText); notifyErr("Rename error: "+(xhr.responseJSON?.error || xhr.statusText || xhr.status)); });
    }

    function doDelete(){
      if (!currentFile) return;
      const name = currentFile.split("/").pop();
      const ok = confirm(`Delete "${name}" permanently?`);
      if (!ok) return;
      ajax("POST","filebrowser/delete",{ path: currentFile })
        .done(()=>{
          lsDel(keyFor(currentFile));
          stopStatTimer();
          setStatus("Deleted: " + name);
          toast("Deleted","success");
          currentFile = null;
          selectedPath = null;
          syncCtx();


          $btnRenameFile.prop("disabled", true);
          $btnDeleteFile.prop("disabled", true);
          markDirty(false);
          setEditorContent("", "");
          loadList(currentDir);
          scanFlows();
        })
        .fail((xhr)=>{ console.error("[file-browser] delete error", xhr.status, xhr.responseText); notifyErr("Delete error: "+(xhr.responseJSON?.error || xhr.statusText || xhr.status)); });
    }

    // ---------- Generic ops for context menu ----------
    function renamePath(relPath) {
      const base = relPath.split("/").pop();
      const newName = prompt("Rename to:", base);
      if (newName == null) return;
      const trimmed = String(newName).trim();
      if (!trimmed || trimmed === base) return;
      if (/[\\/:*?"<>|]/.test(trimmed)) { notifyErr("Invalid name."); return; }

      ajax("POST","filebrowser/rename",{ path: relPath, newName: trimmed })
        .done((res)=>{
          toast("Renamed","success");
          // If we had this file open, update currentFile and status
          if (currentFile && relPath === currentFile) {
            currentFile = res.path || (relPath.split("/").slice(0,-1).concat([trimmed]).join("/"));
            syncCtx();
            setStatus("Renamed to: " + currentFile);
          }
          loadList(currentDir, { silent: false });
          scanFlows();
        })
        .fail((xhr)=> notifyErr("Rename error: " + (xhr.responseJSON?.error || xhr.statusText || xhr.status)));
    }

    function deletePath(relPath, isDir) {
      const name = relPath.split("/").pop();
      const ok = confirm(`Delete ${isDir ? "folder" : "file"} "${name}" permanently${isDir ? " (recursively)" : ""}?`);
      if (!ok) return;

      ajax("POST","filebrowser/delete",{ path: relPath })
        .done(()=>{
          toast((isDir ? "Folder" : "File") + " deleted","success");

          if (!isDir && currentFile === relPath) {
            // Clear editor if we deleted the open file
            lsDel(keyFor(currentFile));
            stopStatTimer();
            currentFile = null;
            selectedPath = null;
            syncCtx();
            markDirty(false);
            setEditorContent("", "");
            setStatus("Deleted: " + name);
          } else {
            setStatus((isDir ? "Folder" : "File") + " deleted: " + name);
          }

          // If we deleted the folder we are currently viewing, step up
          if (isDir && currentDir === relPath) {
            const parent = currentDir.split("/").filter(Boolean).slice(0,-1).join("/") || ".";
            currentDir = parent;
          }

          loadList(currentDir, { silent: false });
          scanFlows();
        })
        .fail((xhr)=> notifyErr("Delete error: " + (xhr.responseJSON?.error || xhr.statusText || xhr.status)));
    }

    function newFileIn(dirPath) {
      const name = prompt("New file name:"); if (!name) return;
      ajax("POST","filebrowser/new-file",{ dir: dirPath, name })
        .done((res)=>{
          toast("File created","success");
          openFile(res.path);
          loadList(dirPath, { silent: true });
          scanFlows();
        })
        .fail((xhr)=> notifyErr("New file error: " + (xhr.responseJSON?.error || xhr.statusText || xhr.status)));
    }

    function newFolderIn(dirPath) {
      const name = prompt("New folder name:"); if (!name) return;
      ajax("POST","filebrowser/new-folder",{ dir: dirPath, name })
        .done((res)=>{
          toast("Folder created","success");
          currentDir = res.path;
          loadList(currentDir);
        })
        .fail((xhr)=> notifyErr("New folder error: " + (xhr.responseJSON?.error || xhr.statusText || xhr.status)));
    }

    // ---------- Save button state ----------
	function updateSaveAppearance() {
	  if (dirty) { $btnSave.prop("disabled", false).addClass("fb-danger"); }
	  else { $btnSave.prop("disabled", true).removeClass("fb-danger"); }

	  // Normalize the status text: remove any existing suffix, then re-apply if needed
	  const base = ($status.text() || "").replace(/\s*\(changed on disk\)$/, "");
	  if (onDiskChanged && base) $status.text(base + " (changed on disk)");
	  else if (!onDiskChanged)  $status.text(base);
	}

    function markDirty(val) { dirty = !!val; updateSaveAppearance(); }

    function stopStatTimer(){ if (statTimer){ clearInterval(statTimer); statTimer=null; } }
    function startStatTimer(){ stopStatTimer(); if (!currentFile) return; statTimer = setInterval(statCurrent, 5000); }
    function statCurrent() {
      if (!currentFile) return;
      ajax("GET", "filebrowser/stat?path="+encodeURIComponent(currentFile))
        .done(res=>{
          const changed = (lastDisk.mtime !== null && (res.mtime !== lastDisk.mtime || res.size !== lastDisk.size));
          onDiskChanged = !!changed;
          if (onDiskChanged) setStatus("Opened: "+currentFile+" (changed on disk)");
          else setStatus("Opened: "+currentFile);
          updateSaveAppearance();
        })
        .fail(()=>{ /* ignore */ });
    }

    // ---------- Controls ----------
    $btnRefreshL.on("click", ()=> { saveViewState("refresh-left"); scanFlows(); loadList(currentDir); });
    $btnChangeBase.on("click", ()=>{
      const suggested = (baseInfo.baseDir?.replace(/\/+$/,'') || "") + (currentDir && currentDir!=='.' ? '/'+currentDir : '');
      const abs = prompt(`Enter absolute base folder path inside userDir:\n(userDir: ${baseInfo.userDir})`,
                         suggested || baseInfo.baseDir || baseInfo.userDir || "");
      if (!abs) return;

      function onOk(cfg){
        baseInfo.baseDir = cfg.baseDir;
        $baseInput.val(baseInfo.baseDir);
        setStatus("Base set to: "+cfg.baseDir);
        toast("Base updated","success");
        scanFlows();
        loadList(".");
      }

      ajax("POST","filebrowser/set-base",{ path: abs })
        .done(onOk)
        .fail((xhr)=>{
          const j = xhr.responseJSON || {};
          if (xhr.status === 400 && j.code === "OUTSIDE_USERDIR") {
            const yn = confirm(
              `Warning: The selected folder is OUTSIDE Node-RED userDir.\n\n` +
              `userDir:\n${j.userDir}\n\nRequested:\n${j.requested}\n\n` +
              `This grants the Files panel access to that folder.\nProceed anyway?`
            );
            if (!yn) { notifyErr("Base not changed."); return; }

            ajax("POST","filebrowser/set-base",{ path: abs, force: true })
              .done(onOk)
              .fail((xhr2)=> notifyErr("Set base error: "+(xhr2.responseJSON?.error || xhr2.statusText || xhr2.status)));
          } else {
            notifyErr("Set base error: "+(j.error || xhr.statusText || xhr.status));
          }
        });
    });

    $btnSave.on("click", doSave);
    $btnRenameFile.on("click", doRename);
    $btnDeleteFile.on("click", doDelete);
	$btnNewFile.on("click", ()=>{
	  const name = prompt("New file name:"); if (!name) return;
	  ajax("POST","filebrowser/new-file",{ dir: currentDir, name })
		.done((res)=>{
		  setStatus("Created file: " + res.path);
		  toast("File created","success");
		  openFile(res.path);                       // sets “Opened: <file>”
		  loadList(currentDir, { silent: true })    // refresh tree without overwriting status
			.always(()=>{ scanFlows(); });          // keep your existing behavior
		})
		.fail((xhr)=> notifyErr("New file error: " + (xhr.responseJSON?.error || xhr.statusText || xhr.status)));
	});



	$btnNewDir.on("click", ()=>{
	  const name = prompt("New folder name:"); if (!name) return;
	  ajax("POST","filebrowser/new-folder",{ dir: currentDir, name })
		.done((res)=>{
		  setStatus("Created folder: " + res.path);
		  toast("Folder created","success");
		  currentDir = res.path;     // switch into the newly created folder
		  loadList(currentDir);      // show its contents
		})
		.fail((xhr)=> notifyErr("New folder error: " + (xhr.responseJSON?.error || xhr.statusText || xhr.status)));
	});

    // Warn + revive model when node editor closes
    RED.events.on("editor:close", ()=>{
      if (dirty) RED.notify("Unsaved changes in "+(currentFile||"file"),"warning");
      saveViewState("editor-close");
      setTimeout(()=>{
        if (editorKind==="monaco" && window.monaco) {
          if (!editorModel || editorModel.isDisposed()) {
            ensureMonacoModel(currentFile);
            suppressDirty = true;
            try { editorModel.setValue(currentTextCache); } finally { suppressDirty = false; }
            monacoEditor.setModel(editorModel);
          }
          layoutEditorSoon();
          restorePositionFor(currentFile, {retries:16, delay:60, guardMs:900});
        } else if (editorKind==="textarea") {
          restorePositionFor(currentFile, {retries:12, delay:60, guardMs:700});
        }
      }, 0);
    });

    // Rescan & layout after deploy; and handle resizes
    if (RED && RED.events && RED.events.on) {
      RED.events.on("deploy", ()=> { scanFlows(); });
    }
    RED.events.on("deploy", () => { setTimeout(()=>{ layoutEditorSoon(); restorePositionFor(currentFile, {guardMs:700}); }, 25); });
    RED.events.on("editor:open", () => { layoutEditorSoon(); setTimeout(()=>restorePositionFor(currentFile, {guardMs:700}), 0); });
    RED.events.on("editor:close", () => { setTimeout(layoutEditorSoon, 0); });
	RED.events.on && RED.events.on("workspace:resize", ()=>{ hideCtx(); layoutEditorSoon(); setTimeout(()=>restorePositionFor(currentFile, {guardMs:600}), 0); });
	RED.events.on && RED.events.on("sidebar:resize",   ()=>{ hideCtx(); layoutEditorSoon(); setTimeout(()=>restorePositionFor(currentFile, {guardMs:600}), 0); });
	window.addEventListener("resize", ()=>{ hideCtx(); layoutEditorSoon(); setTimeout(()=>restorePositionFor(currentFile, {guardMs:600}), 0); });


    // Sidebar tab
    RED.actions.add("file-browser:show", ()=> RED.sidebar.show("file-browser"));
    RED.sidebar.addTab({
      id:"file-browser", name:"Files", label:"Files", iconClass:"fa fa-files-o",
      content:$root, action:"file-browser:show", enableOnEdit:true, toolbar:null,
      onshow: function(){
        if (!$tree.children().length) loadConfigThenList();
        layoutEditorSoon();
        if (currentFile) restorePositionFor(currentFile, {guardMs:700});
        if (fbDebugEnabled()) DBG.ensurePanel();   // create panel only when master debug is ON
      }
    });

    // Kickoff
    setTimeout(()=>{ if (!$tree.children().length) loadConfigThenList(); }, 0);
  }
});
