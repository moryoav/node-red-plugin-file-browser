// ---------- Reveal & pulse helpers ----------
function nodeElementById(id) { return document.querySelector('[data-nodeid="'+id+'"]'); }
function revealNodeById(nodeId) {
  const n = RED.nodes.node(nodeId);
  if (!n) { RED.notify("Node not found in current flows","warning"); return; }
  if (n.z && RED.workspaces && typeof RED.workspaces.show === "function") { RED.workspaces.show(n.z); }
  const doFlash = () => {
    try { if (RED.view && typeof RED.view.reveal === "function") { RED.view.reveal(n.id, true); } } catch(e){}
    const el = nodeElementById(n.id);
    if (el) {
      el.classList.add("fb-flash");
      setTimeout(()=>{ el.classList.remove("fb-flash"); }, 1800);
    } else if (RED.view && typeof RED.view.select === "function") {
      try { RED.view.select(n); } catch(e){}
    }
  };
  window.requestAnimationFrame(()=> setTimeout(doFlash, 50));
}
