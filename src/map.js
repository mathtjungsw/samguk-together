import {factionSignature,representativeFactions,layoutFactionLabels,interiorPoint,polygonArea,boxesOverlap} from './faction-labels.js';
import {factionColor} from './faction-colors.js';
import {warState,warLabel} from './war-map.js';
import * as d3 from 'd3';
import {MAP,COLORS,capacityOf} from './engine.js';
import {softenPoint,softenedSegment,sharedEdges,softenedLandPath} from './map-geometry.js';

// The map decoration shares border geometry; authoritative neighbors are unchanged.
export class TerritoryMap {
  constructor(container,onSelect,onCancel=()=>{},{factionLabels=true}={}){
    this.container=container;this.onSelect=onSelect;this.svg=d3.select(container.querySelector('svg'));this.zoom=d3.zoomIdentity;this.world=null;this.uid=null;this.source=null;this.target=null;this.width=0;this.height=0;
    container.querySelector('.map-viewport').addEventListener('contextmenu',event=>{if(event.pointerType==='touch'||event.button!==2)return;event.preventDefault();onCancel();});
    this.mode='overview';this.info='basic';this.highlight='';this.showFactionLabels=factionLabels;this.factions=[];this.factionFallbacks=new Map();
    let context;try{context=document.createElement('canvas').getContext?.('2d');}catch{}this.measure=(text,size=11)=>{if(!context)return Array.from(text).reduce((w,c)=>w+size*(c.codePointAt(0)>255?1:.62),0);context.font=`${size>11?'800':'400'} ${size}px "Malgun Gothic",sans-serif`;return context.measureText(text).width;};
    this.layoutById=new Map(MAP.layout.cells.map(c=>[c.id,c]));
    this.land=structuredClone(MAP.land);if(d3.geoArea(this.land)>2*Math.PI)this.land.geometry.coordinates.forEach(p=>p.forEach(r=>r.reverse()));
    const saved=MAP.layout.projection;
    this.original=d3.geoConicConformal().parallels([25,40]).rotate([-110,0]).scale(saved.scale).translate(saved.translate);
    this.landPath=softenedLandPath(this.land,this.original,d3);
    const geometry=new Map(sharedEdges(MAP.layout.cells).map(c=>[c.id,c]));
    this.cells=MAP.places.map(p=>{const cell=geometry.get(p.id),polygon=cell.polygon.flatMap((a,i)=>softenedSegment(a,cell.polygon[(i+1)%cell.polygon.length]).slice(0,-1)),point=softenPoint(this.original(p.coord));return {...p,path:cell.path,point,anchor:interiorPoint(polygon,point),area:polygonArea(polygon)};});
    this.zoomBehavior=d3.zoom().clickDistance(5).scaleExtent([1,4]).on('zoom',event=>{this.zoom=event.transform;this.geography?.attr('transform',this.zoom);this.scheduleLabels();});
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
    this.regions.append('path').attr('class','territory-shape').attr('d',p=>p.path);this.regions.append('title');
    regionLayer.append('path').attr('d',this.landPath).attr('filter','url(#game-map-grain)').attr('opacity',.045).attr('pointer-events','none');
    this.symbols=this.svg.append('g').attr('class','map-symbol-layer').attr('pointer-events','none');this.labelLayer=this.svg.append('g').attr('class','map-label-layer').attr('pointer-events','none');this.factionLayer=this.svg.append('g').attr('class','map-faction-layer').attr('pointer-events','none').attr('aria-hidden','true');
    this.zoomBehavior.extent([[0,0],[width,height]]).translateExtent([[-width*.2,-height*.2],[width*1.2,height*1.2]]);this.svg.call(this.zoomBehavior).call(this.zoomBehavior.transform,saved?d3.zoomIdentity.translate(width/2-(saved.x*this.ratio+this.offset[0])*saved.k,height/2-(saved.y*this.ratio+this.offset[1])*saved.k).scale(saved.k):d3.zoomIdentity);this.paint();
  }
  setWorld(world,uid,source,target){this.world=world;this.uid=uid;this.source=source;this.target=target;this.paint();}
  paint(){
    if(!this.world||!this.regions)return;
    if(this.showFactionLabels){const signature=factionSignature(this.world,this.cells);if(signature!==this.factionSignature){this.factionSignature=signature;this.factions=representativeFactions(this.world,this.cells,id=>this.layoutById.get(id)?.neighbors);this.factionFallbacks.clear();}}
    const state=warState(this.world,this.uid,this.source);this.war=state;this.container.dataset.view=this.mode;const sourceTerritory=this.world.territories[this.source];const neighbors=new Set(sourceTerritory?.owner===this.uid?this.layoutById.get(this.source)?.neighbors:[]);
    this.regions.attr('aria-label',p=>{const t=this.world.territories[p.id],owner=this.world.players[t.owner]?.name||'중립';return `${p.ko}, ${owner}, 병력 ${t.units.length}/${capacityOf(p.id,this.world)}명${neighbors.has(p.id)?', 인접 영토':''}`;}).classed('war-rear',p=>this.mode==='war'&&!state.focus.has(p.id)).classed('war-front',p=>this.mode==='war'&&state.front.has(p.id)).classed('war-open',p=>this.mode==='war'&&state.open.has(p.id)).classed('is-source',p=>p.id===this.source).classed('is-target',p=>p.id===this.target).classed('is-adjacent',p=>neighbors.has(p.id)).classed('is-dimmed',p=>!!this.highlight&&this.world.territories[p.id].owner!==this.highlight).classed('is-status',p=>{const t=this.world.territories[p.id];return t.owner===this.uid&&(this.info==='ready'?t.actionReadyAt<=(this.world.projectedAt||this.world.updatedAt):this.info==='full'?t.units.length>=capacityOf(t.id,this.world):false);});
    this.regions.select('title').text(p=>`${p.ko} · ${this.world.players[this.world.territories[p.id].owner]?.name||'중립'}`);
    this.regions.select('path').attr('fill',p=>{const t=this.world.territories[p.id];return t.owner?d3.interpolateRgb('#e7e5d1',factionColor(this.world,t.owner))(.56):p.rank==='citadel'?'#e4d8bd':p.rank==='stronghold'?'#d9dfc8':'#e1e3d0';});this.labels();
  }
  viewState(){return this.ratio?{k:this.zoom.k,x:((this.width/2-this.zoom.x)/this.zoom.k-this.offset[0])/this.ratio,y:((this.height/2-this.zoom.y)/this.zoom.k-this.offset[1])/this.ratio}:null;}
  restoreView(v){if(!v||!this.ratio||![v.k,v.x,v.y].every(Number.isFinite))return;const k=Math.max(1,Math.min(4,v.k));this.svg.call(this.zoomBehavior.transform,d3.zoomIdentity.translate(this.width/2-(v.x*this.ratio+this.offset[0])*k,this.height/2-(v.y*this.ratio+this.offset[1])*k).scale(k));}
  fitOwned(){const cells=this.cells.filter(p=>this.world.territories[p.id].owner===this.uid);if(!cells.length){this.svg.call(this.zoomBehavior.transform,d3.zoomIdentity);return;}if(cells.length===1){this.focusTerritory(cells[0].id);return;}const xs=cells.map(p=>p.point[0]*this.ratio+this.offset[0]),ys=cells.map(p=>p.point[1]*this.ratio+this.offset[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2,k=Math.max(1,Math.min(4,(this.width-70)/Math.max(80,Math.max(...xs)-Math.min(...xs)),(this.height-70)/Math.max(80,Math.max(...ys)-Math.min(...ys))));this.svg.call(this.zoomBehavior.transform,d3.zoomIdentity.translate(this.width/2-cx*k,this.height/2-cy*k).scale(k));}
  focusTerritory(id){const p=this.cells.find(p=>p.id===id);if(!p||!this.ratio)return;const k=Math.max(1.7,this.zoom.k),x=p.point[0]*this.ratio+this.offset[0],y=p.point[1]*this.ratio+this.offset[1];this.svg.transition().duration(280).call(this.zoomBehavior.transform,d3.zoomIdentity.translate(this.width/2-x*k,this.height/2-y*k).scale(k));}
  scheduleLabels(){if(this.labelFrame)return;this.labelFrame=requestAnimationFrame(()=>{this.labelFrame=null;this.labels();});}
  labels(){
    if(this.labelFrame){cancelAnimationFrame(this.labelFrame);this.labelFrame=null;}
    if(!this.cells||!this.world||!this.symbols)return;const width=this.width,height=this.height,k=this.zoom.k;
    const priority=new Set([this.source,this.target]),neighbors=new Set(this.source?this.layoutById.get(this.source)?.neighbors:[]);
    const screen=p=>[(p.point[0]*this.ratio+this.offset[0])*k+this.zoom.x,(p.point[1]*this.ratio+this.offset[1])*k+this.zoom.y];
    const candidates=this.cells.map(p=>({...p,screen:screen(p)})).filter(p=>p.screen[0]>10&&p.screen[0]<width-10&&p.screen[1]>10&&p.screen[1]<height-10)
      .sort((a,b)=>Number(b.id===this.source)-Number(a.id===this.source)||Number(b.id===this.target)-Number(a.id===this.target)||Number(neighbors.has(b.id))-Number(neighbors.has(a.id))||Number(this.world.territories[b.id].owner===this.uid)-Number(this.world.territories[a.id].owner===this.uid)||Number(b.major)-Number(a.major));
    const occupied=[],visible=[];
    const addCity=p=>{
      const [x,y]=p.screen,important=priority.has(p.id)||neighbors.has(p.id),eligible=important||p.major||k>1.7;
      if(!eligible)return;
      if(!priority.has(p.id)&&occupied.some(b=>boxesOverlap({x:x-10,y:y-12,w:20,h:23},b,1)))return;
      const count=this.world.territories[p.id].units.length,body=this.mode==='war'?warLabel(this.world,this.uid,this.world.territories[p.id],this.world.projectedAt||this.world.updatedAt):count;
      const label=(p.id===this.source?'출발 ':p.id===this.target?'목표 ':'')+p.ko+' '+body,w=Math.min(width-8,Math.ceil(this.measure(label,11))+12);let position;
      for(const dy of [-14,25,-31,42]){
        const box={x:Math.max(4,Math.min(width-w-4,x-w/2)),y:y+dy-12,w,h:16};
        if(box.y<4||box.y+box.h>height-4||occupied.some(b=>boxesOverlap(box,b,2)))continue;
        occupied.push(box);position={x:box.x+w/2,y:y+dy};break;
      }
      if(!position&&!important)return;
      occupied.push({x:x-11,y:y-12,w:22,h:23});visible.push({...p,label,position});
    };
    // Selected city orders remain readable before allocating country labels.
    for(const p of candidates.filter(p=>priority.has(p.id)))addCity(p);
    const protectedBoxes=[...occupied];
    const route=[this.source,this.target].map(id=>this.cells.find(p=>p.id===id)).filter(Boolean).map(screen);
    if(this.mode==='war'&&route.length===2&&neighbors.has(this.target)){
      const [a,b]=route,n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/10);
      for(let i=0;i<=n;i++)protectedBoxes.push({x:a[0]+(b[0]-a[0])*i/n-4,y:a[1]+(b[1]-a[1])*i/n-4,w:8,h:8});
    }
    const anchorScreen=cell=>screen({...cell,point:cell.anchor});
    const factions=layoutFactionLabels(this.showFactionLabels?this.factions:[],anchorScreen,{width,height,uid:this.uid,highlight:this.highlight,blocked:protectedBoxes,previous:this.factionFallbacks,measure:this.measure});
    this.factionFallbacks=factions.fallbacks;
    occupied.push(...factions.placements.filter(p=>!p.hidden).map(p=>p.box));
    this.drawFactions(factions.placements);
    for(const p of candidates.filter(p=>!priority.has(p.id)))addCity(p);
    const detailed=new Set(visible.map(p=>p.id));
    this.symbols.selectAll('circle.map-pin').data(candidates.filter(p=>!detailed.has(p.id)),p=>p.id).join('circle').attr('class','map-pin').attr('cx',p=>p.screen[0]).attr('cy',p=>p.screen[1]).attr('r',2);
    const nodes=this.symbols.selectAll('g.map-city').data(visible,p=>p.id).join(enter=>{const g=enter.append('g').attr('class','map-city');g.append('ellipse').attr('class','city-shadow').attr('cy',7).attr('rx',11).attr('ry',3);g.append('path').attr('class','city-wall');g.append('path').attr('class','city-roof');g.append('path').attr('class','city-door').attr('d','M-2 6V1Q0 -1 2 1V6Z');g.append('path').attr('class','city-flag');return g;});
    nodes.attr('transform',p=>`translate(${p.screen})`).classed('capital',p=>p.rank==='citadel').classed('chosen',p=>priority.has(p.id)).classed('war-rear',p=>this.mode==='war'&&!this.war?.focus.has(p.id));
    nodes.select('.city-wall').attr('d',p=>p.rank==='normal'?'M-5 5V-2H5V5Z':'M-10 6V-2H-7V-6H-3V-2H3V-6H7V-2H10V6Z');
    nodes.select('.city-roof').attr('d',p=>p.rank==='normal'?'M-7 -2L0 -7L7 -2Z':'M-12 -2L-8 -7L-4 -2ZM-5 -6L0 -11L5 -6ZM4 -2L8 -7L12 -2Z').attr('fill',p=>{const t=this.world.territories[p.id];return t.owner?factionColor(this.world,t.owner):p.rank==='citadel'?'#a77b45':'#54765b';});
    nodes.select('.city-flag').attr('d',p=>priority.has(p.id)?'M7 -5V-18L18 -15L7 -12':'');
    this.labelLayer.selectAll('text').data(visible.filter(p=>p.position),p=>p.id).join('text').attr('class',p=>'map-place-label '+(priority.has(p.id)?'priority':'')).attr('x',p=>p.position.x).attr('y',p=>p.position.y).attr('text-anchor','middle').classed('war-rear',p=>this.mode==='war'&&!this.war?.focus.has(p.id)).text(p=>p.label);
    const points=[this.source,this.target].map(id=>this.cells.find(p=>p.id===id)).filter(Boolean).map(screen);this.labelLayer.selectAll('path.war-arrow').data(this.mode==='war'&&points.length===2&&neighbors.has(this.target)?[points]:[]).join('path').attr('class','war-arrow').attr('d',p=>'M'+p[0]+' L'+p[1]).attr('marker-end','url(#attack-head)');if(!this.svg.select('#attack-head').size())this.svg.select('defs').append('marker').attr('id','attack-head').attr('viewBox','0 0 10 10').attr('refX',12).attr('refY',5).attr('markerWidth',6).attr('markerHeight',6).attr('orient','auto').append('path').attr('d','M 0 0 L 10 5 L 0 10 z').attr('fill','#b3513e');this.container.querySelector('[data-map-zoom]').textContent=Math.round(k*100)+'%';
  }
  drawFactions(placements){
    const nodes=this.factionLayer.selectAll('g.map-faction').data(placements,p=>p.uid).join(enter=>{
      const g=enter.append('g').attr('class','map-faction');g.append('title');g.append('line').attr('class','map-faction-leader');g.append('circle').attr('class','map-faction-dot');g.append('text').attr('class','map-faction-name');return g;
    });
    nodes.attr('data-faction',p=>p.uid).attr('data-territory',p=>p.cellId).classed('is-dimmed',p=>!!this.highlight&&this.highlight!==p.uid).classed('label-hidden',p=>p.hidden);
    nodes.sort((a,b)=>Number(!a.hidden)-Number(!b.hidden)||Number(a.uid===this.uid)-Number(b.uid===this.uid));
    nodes.select('title').text(p=>p.name);
    nodes.select('circle').attr('cx',p=>p.hidden?p.anchor[0]:p.box.x+8).attr('cy',p=>p.hidden?p.anchor[1]:p.box.y+3+p.fontSize*.55).attr('r',p=>p.hidden?3.5:4.5).attr('fill',p=>factionColor(this.world,p.uid));
    nodes.select('line').attr('display',p=>p.hidden?'none':null).attr('x1',p=>p.anchor[0]).attr('y1',p=>p.anchor[1]).attr('x2',p=>p.hidden?p.anchor[0]:Math.max(p.box.x,Math.min(p.box.x+p.box.w,p.anchor[0]))).attr('y2',p=>p.hidden?p.anchor[1]:Math.max(p.box.y,Math.min(p.box.y+p.box.h,p.anchor[1]))).attr('stroke',p=>factionColor(this.world,p.uid));
    nodes.select('text').attr('display',p=>p.hidden?'none':null).attr('x',p=>p.hidden?0:p.box.x+19).attr('y',p=>p.hidden?0:p.box.y+3+p.fontSize*.85).attr('font-size',p=>p.fontSize||15).each(function(p){
      const text=d3.select(this),key=p.lines.join('\n');
      if(this.dataset.lines!==key){text.selectAll('tspan').data(p.lines).join('tspan').text(line=>line);this.dataset.lines=key;}
      text.selectAll('tspan').attr('x',p.hidden?0:p.box.x+19).attr('dy',(_line,i)=>i?p.lineHeight:0);
    });
  }

}
