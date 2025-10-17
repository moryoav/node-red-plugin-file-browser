// File: resources/file-browser/state.js
// Extracted "VIEW STATE MEMORY (v3)" logic from plugin.js – no behavior changes.
// Exposes the same function names globally so existing call sites remain untouched.
//
// It relies on a shared runtime context populated by plugin.js:
//   window.FB_CTX = { currentFile, editorKind, monacoEditor, textarea }
//
// Also uses the global DBG (from debug.js).

(function(){
  const VS_KEY_PREFIX = "fb-vs-v3::";     // per-file key (relative path only)
  let restoreInProgress = false;
  let restoreGuardUntil = 0;              // timestamp (ms) until we ignore scroll/cursor events
  let posDebounceTimer = null;

  function ctx(){ return (window.FB_CTX || {}); }
  function now(){ return Date.now(); }

  function keyFor(rel){ return VS_KEY_PREFIX + (rel||""); }
  function lsSet(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ DBG.log("lsSet error",e.message); } }
  function lsGet(k){ try{ const s=localStorage.getItem(k); return s?JSON.parse(s):null; }catch(e){ DBG.log("lsGet error",e.message); return null; } }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){ DBG.log("lsDel error",e.message); } }

  function startRestoreGuard(durationMs){
    restoreInProgress = true;
    restoreGuardUntil = now() + (durationMs||800);
    DBG.log("restore-guard-start", {until: restoreGuardUntil});
    setTimeout(()=>{ restoreInProgress = false; DBG.log("restore-guard-end"); }, durationMs||800);
  }
  function shouldIgnoreChanges(src){
    const ignore = restoreInProgress || now() < restoreGuardUntil;
    if (ignore) DBG.log("ignore-event", src, {restoreInProgress, now: now(), guardUntil: restoreGuardUntil});
    return ignore;
  }
  function sanitizeMonacoScroll(v){
    if (typeof v !== "number") return null;
    if (v < 0) return null; // invalid
    return v;
  }

  function saveViewState(tag){
    const { currentFile, editorKind, monacoEditor, textarea } = ctx();
    if (!currentFile) return;
    if (editorKind==="monaco" && monacoEditor){
      try {
        const vs = monacoEditor.saveViewState();
        const st = {
          kind: "monaco-vs",
          viewState: vs || null,
          scrollTop: sanitizeMonacoScroll(monacoEditor.getScrollTop()),
          scrollLeft: sanitizeMonacoScroll(monacoEditor.getScrollLeft())
        };
        if (st.scrollTop === null) { DBG.log("remember-skip-invalid", tag||"", currentFile, st); return; }
        if (shouldIgnoreChanges("remember-"+(tag||""))) return; // ignore during guard
        lsSet(keyFor(currentFile), st);
        DBG.log("remember", tag||"", currentFile, st);
      } catch(e){ DBG.log("remember error", e.message); }
    } else if (editorKind==="textarea" && textarea){
      const el = textarea[0]; if (!el) return;
      const st = {
        kind: "textarea-v2",
        selectionStart: (typeof el.selectionStart === "number") ? el.selectionStart : null,
        selectionEnd:   (typeof el.selectionEnd   === "number") ? el.selectionEnd   : null,
        scrollTop: el.scrollTop || 0,
        scrollLeft: el.scrollLeft || 0
      };
      if (shouldIgnoreChanges("remember-textarea-"+(tag||""))) return;
      lsSet(keyFor(currentFile), st);
      DBG.log("remember-textarea", tag||"", currentFile, st);
    }
  }

  function scheduleRemember(tag){
    if (posDebounceTimer) clearTimeout(posDebounceTimer);
    posDebounceTimer = setTimeout(()=>saveViewState(tag), 160);
  }

  function applyRestore(relPath, st){
    if (!st) return false;
    try{
      const { editorKind, monacoEditor, textarea } = ctx();
      if (editorKind==="monaco" && monacoEditor){
        if (st.viewState) {
          monacoEditor.restoreViewState(st.viewState);
          monacoEditor.focus();
          DBG.log("restore-applied-vs", relPath, {hasViewState:true});
        } else {
          const model = monacoEditor.getModel && monacoEditor.getModel();
          const maxLine = model ? Math.max(1, model.getLineCount()) : 1;
          const line = Math.max(1, Math.min(st.line||1, maxLine));
          const col  = Math.max(1, st.column||1);
          monacoEditor.setPosition({ lineNumber: line, column: col });
          if (typeof st.scrollTop  === "number" && st.scrollTop  >= 0) monacoEditor.setScrollTop(st.scrollTop);
          if (typeof st.scrollLeft === "number" && st.scrollLeft >= 0) monacoEditor.setScrollLeft(st.scrollLeft);
          monacoEditor.revealPositionInCenterIfOutsideViewport({ lineNumber: line, column: col });
          DBG.log("restore-applied-legacy", relPath, {line, col, scrollTop:st.scrollTop, scrollLeft:st.scrollLeft});
        }
        return true;
      } else if (editorKind==="textarea" && textarea){
        const el = textarea[0]; if (!el) return false;
        if (typeof st.selectionStart === "number" && typeof st.selectionEnd === "number") {
          el.selectionStart = st.selectionStart;
          el.selectionEnd   = st.selectionEnd;
        }
        if (typeof st.scrollTop  === "number" && st.scrollTop  >= 0) el.scrollTop  = st.scrollTop;
        if (typeof st.scrollLeft === "number" && st.scrollLeft >= 0) el.scrollLeft = st.scrollLeft;
        DBG.log("restore-applied-textarea", relPath, st);
        return true;
      }
    }catch(e){ DBG.log("restore error", e.message); }
    return false;
  }

  function restorePositionFor(relPath, opts){
    const { currentFile } = ctx();
    relPath = relPath || currentFile;
    if (!relPath) return;
    const st = lsGet(keyFor(relPath));
    DBG.log("restore-start", relPath, st);
    const retries = (opts&&opts.retries)||14;
    const delay   = (opts&&opts.delay)||60;
    let attempt = 0;

    startRestoreGuard((opts&&opts.guardMs) || 800);

    function tryApply(){
      attempt++;
      const ok = applyRestore(relPath, st);
      if (!ok && attempt < retries){
        setTimeout(tryApply, delay);
        DBG.log("restore-retry", relPath, {attempt, retries});
      } else {
        DBG.log("restore-done", relPath, {ok, attempt});
      }
    }
    setTimeout(tryApply, 0);
  }

  // Expose globals so plugin.js can call them without code changes.
  window.keyFor = keyFor;
  window.lsSet = lsSet;
  window.lsGet = lsGet;
  window.lsDel = lsDel;
  window.shouldIgnoreChanges = shouldIgnoreChanges;
  window.saveViewState = saveViewState;
  window.scheduleRemember = scheduleRemember;
  window.restorePositionFor = restorePositionFor;

  // Preserve the original behavior: remember position on unload.
  window.addEventListener("beforeunload", ()=>saveViewState("beforeunload"));
})();
