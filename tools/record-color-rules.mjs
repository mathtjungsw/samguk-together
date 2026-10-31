// child('a/b') and child('a').child('b') are equivalent RTDB snapshots.
export function compactPaths(node){for(const [key,v]of Object.entries(node)){if(v&&typeof v==='object')compactPaths(v);else if(typeof v==='string'&&key.startsWith('.')){let next=v;do{const old=next;next=next.replace(/\.child\('([^']+)'\)\.child\('([^']+)'\)/g,(_,a,b)=>`.child('${a}/${b}')`);if(old===next)break;}while(true);node[key]=next;}}return node;}
export function recordColorRules(root){const w=root.rules.worlds.$world,p=w.players.$uid;
const cmd="newData.parent().parent().parent().child('command/type').val()=='start'",world="newData.parent().parent().parent()";
p.colorSlot={'.validate':`newData.isNumber()&&newData.val()>=0&&newData.val()<1000000&&newData.val()%1==0&&(newData.val()==data.val()||$uid==auth.uid&&${cmd})`};
p['.validate']+="&&(!data.hasChild('colorSlot')||newData.hasChild('colorSlot'))&&(!newData.hasChild('colorSlot')||newData.child('landCount').val()==0||newData.parent().parent().child('colorClaims').child(''+newData.child('colorSlot').val()).val()==$uid)";
const claimCmd=cmd.replaceAll('parent().parent().parent()','parent().parent()'),claimWorld=world.replaceAll('parent().parent().parent()','parent().parent()');
w.colorClaims={'$slot':{'.validate':`newData.val()==data.val()||(newData.isString()&&newData.val()==auth.uid&&${claimCmd}&&(''+${claimWorld}.child('players').child(auth.uid).child('colorSlot').val())==$slot&&(!data.exists()||data.val()==auth.uid||root.child('worlds').child($world).child('players').child(data.val()).child('landCount').val()==0))`}};
root.rules.recordVersions={'.read':w['.read']};return compactPaths(root);}
