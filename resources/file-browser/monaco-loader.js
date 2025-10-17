// ---------- Monaco loader (with textarea fallback) ----------
function loadScript(src){
  return new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src=src;s.onload=res;s.onerror=()=>rej(new Error("load fail "+src));
    document.head.appendChild(s);
  });
}
const MonacoReady=(function(){let p=null;return function(){
  if(p)return p;
  p=new Promise(async(res,rej)=>{
    if(window.monaco&&window.monaco.editor)return res(window.monaco);
    if(!window.require){
      try{await loadScript("https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.53.0/min/vs/loader.min.js");}
      catch(e){return rej(e);}
    }
    try{
      window.require.config({paths:{vs:"https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.53.0/min/vs"}});
      window.require(["vs/editor/editor.main"],()=>window.monaco&&window.monaco.editor?res(window.monaco):rej(new Error("monaco init failed")));
    }catch(e){rej(e);}
  });
  return p;
};})();
