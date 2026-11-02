// seasonIndex is an archive index: the live season may be the following one.
export async function currentWorldId(api){
 const index=(await api.get('/seasonIndex.json')).body||{};
 let id=Object.keys(index).filter(x=>/^season-[1-9][0-9]*$/.test(x)).sort((a,b)=>+b.slice(7)-+a.slice(7))[0]||'season-1';
 for(let i=0;i<8;i++){
  if(!(await api.get('/worlds/'+id+'/season/endedAt.json')).body)return id;
  const next='season-'+(+id.slice(7)+1);
  if((await api.get('/worlds/'+next+'/season/id.json')).body!==next)return id;
  id=next;
 }
 throw Error('현재 시즌 이동 횟수를 확인해 주세요.');
}
