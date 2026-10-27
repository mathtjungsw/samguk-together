// A globally one-to-one deformation shared by land, borders and city points.
// The displacement derivative norm is below 0.51, so adjacency is preserved.
export function softenPoint([x,y]){return [x+9*Math.sin(y/30)+4*Math.sin((x+y)/46),y+8*Math.sin(x/34)+3*Math.sin((x-y)/43)];}
const pointKey=([x,y])=>`${x.toFixed(6)},${y.toFixed(6)}`;
export const pointText=point=>point.map(n=>Number(n.toFixed(3))).join(',');
export function softenedSegment(a,b){const count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3));return Array.from({length:count+1},(_,i)=>softenPoint([a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count]));}
export function sharedEdges(cells){
  const edges=new Map();const key=(a,b)=>{const x=pointKey(a),y=pointKey(b);return x<y?[`${x}|${y}`,false]:[`${y}|${x}`,true];};
  for(const c of cells)for(let i=0;i<c.polygon.length;i++){const a=c.polygon[i],b=c.polygon[(i+1)%c.polygon.length],[id,reversed]=key(a,b);if(!edges.has(id))edges.set(id,softenedSegment(reversed?b:a,reversed?a:b));}
  return cells.map(c=>({...c,path:'M'+c.polygon.flatMap((a,i)=>{const [id,reversed]=key(a,c.polygon[(i+1)%c.polygon.length]),points=edges.get(id);return (reversed?[...points].reverse():points).slice(0,-1);}).map(pointText).join('L')+'Z'}));
}
export function softenedLandPath(land,projection,d3){
  let parts=[],ring=[];const context={moveTo(x,y){ring=[[x,y]];},lineTo(x,y){ring.push([x,y]);},closePath(){const points=ring.flatMap((a,i)=>softenedSegment(a,ring[(i+1)%ring.length]).slice(0,-1));if(points.length)parts.push('M'+points.map(pointText).join('L')+'Z');}};
  d3.geoPath(projection,context)(land);return parts.join('');
}
