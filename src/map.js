import * as d3 from 'd3';
import {MAP,COLORS,capacityOf} from './engine.js';
import {softenPoint,sharedEdges,softenedLandPath} from './map-geometry.js';

// The map decoration shares border geometry; authoritative neighbors are unchanged.
export class TerritoryMap {
  constructor(container,onSelect,onCancel=()=>{}){
    this.container=container;this.onSelect=onSelect;this.svg=d3.select(container.querySelector('svg'));this.zoom=d3.zoomIdentity;this.world=null;this.uid=null;this.source=null;this.target=null;this.width=0;this.height=0;
    container.querySelector('.map-viewport').addEventListener('contextmenu',event=>{if(event.pointerType==='touch'||event.button!==2)return;event.preventDefault();onCancel();});
    this.info='basic';this.highlight='';
    this.layoutById=new Map(MAP.layout.cells.map(c=>[c.id,c]));
    this.land=structuredClone(MAP.land);if(d3.geoArea(this.land)>2*Math.PI)this.land.geometry.coordinates.forEach(p=>p.forEach(r=>r.reverse()));
    const saved=MAP.layout.projection;
    this.original=d3.geoConicConformal().parallels([25,40]).rotate([-110,0]).scale(saved.scale).translate(saved.translate);
    this.landPath=softenedLandPath(this.land,this.original,d3);
    const geometry=new Map(sharedEdges(MAP.layout.cells).map(c=>[c.id,c]));
    this.cells=MAP.places.map(p=>({...p,path:geometry.get(p.id).path,point:softenPoint(this.original(p.coord))}));
    this.zoomBehavior=d3.zoom().clickDistance(5).scaleExtent([1,4]).on('zoom',event=>{this.zoom=event.transform;this.geography?.attr('transform',this.zoom);this.labels();});
    container.querySelector('[data-zoom="in"]').onclick=()=>this.svg.call(this.zoomBehavior.scaleBy,1.4);
    container.querySelector('[data-zoom="out"]').onclick=()=>this.svg.call(this.zoomBehavior.scaleBy,1/1.4);
    container.querySelector('[data-zoom="all"]').onclick=()=>this.svg.call(this.zoomBehavior.transform,d3.zoomIdentity);
    this.observer=new ResizeObserver(()=>this.build());this.observer.observe(container.querySelector('.map-viewport'));this.build();
  }
  build(){
    const viewport=this.container.querySelector('.map-viewport'),width=Math.round(viewport.clientWidth),height=Math.round(viewport.clientHeight);
    if(width<100||height<100||width===this.width&&height===this.height)return;const saved=this.ratio?{k:this.zoom.k,x:((this.width/2-this.zoom.x)/this.zoom.k-this.offset[0])/this.ratio,y:((this.height/2-this.zoom.y)/this.zoom.k-this.offset[1])/this.ratio}:null;this.width=width;this.height=height;
    this.svg.attr('viewBox',`0 0 ${width} ${height}`).selectAll('*').remove();this.svg.append('title').text('삼국 90개 영토 지도');
    const projected=d3.geoConicConformal().parallels([25,40]).rotate([-110,0]).fitExtent([[20,18],[width-20,height-18]],this.land);
    this.ratio=projected.scale()/this.original.scale();const current=projected.translate(),old=this.original.translate();
    this.offset=[current[0]-old[0]*this.ratio,current[1]-old[1]*this.ratio];
    const defs=this.svg.append('defs');defs.append('clipPath').attr('id','game-land-clip').append('path').attr('d',this.landPath);
    const filter=defs.append('filter').attr('id','game-map-grain').attr('x','0%').attr('y','0%').attr('width','100%').attr('height','100%');
    filter.append('feTurbulence').attr('type','fractalNoise').attr('baseFrequency','.75').attr('numOctaves',3).attr('seed',8).attr('stitchTiles','stitch');filter.append('feColorMatrix').attr('type','saturate').attr('values',0);
    this.geography=this.svg.append('g');const base=this.geography.append('g').attr('transform',`translate(${this.offset}) scale(${this.ratio})`);
    base.append('path').attr('d',this.landPath).attr('class','map-land-shadow').attr('transform','translate(0,4)');base.append('path').attr('d',this.landPath).attr('class','map-land-base');
    const regionLayer=base.append('g').attr('clip-path','url(#game-land-clip)');
    this.regions=regionLayer.selectAll('a').data(this.cells,p=>p.id).join('a').attr('href','#').attr('role','button').attr('class','territory-link').on('click',(event,p)=>{if(event.defaultPrevented)return;event.preventDefault();this.onSelect(p.id);}).on('keydown',(event,p)=>{if(event.key===' '){event.preventDefault();this.onSelect(p.id);}});
    this.regions.append('path').attr('class','territory-shape').attr('d',p=>p.path);
    regionLayer.append('path').attr('d',this.landPath).attr('filter','url(#game-map-grain)').attr('opacity',.045).attr('pointer-events','none');
    this.symbols=this.svg.append('g').attr('class','map-symbol-layer').attr('pointer-events','none');this.labelLayer=this.svg.append('g').attr('class','map-label-layer').attr('pointer-events','none');
    this.zoomBehavior.extent([[0,0],[width,height]]).translateExtent([[-width*.2,-height*.2],[width*1.2,height*1.2]]);this.svg.call(this.zoomBehavior).call(this.zoomBehavior.transform,saved?d3.zoomIdentity.translate(width/2-(saved.x*this.ratio+this.offset[0])*saved.k,height/2-(saved.y*this.ratio+this.offset[1])*saved.k).scale(saved.k):d3.zoomIdentity);this.paint();
  }
  setWorld(world,uid,source,target){this.world=world;this.uid=uid;this.source=source;this.target=target;this.paint();}
  paint(){
    if(!this.world||!this.regions)return;
    const sourceTerritory=this.world.territories[this.source];const neighbors=new Set(sourceTerritory?.owner===this.uid?this.layoutById.get(this.source)?.neighbors:[]);
    this.regions.attr('aria-label',p=>{const t=this.world.territories[p.id],owner=this.world.players[t.owner]?.name||'중립';return `${p.ko}, ${owner}, 병력 ${t.units.length}/${capacityOf(p.id,this.world)}명${neighbors.has(p.id)?', 인접 영토':''}`;}).classed('is-source',p=>p.id===this.source).classed('is-target',p=>p.id===this.target).classed('is-adjacent',p=>neighbors.has(p.id)).classed('is-dimmed',p=>!!this.highlight&&this.world.territories[p.id].owner!==this.highlight).classed('is-status',p=>{const t=this.world.territories[p.id];return t.owner===this.uid&&(this.info==='ready'?t.actionReadyAt<=(this.world.projectedAt||this.world.updatedAt):this.info==='full'?t.units.length>=capacityOf(t.id,this.world):false);});
    this.regions.select('path').attr('fill',p=>{const t=this.world.territories[p.id];return t.owner?d3.interpolateRgb('#e7e5d1',COLORS[this.world.players[t.owner]?.color||0])(.56):p.rank==='citadel'?'#e4d8bd':p.rank==='stronghold'?'#d9dfc8':'#e1e3d0';});this.labels();
  }
  viewState(){return this.ratio?{k:this.zoom.k,x:((this.width/2-this.zoom.x)/this.zoom.k-this.offset[0])/this.ratio,y:((this.height/2-this.zoom.y)/this.zoom.k-this.offset[1])/this.ratio}:null;}
  restoreView(v){if(!v||!this.ratio||![v.k,v.x,v.y].every(Number.isFinite))return;const k=Math.max(1,Math.min(4,v.k));this.svg.call(this.zoomBehavior.transform,d3.zoomIdentity.translate(this.width/2-(v.x*this.ratio+this.offset[0])*k,this.height/2-(v.y*this.ratio+this.offset[1])*k).scale(k));}
  fitOwned(){const cells=this.cells.filter(p=>this.world.territories[p.id].owner===this.uid);if(!cells.length){this.svg.call(this.zoomBehavior.transform,d3.zoomIdentity);return;}if(cells.length===1){this.focusTerritory(cells[0].id);return;}const xs=cells.map(p=>p.point[0]*this.ratio+this.offset[0]),ys=cells.map(p=>p.point[1]*this.ratio+this.offset[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2,k=Math.max(1,Math.min(4,(this.width-70)/Math.max(80,Math.max(...xs)-Math.min(...xs)),(this.height-70)/Math.max(80,Math.max(...ys)-Math.min(...ys))));this.svg.call(this.zoomBehavior.transform,d3.zoomIdentity.translate(this.width/2-cx*k,this.height/2-cy*k).scale(k));}
  focusTerritory(id){const p=this.cells.find(p=>p.id===id);if(!p||!this.ratio)return;const k=Math.max(1.7,this.zoom.k),x=p.point[0]*this.ratio+this.offset[0],y=p.point[1]*this.ratio+this.offset[1];this.svg.transition().duration(280).call(this.zoomBehavior.transform,d3.zoomIdentity.translate(this.width/2-x*k,this.height/2-y*k).scale(k));}
  labels(){
    if(!this.cells||!this.world||!this.symbols)return;const width=this.width,height=this.height,k=this.zoom.k;
    const priority=new Set([this.source,this.target]),neighbors=new Set(this.source?this.layoutById.get(this.source)?.neighbors:[]);
    const screen=p=>[(p.point[0]*this.ratio+this.offset[0])*k+this.zoom.x,(p.point[1]*this.ratio+this.offset[1])*k+this.zoom.y];
    const candidates=this.cells.map(p=>({...p,screen:screen(p)})).filter(p=>p.screen[0]>10&&p.screen[0]<width-10&&p.screen[1]>10&&p.screen[1]<height-10)
      .sort((a,b)=>Number(b.id===this.source)-Number(a.id===this.source)||Number(b.id===this.target)-Number(a.id===this.target)||Number(neighbors.has(b.id))-Number(neighbors.has(a.id))||Number(this.world.territories[b.id].owner===this.uid)-Number(this.world.territories[a.id].owner===this.uid)||Number(b.major)-Number(a.major));
    const occupied=[],visible=[];
    for(const p of candidates){const [x,y]=p.screen,important=priority.has(p.id)||neighbors.has(p.id),eligible=important||p.major||k>1.7;
      if(!eligible||!important&&occupied.some(b=>x>b.x-13&&x<b.x+b.w+13&&y>b.y-13&&y<b.y+b.h+13))continue;
      const count=this.world.territories[p.id].units.length,label=`${p.ko} ${count}`,w=p.ko.length*11+String(count).length*7+13;let position;
      for(const dy of [-14,25]){const box={x:x-w/2,y:y+dy-12,w,h:16};if(box.x<3||box.x+box.w>width-3||box.y<3||box.y+box.h>height-3||occupied.some(b=>box.x<b.x+b.w+2&&box.x+box.w+2>b.x&&box.y<b.y+b.h+2&&box.y+box.h+2>b.y))continue;occupied.push(box);position={x,y:y+dy};break;}
      if(!position&&!important)continue;occupied.push({x:x-10,y:y-10,w:20,h:20});visible.push({...p,label,position});
    }
    const detailed=new Set(visible.map(p=>p.id));
    this.symbols.selectAll('circle.map-pin').data(candidates.filter(p=>!detailed.has(p.id)),p=>p.id).join('circle').attr('class','map-pin').attr('cx',p=>p.screen[0]).attr('cy',p=>p.screen[1]).attr('r',2);
    const nodes=this.symbols.selectAll('g.map-city').data(visible,p=>p.id).join(enter=>{const g=enter.append('g').attr('class','map-city');g.append('ellipse').attr('class','city-shadow').attr('cy',7).attr('rx',11).attr('ry',3);g.append('path').attr('class','city-wall');g.append('path').attr('class','city-roof');g.append('path').attr('class','city-door').attr('d','M-2 6V1Q0 -1 2 1V6Z');g.append('path').attr('class','city-flag');return g;});
    nodes.attr('transform',p=>`translate(${p.screen})`).classed('capital',p=>p.rank==='citadel').classed('chosen',p=>priority.has(p.id));
    nodes.select('.city-wall').attr('d',p=>p.rank==='normal'?'M-5 5V-2H5V5Z':'M-10 6V-2H-7V-6H-3V-2H3V-6H7V-2H10V6Z');
    nodes.select('.city-roof').attr('d',p=>p.rank==='normal'?'M-7 -2L0 -7L7 -2Z':'M-12 -2L-8 -7L-4 -2ZM-5 -6L0 -11L5 -6ZM4 -2L8 -7L12 -2Z').attr('fill',p=>{const t=this.world.territories[p.id];return t.owner?COLORS[this.world.players[t.owner]?.color||0]:p.rank==='citadel'?'#a77b45':'#54765b';});
    nodes.select('.city-flag').attr('d',p=>priority.has(p.id)?'M7 -5V-18L18 -15L7 -12':'');
    this.labelLayer.selectAll('text').data(visible.filter(p=>p.position),p=>p.id).join('text').attr('class',p=>'map-place-label '+(priority.has(p.id)?'priority':'')).attr('x',p=>p.position.x).attr('y',p=>p.position.y).attr('text-anchor','middle').text(p=>(p.id===this.source?'출발 ':p.id===this.target?'목표 ':'')+p.label);
    this.container.querySelector('[data-map-zoom]').textContent=Math.round(k*100)+'%';
  }
}
