// Keep interactive campaign cards mounted while the command body's clocks tick.
// Compare the last source HTML: live countdown text and select values can differ
// from innerHTML without requiring replacement.
const panels=new WeakMap();
export function renderCommandPanel(root,prefixHTML,bodyHTML){
  let state=panels.get(root);
  if(!state||root.childElementCount!==2||root.firstElementChild!==state.prefix||root.lastElementChild!==state.body){
    const prefix=root.ownerDocument.createElement('div'),body=root.ownerDocument.createElement('div');
    prefix.dataset.commandRegion='campaign';body.dataset.commandRegion='body';
    root.replaceChildren(prefix,body);state={prefix,body,prefixHTML:null,bodyHTML:null};panels.set(root,state);
  }
  if(state.prefixHTML!==prefixHTML){state.prefix.innerHTML=prefixHTML;state.prefixHTML=prefixHTML;}
  if(state.bodyHTML!==bodyHTML){state.body.innerHTML=bodyHTML;state.bodyHTML=bodyHTML;}
}
