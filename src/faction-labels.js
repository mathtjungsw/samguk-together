// Map presentation only: no state writes, recruitment rules or network reads.
const compare=(a,b)=>a<b?-1:a>b?1:0;
const distance=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2;
export function polygonArea(points){return Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);}
export function containsPoint(points,[x,y]){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [ax,ay]=points[j],[bx,by]=points[i],cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
    if(Math.abs(cross)<1e-7&&x>=Math.min(ax,bx)-1e-7&&x<=Math.max(ax,bx)+1e-7&&y>=Math.min(ay,by)-1e-7&&y<=Math.max(ay,by)+1e-7)return true;
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}
export function interiorPoint(polygon,preferred){
  if(!polygon?.length)return preferred;
  if(containsPoint(polygon,preferred))return preferred;
  const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
  // A bounded interior search also works for a concave cell whose centroid is outside.
  let best=null,bestDistance=Infinity;
  for(let y=0;y<25;y++)for(let x=0;x<25;x++){
    const point=[left+w*(x+.5)/25,top+h*(y+.5)/25];
    if(containsPoint(polygon,point)&&distance(point,preferred)<bestDistance){best=point;bestDistance=distance(point,preferred);}
  }
  return best||polygon[0];
}
export function factionSignature(world,cells){
  return JSON.stringify([world.season?.id||world.mapId,cells.map(c=>{const owner=world.territories?.[c.id]?.owner||'';return [c.id,owner,world.players?.[owner]?.name||''];})]);
}
export function representativeFactions(world,cells,neighbors){
  const groups=new Map(),byId=new Map(cells.map(c=>[c.id,c]));
  for(const cell of cells){const uid=world.territories?.[cell.id]?.owner,name=world.players?.[uid]?.name;if(!uid||typeof name!=='string'||!name.trim())continue;if(!groups.has(uid))groups.set(uid,[]);groups.get(uid).push(cell);}
  return [...groups].sort(([a],[b])=>compare(a,b)).map(([uid,owned])=>{
    const remaining=new Set(owned.map(c=>c.id)),components=[];
    while(remaining.size){const ids=[...remaining].sort(compare),queue=[ids[0]],component=[];remaining.delete(ids[0]);
      for(let i=0;i<queue.length;i++){const id=queue[i];component.push(byId.get(id));for(const next of neighbors(id)||[])if(remaining.delete(next))queue.push(next);}
      component.sort((a,b)=>compare(a.id,b.id));components.push(component);
    }
    components.sort((a,b)=>b.length-a.length||compare(a[0].id,b[0].id));
    const main=components[0],center=main.reduce((p,c)=>[p[0]+c.anchor[0]/main.length,p[1]+c.anchor[1]/main.length],[0,0]);
    const representative=[...main].sort((a,b)=>distance(a.anchor,center)-distance(b.anchor,center)||(b.area||0)-(a.area||0)||compare(a.id,b.id))[0];
    return {uid,name:world.players[uid].name,count:owned.length,representative:representative.id,cells:owned};
  });
}
export const boxesOverlap=(a,b,gap=3)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
const graphemes=text=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(text)].map(x=>x.segment):Array.from(text);
const roughMeasure=(text,size)=>Array.from(text).reduce((w,c)=>w+size*(c.codePointAt(0)>255?1:.62),0);
function textVariants(name,size,maxWidth,measure){
  const chars=graphemes(name),variants=[];
  if(measure(name,size)<=maxWidth)variants.push([name]);
  // Balanced two-line names precede abbreviations; keep the full name in the data.
  let split=null,score=Infinity;
  for(let i=1;i<chars.length;i++){
    const lines=[chars.slice(0,i).join('').trimEnd(),chars.slice(i).join('').trimStart()],widths=lines.map(t=>measure(t,size));
    if(Math.max(...widths)<=maxWidth&&Math.abs(widths[0]-widths[1])<score){split=lines;score=Math.abs(widths[0]-widths[1]);}
  }
  if(split)variants.push(split);
  for(const limit of [8,5,3])if(chars.length>limit){const text=chars.slice(0,limit).join('')+'…';if(measure(text,size)<=maxWidth&&!variants.some(v=>v.length===1&&v[0]===text))variants.push([text]);}
  return variants;
}
export function layoutFactionLabels(factions,screen,{width,height,uid='',highlight='',blocked=[],previous=new Map(),measure=roughMeasure}={}){
  const visible=p=>p&&p[0]>=12&&p[0]<=width-12&&p[1]>=12&&p[1]<=height-12;
  const occupied=[...blocked],placements=[],next=new Map(),mobile=width<600;
  const sorted=[...factions].sort((a,b)=>Number(b.uid===uid)-Number(a.uid===uid)||Number(b.uid===highlight)-Number(a.uid===highlight)||b.count-a.count||compare(a.uid,b.uid));
  for(const faction of sorted){
    const inView=faction.cells.filter(c=>visible(screen(c))),canonical=inView.find(c=>c.id===faction.representative);
    if(!inView.length)continue;
    const cell=canonical||inView.find(c=>c.id===previous.get(faction.uid))||[...inView].sort((a,b)=>distance(screen(a),[width/2,height/2])-distance(screen(b),[width/2,height/2])||compare(a.id,b.id))[0];
    next.set(faction.uid,cell.id);const anchor=screen(cell);let placed=null;
    for(const fontSize of mobile?[15,14,13]:[18,16]){
      const maxTextWidth=Math.min(mobile?132:180,width-46),lineHeight=fontSize*1.18;
      for(const lines of textVariants(faction.name,fontSize,maxTextWidth,measure)){
        const w=Math.ceil(Math.max(...lines.map(t=>measure(t,fontSize))))+26,h=Math.ceil(lines.length*lineHeight)+6;
        const offsets=[[0,-23-h],[0,21],[-w/2-17,-h/2],[w/2+17,-h/2],[0,-38-h],[0,36]];
        for(const [dx,dy]of offsets){
          const box={x:Math.max(4,Math.min(width-w-4,anchor[0]-w/2+dx)),y:Math.max(4,Math.min(height-h-4,anchor[1]+dy)),w,h};
          if(w>width-8||h>height-8||occupied.some(b=>boxesOverlap(box,b)))continue;
          placed={...faction,cellId:cell.id,anchor,box,lines,fontSize,lineHeight,hidden:false};break;
        }
        if(placed)break;
      }
      if(placed)break;
    }
    if(placed){occupied.push(placed.box);placements.push(placed);}
    else placements.push({...faction,cellId:cell.id,anchor,hidden:true,lines:[]});
  }
  return {placements,occupied,fallbacks:next};
}
