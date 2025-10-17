// ---- Word wrap preference (OFF by default) ----
const FB_WRAP_KEY = "filebrowser.wordwrap";
const FB_WRAP_DEFAULT = false; // default disabled
function wrapEnabled(){
  const v = localStorage.getItem(FB_WRAP_KEY);
  return v ? v === "1" : FB_WRAP_DEFAULT;
}
function setWrapEnabled(on){
  if (on) localStorage.setItem(FB_WRAP_KEY, "1");
  else localStorage.removeItem(FB_WRAP_KEY);
}
